import { D1AuthError } from '@worldquest/api/d1-auth'
import type { D1AccountClient, D1AccountHost } from '../features/account/useD1Account.js'

export type D1LocalStore = { get: (key: string) => string | null; set: (key: string, value: string) => void; remove: (key: string) => void }

/**
 * The Worker's answers to an identity operation that mean "refused, nothing changed":
 * a wrong or used code, a challenge that no longer matches, a rate limit, a protected
 * account. Anything else, a lost connection above all, may have changed the server, so
 * it leaves the device paused for the activation step to reconcile.
 */
const REFUSALS = new Set(['INVALID_CODE', 'INVALID_CHALLENGE', 'RETRY_LATER', 'ACCOUNT_PROTECTED',
  // Refused before the Worker's batch runs (`identity.ts`): a sign-in to an address no
  // account has linked, a link to one another account holds, and the two re-proof asks.
  'ACCOUNT_NOT_LINKED', 'EMAIL_ALREADY_LINKED', 'CHALLENGE_REQUIRED', 'REAUTH_REQUIRED'])
/** Separate from legacy storage: a D1 identity must never open another backend's queue. */
export function createD1AccountHost(options: {
  baseURL: string; store: D1LocalStore; client: () => D1AccountClient
  stopLearning: () => Promise<void>; activateOwner: (namespace: string) => Promise<void>
  eraseOwner: (namespace: string) => Promise<void>
}): D1AccountHost & { resume: () => Promise<void>; capture: () => { namespace: string; isCurrent: () => boolean } } {
  const endpoint = new URL(options.baseURL).href.replace(/\/$/, '')
  const key = `d1.scope.v1.${encodeURIComponent(endpoint)}`
  let generation = 0, active: string | null = null, busy = false
  const namespace = (owner: string) => `d1.data.v1.${encodeURIComponent(JSON.stringify([endpoint, owner]))}.`
  async function pause() {
    active = null; generation++
    await options.stopLearning()
  }
  async function open() {
    const session = await options.client().ensureSession()
    const next = namespace(session.userId)
    await options.activateOwner(next)
    options.store.remove(key)
    active = next
  }
  async function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (busy) throw new D1AuthError('AUTH_BUSY')
    busy = true
    try { return await operation() } finally { busy = false }
  }
  return {
    resume: () => exclusive(async () => {
      await pause()
      // Reconcile credentials before reopening a cache after a crash or failed activation.
      await open()
    }),
    capture: () => {
      if (active === null || options.store.get(key) !== null) throw new D1AuthError('ACCOUNT_TRANSITION_PENDING')
      const version = generation, captured = active
      return { namespace: captured, isCurrent: () => active === captured && generation === version && options.store.get(key) === null }
    },
    changeIdentity: (operation, deleting = false) => exclusive(async () => {
      const previous = await options.client().restore()
      if (!previous) throw new D1AuthError('AUTH_REQUIRED')
      // Marker precedes server mutations. Local work stays in its original namespace.
      options.store.set(key, JSON.stringify({ version: 1, previousOwner: previous.userId, deleting }))
      await pause()
      let result: Awaited<ReturnType<typeof operation>>
      try { result = await operation() }
      catch (error) {
        // A refusal changed nothing on the server, so the paused owner is still the
        // session's owner: reopen it. Left paused, a mistyped code put the device in an
        // empty guest scope, where the onboarding gate sent the learner back to the start.
        if (error instanceof D1AuthError && REFUSALS.has(error.code)) {
          try { await open() } catch { throw new D1AuthError('ACCOUNT_ACTIVATION_REQUIRED') }
        }
        throw error
      }
      if (!('deleted' in result)) {
        try { await open() } catch { throw new D1AuthError('ACCOUNT_ACTIVATION_REQUIRED') }
      }
      return result
    }),
    recoverSession: () => exclusive(async () => {
      const previous = await options.client().restore()
      options.store.set(key, JSON.stringify({ version: 1, previousOwner: previous?.userId ?? null }))
      await pause()
      await options.client().signOut()
      const next = options.client()
      await next.startGuest()
      return next
    }),
    finishDeletion: () => exclusive(async () => {
      await pause()
      const raw = options.store.get(key)
      if (raw) {
        const value: unknown = JSON.parse(raw)
        if (!value || typeof value !== 'object' || !('previousOwner' in value) || typeof value.previousOwner !== 'string') throw new D1AuthError('CREDENTIALS_INVALID')
        await options.eraseOwner(namespace(value.previousOwner))
      }
      options.store.remove(key)
    }),
    resumeIdentity: () => exclusive(async () => { await pause(); await open() }),
    deletionPending: () => {
      const raw = options.store.get(key)
      if (!raw) return false
      const value: unknown = JSON.parse(raw)
      return value !== null && typeof value === 'object' && 'deleting' in value && value.deleting === true
    },
  }
}
