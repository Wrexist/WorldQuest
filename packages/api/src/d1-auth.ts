import { AccountChangedError } from './ports.js'

export interface ProtectedStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}
export interface D1Session { userId: string; token: string; expiresAt: number }
export type D1SessionStatus = 'missing' | 'active' | 'renewal-due' | 'renewal-pending' | 'expired'
export interface D1Challenge { challengeId: string; expiresAt: number; purpose: 'link' | 'login' | 'delete'; email: string; resendAt?: number }
export interface D1Account { userId: string; audience: 'unknown' | 'protected' | 'eligible'; email: string | null; revision: number; xp: number; coins: number }
export type AuthFetch = (url: string, init: RequestInit) => Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>
export class D1AuthError extends Error {
  constructor(readonly code: string, readonly status = 0, readonly retryChallenge?: D1Challenge) { super(code); this.name = 'D1AuthError' }
}
const STATE_KEY = 'd1.auth.state.v1'
const RENEWAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
function session(value: unknown): D1Session {
  if (!record(value) || typeof value.userId !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value.userId) || !hex(value.token)
    || typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)) throw new D1AuthError('INVALID_RESPONSE')
  return { userId: value.userId, token: value.token, expiresAt: value.expiresAt }
}

/** Independent auth transport. The caller commits account/cache transitions only after these promises resolve. */
export function createD1AuthClient(options: {
  baseURL: string; storage: ProtectedStorage; clearCredentials: () => Promise<void>; fetch: AuthFetch
  /** Native callers supply the OS cryptographic generator; never use Math.random. */
  randomBytes?: () => Promise<Uint8Array>; now?: () => number
}) {
  const base = new URL(options.baseURL)
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '10.0.2.2'].includes(base.hostname))) throw new D1AuthError('INSECURE_ENDPOINT')
  if (base.username || base.password || base.search || base.hash) throw new D1AuthError('INVALID_ENDPOINT')
  const origin = base.href.replace(/\/$/, '')
  // Browser fetch checks its receiver; do not invoke it as a method of our options.
  const transport = options.fetch
  let closed = false, changing = false
  let chain: Promise<unknown> = Promise.resolve()
  let erased = false, erasing: Promise<void> | null = null
  const now = options.now ?? Date.now
  const assertOpen = () => { if (closed) throw new AccountChangedError() }
  function erase(): Promise<void> {
    if (erased) return Promise.resolve()
    if (erasing) return erasing
    const work = Promise.resolve().then(() => options.clearCredentials()).then(() => { erased = true })
      .finally(() => { erasing = null })
    erasing = work
    return work
  }
  async function load(): Promise<D1Session | null> {
    assertOpen()
    const raw = await options.storage.getItem(STATE_KEY)
    assertOpen()
    if (raw === null) return null
    try {
      const value: unknown = JSON.parse(raw)
      if (!record(value) || value.version !== 1) throw new Error('Invalid state')
      if (value.renewal !== undefined && value.renewal !== null && !hex(value.renewal)) throw new Error('Invalid renewal')
      return session(value.session)
    } catch { throw new D1AuthError('CREDENTIALS_INVALID') }
  }
  async function request(path: string, token: string | undefined, body?: unknown): Promise<Record<string, unknown>> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    let result: Awaited<ReturnType<AuthFetch>>
    let value: unknown
    try { result = await transport(origin + path, { method: body === undefined ? 'GET' : 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      value = await result.json()
    }
    finally { clearTimeout(timeout) }
    if (!record(value)) throw new D1AuthError('INVALID_RESPONSE')
    if (!result.ok) {
      const error = new D1AuthError(typeof value.error === 'string' ? value.error : 'SERVICE_UNAVAILABLE', result.status)
      // Only the email request wrapper may interpret the server's retry context.
      throw Object.assign(error, { response: value })
    }
    return value
  }
  async function revoke(token: string): Promise<void> {
    try { await request('/v1/auth/logout', token, {}) } catch { /* Local logout also works offline. */ }
  }
  async function accept(value: unknown, expectedOwner?: string): Promise<D1Session> {
    const next = session(value)
    try {
      assertOpen()
      if (expectedOwner && next.userId !== expectedOwner) throw new D1AuthError('OWNER_CHANGED')
      // Session replacement and challenge removal are one protected write. A
      // later cleanup failure must not leave an unacknowledged new account active.
      await options.storage.setItem(STATE_KEY, JSON.stringify({ version: 1, session: next, challenge: null }))
      assertOpen()
      return next
    } catch (error) {
      // A failed protected write must never leave a usable but unacknowledged login.
      await revoke(next.token)
      throw error
    }
  }
  /**
   * One credential operation at a time, in the order asked.
   *
   * Every operation may write the vault (a renewal rotates the token), so they never
   * overlap. They used to refuse instead of waiting (`AUTH_BUSY`), which was right for
   * two owner changes racing and wrong for everything else: the app asks for a session
   * from several places at once (progress, the quest, a lesson, a background prefetch),
   * and one of them always lost. So reads and session checks now wait their turn;
   * a second owner change while one is in flight is still refused.
   */
  async function transition<T>(operation: () => Promise<T>, changesOwner = true): Promise<T> {
    assertOpen()
    if (changesOwner) {
      if (changing) throw new D1AuthError('AUTH_BUSY')
      changing = true
    }
    const run = async () => { assertOpen(); return operation() }
    const next = chain.then(run, run)
    chain = next.catch(() => {})
    try { return await next } finally { if (changesOwner) changing = false }
  }
  async function required(): Promise<D1Session> {
    const s = await load()
    if (!s) throw new D1AuthError('AUTH_REQUIRED', 401)
    return s
  }
  async function renewal(): Promise<string | null> {
    await required()
    const raw = await options.storage.getItem(STATE_KEY)
    assertOpen()
    try {
      const value: unknown = raw ? JSON.parse(raw) : null
      if (!record(value) || value.version !== 1) throw new Error('Invalid state')
      if (value.renewal === undefined || value.renewal === null) return null
      if (!hex(value.renewal)) throw new Error('Invalid renewal')
      return value.renewal
    } catch { throw new D1AuthError('CREDENTIALS_INVALID') }
  }
  async function renew(): Promise<D1Session> {
    const current = await required(), challenge = await pending()
    let replacement = await renewal()
    if (!replacement) {
      if (current.expiresAt > now() + RENEWAL_WINDOW_MS) return current
      const bytes = options.randomBytes ? await options.randomBytes() : crypto.getRandomValues(new Uint8Array(32))
      assertOpen()
      if (!(bytes instanceof Uint8Array) || bytes.length !== 32) throw new D1AuthError('RANDOM_UNAVAILABLE')
      replacement = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
      if (replacement === current.token) throw new D1AuthError('RANDOM_UNAVAILABLE')
      // The old bearer and its replacement survive a crash before OR after D1
      // commits. Never send the replacement until protected storage accepts it.
      await options.storage.setItem(STATE_KEY, JSON.stringify({ version: 1, session: current, challenge, renewal: replacement }))
      assertOpen()
    }
    try {
      const next = session(await request('/v1/auth/renew', current.token, { replacement }))
      assertOpen()
      if (next.userId !== current.userId || next.token !== replacement) throw new D1AuthError('INVALID_RESPONSE')
      await options.storage.setItem(STATE_KEY, JSON.stringify({ version: 1, session: next, challenge, renewal: null }))
      assertOpen()
      return next
    } catch (error) {
      // Unlike first login, renewal has an already persisted retry credential.
      // Keep it after network/secure-write failures; logout revokes the family.
      if (closed) await revoke(replacement)
      else if (error instanceof D1AuthError && (error.code === 'SESSION_NOT_DUE' || error.code === 'SESSION_EXPIRED')) {
        await options.storage.setItem(STATE_KEY, JSON.stringify({ version: 1, session: current, challenge, renewal: null }))
        assertOpen()
        // Server time decides the window. An early device clock must not strand
        // a valid session behind a pending renewal that was never committed.
        if (error.code === 'SESSION_NOT_DUE') return current
      }
      throw error
    }
  }
  async function ready(): Promise<D1Session> {
    const current = await required()
    const interrupted = await renewal()
    return interrupted || current.expiresAt <= now() + RENEWAL_WINDOW_MS ? renew() : current
  }
  async function resumeRenewal(): Promise<D1Session> {
    return await renewal() ? renew() : required()
  }
  async function saveChallenge(value: Record<string, unknown>, purpose: D1Challenge['purpose'], email: string) {
    assertOpen()
    if (!hex(value.challengeId) || typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)) throw new D1AuthError('INVALID_RESPONSE')
    if (value.resendAt !== undefined && (typeof value.resendAt !== 'number' || !Number.isFinite(value.resendAt))) throw new D1AuthError('INVALID_RESPONSE')
    const c: D1Challenge = { challengeId: value.challengeId, expiresAt: value.expiresAt, purpose, email,
      ...(typeof value.resendAt === 'number' ? { resendAt: value.resendAt } : {}) }
    const current = await required()
    await options.storage.setItem(STATE_KEY, JSON.stringify({ version: 1, session: current, challenge: c }))
    assertOpen()
    return c
  }
  async function pending(): Promise<D1Challenge | null> {
    assertOpen()
    const raw = await options.storage.getItem(STATE_KEY)
    assertOpen()
    if (!raw) return null
    try {
      const value: unknown = JSON.parse(raw)
      if (!record(value) || value.version !== 1) throw new Error('Invalid state')
      if (value.challenge === null) return null
      const c = value.challenge
      if (!record(c) || !hex(c.challengeId) || typeof c.expiresAt !== 'number' || !Number.isFinite(c.expiresAt)
        || typeof c.email !== 'string' || (c.purpose !== 'link' && c.purpose !== 'login' && c.purpose !== 'delete')) throw new Error('Invalid challenge')
      if (c.resendAt !== undefined && (typeof c.resendAt !== 'number' || !Number.isFinite(c.resendAt))) throw new Error('Invalid cooldown')
      return { challengeId: c.challengeId, expiresAt: c.expiresAt, email: c.email, purpose: c.purpose,
        ...(typeof c.resendAt === 'number' ? { resendAt: c.resendAt } : {}) }
    } catch { throw new D1AuthError('CREDENTIALS_INVALID') }
  }
  return {
    endpoint: origin,
    restore: load, pending,
    sessionStatus: async (): Promise<D1SessionStatus> => {
      const current = await load()
      if (!current) return 'missing'
      if (await renewal()) return 'renewal-pending'
      return current.expiresAt <= now() ? 'expired' : current.expiresAt <= now() + RENEWAL_WINDOW_MS ? 'renewal-due' : 'active'
    },
    ensureSession: () => transition(ready, false),
    startGuest: () => transition(async () => {
      const existing = await load()
      if (existing) return ready()
      return accept(await request('/v1/auth/guest', undefined, {}))
    }),
    account: () => transition(async (): Promise<D1Account> => {
      const s = await ready(), value = await request('/v1/account', s.token)
      assertOpen()
      if (value.userId !== s.userId || (value.audience !== 'unknown' && value.audience !== 'protected' && value.audience !== 'eligible')
        || (value.email !== null && typeof value.email !== 'string')
        || typeof value.revision !== 'number' || !Number.isFinite(value.revision)
        || typeof value.xp !== 'number' || !Number.isFinite(value.xp)
        || typeof value.coins !== 'number' || !Number.isFinite(value.coins)) throw new D1AuthError('INVALID_RESPONSE')
      return { userId: s.userId, audience: value.audience, email: value.email,
        revision: value.revision, xp: value.xp, coins: value.coins }
    }, false),
    recordAudience: (birthYear: number) => transition(async () => {
      const s = await ready(), value = await request('/v1/account/audience', s.token, { birthYear })
      assertOpen(); return value.audience
    }),
    requestEmail: (email: string, purpose: D1Challenge['purpose'], locale: 'en' | 'sv') => transition(async () => {
      const s = await ready(), address = email.trim().toLowerCase()
      try { return await saveChallenge(await request('/v1/auth/email/request', s.token, { email: address, purpose, locale }), purpose, address) }
      catch (error) {
        if (error instanceof D1AuthError && error.code === 'EMAIL_UNAVAILABLE' && 'response' in error && record(error.response) && hex(error.response.challengeId)) {
          const c = await saveChallenge(error.response, purpose, address)
          throw new D1AuthError(error.code, error.status, c)
        }
        throw error
      }
    }),
    resendEmail: () => transition(async () => {
      const s = await ready(), c = await pending()
      if (!c) throw new D1AuthError('CHALLENGE_REQUIRED')
      try {
        const value = await request('/v1/auth/email/resend', s.token, { challengeId: c.challengeId })
        assertOpen(); return await saveChallenge(value, c.purpose, c.email)
      } catch (error) {
        if (error instanceof D1AuthError && error.code === 'EMAIL_UNAVAILABLE' && 'response' in error && record(error.response)) {
          const retry = await saveChallenge(error.response, c.purpose, c.email)
          throw new D1AuthError(error.code, error.status, retry)
        }
        throw error
      }
    }),
    verifyEmail: (code: string) => transition(async (): Promise<D1Session | { deleted: true }> => {
      const s = await resumeRenewal(), c = await pending()
      if (!c) throw new D1AuthError('CHALLENGE_REQUIRED')
      const result = await request('/v1/auth/email/verify', s.token, { challengeId: c.challengeId, code })
      if (c.purpose === 'delete') {
        assertOpen()
        if (result.deleted !== true) throw new D1AuthError('INVALID_RESPONSE')
        closed = true
        try { await erase() } catch { throw new D1AuthError('CREDENTIAL_CLEANUP_REQUIRED') }
        return { deleted: true }
      }
      return accept(result, c.purpose === 'link' ? s.userId : undefined)
    }),
    deleteGuest: () => transition(async () => {
      const s = await resumeRenewal(), value = await request('/v1/account/delete', s.token, {})
      assertOpen()
      if (value.deleted !== true) throw new D1AuthError('INVALID_RESPONSE')
      closed = true
      try { await erase() } catch { throw new D1AuthError('CREDENTIAL_CLEANUP_REQUIRED') }
      return { deleted: true as const }
    }),
    signOut: async () => {
      // Invalidate completions synchronously, before waiting for storage/network.
      closed = true
      if (erased) return
      let s: D1Session | null = null
      let replacement: string | null = null
      try {
        const raw = await options.storage.getItem(STATE_KEY), value: unknown = raw ? JSON.parse(raw) : null
        if (record(value) && value.version === 1) {
          s = session(value.session)
          if (hex(value.renewal)) replacement = value.renewal
        }
      } catch { /* Erasure still runs after an unreadable credential. */ }
      const results = await Promise.allSettled([erase(), s ? revoke(s.token) : Promise.resolve(), replacement ? revoke(replacement) : Promise.resolve()])
      if (results[0].status === 'rejected') throw results[0].reason
    },
  }
}
