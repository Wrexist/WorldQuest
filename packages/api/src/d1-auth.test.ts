import { describe, expect, it, vi } from 'vitest'
import { createD1AuthClient, type AuthFetch, type ProtectedStorage } from './d1-auth.js'

const owner = '11111111-1111-4111-8111-111111111111'
const guest = { userId: owner, token: 'a'.repeat(64), expiresAt: 2_000_000_000_000 }
const linked = { userId: owner, token: 'b'.repeat(64), expiresAt: 2_000_000_000_000 }
const challenge = { challengeId: 'c'.repeat(64), expiresAt: 2_000_000_000_000 }
function harness() {
  let clock = guest.expiresAt - 30 * 86_400_000
  const values = new Map<string, string>(), events: string[] = []
  const storage: ProtectedStorage = {
    getItem: vi.fn(async key => values.get(key) ?? null),
    setItem: vi.fn(async (key, value) => { events.push('saved'); values.set(key, value) }),
    removeItem: vi.fn(async key => { values.delete(key) }),
  }
  const fetch = vi.fn<AuthFetch>(async (url, init) => {
    events.push(url.split('/').at(-1)!)
    const value = url.endsWith('/guest') ? guest : url.endsWith('/request') ? challenge
      : url.endsWith('/verify') ? linked : url.endsWith('/renew')
        ? { ...guest, token: JSON.parse(String(init.body)).replacement, expiresAt: clock + 30 * 86_400_000 } : { signedOut: true }
    return { status: 200, ok: true, json: async () => value }
  })
  const clear = vi.fn(async () => { values.clear() })
  const create = () => createD1AuthClient({ baseURL: 'https://api.example.invalid', storage, clearCredentials: clear, fetch,
    now: () => clock, randomBytes: async () => new Uint8Array(32).fill(0xdd) })
  return { create, values, storage, fetch, clear, events, setTime: (time: number) => { clock = time } }
}
describe('D1 native auth transport', () => {
  it('restores guest and pending verification after restart and replaces both atomically', async () => {
    const h = harness(), a = h.create()
    await a.startGuest()
    await a.requestEmail('Learner@example.invalid', 'link', 'sv')
    const b = h.create()
    expect(await b.restore()).toEqual(guest)
    expect(await b.pending()).toMatchObject({ ...challenge, purpose: 'link', email: 'learner@example.invalid' })
    expect(await b.verifyEmail('12345678')).toEqual(linked)
    expect(await h.create().restore()).toEqual(linked)
    expect(await h.create().pending()).toBeNull()
    expect(h.values.size).toBe(1)
  })
  it('does not accept a login until protected storage acknowledges persistence', async () => {
    const h = harness(), a = h.create()
    await a.startGuest(); await a.requestEmail('learner@example.invalid', 'link', 'en')
    vi.mocked(h.storage.setItem).mockRejectedValueOnce(new Error('device locked'))
    await expect(a.verifyEmail('12345678')).rejects.toThrow('device locked')
    expect(h.fetch).toHaveBeenLastCalledWith('https://api.example.invalid/v1/auth/logout', expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${linked.token}` }) }))
    expect(await h.create().restore()).toEqual(guest)
  })
  it('invalidates a delayed login as soon as logout begins', async () => {
    const h = harness(), a = h.create()
    await a.startGuest(); await a.requestEmail('learner@example.invalid', 'link', 'en')
    let release!: () => void
    const wait = new Promise<void>(resolve => { release = resolve })
    h.fetch.mockImplementationOnce(async () => { await wait; return { status: 200, ok: true, json: async () => linked } })
    const pending = a.verifyEmail('12345678')
    // Let the verification reach the delayed network request.
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(3))
    await a.signOut(); release()
    await expect(pending).rejects.toThrow('Account changed')
    expect(h.values.size).toBe(0)
    await expect(a.startGuest()).rejects.toThrow('Account changed')
  })
  it('erases local credentials during offline logout and permits cleanup retry', async () => {
    const h = harness(), a = h.create(); await a.startGuest()
    h.fetch.mockRejectedValue(new Error('offline'))
    h.clear.mockRejectedValueOnce(new Error('storage busy'))
    await expect(a.signOut()).rejects.toThrow('storage busy')
    await a.signOut()
    expect(h.values.size).toBe(0)
  })
  it('makes completed logout a no-op after a different account has started', async () => {
    const h = harness(), old = h.create(); await old.startGuest(); await old.signOut()
    const next = h.create(); await next.startGuest()
    const saved = [...h.values.entries()], calls = h.fetch.mock.calls.length
    await old.signOut()
    expect([...h.values.entries()]).toEqual(saved)
    expect(await next.restore()).toEqual(guest)
    expect(h.clear).toHaveBeenCalledTimes(1)
    expect(h.fetch).toHaveBeenCalledTimes(calls)
  })
  it('shares in-flight erasure across simultaneous logout calls', async () => {
    const h = harness(), a = h.create(); await a.startGuest()
    let release!: () => void
    const wait = new Promise<void>(resolve => { release = resolve })
    h.clear.mockImplementation(async () => { await wait; h.values.clear() })
    const first = a.signOut(), second = a.signOut()
    await vi.waitFor(() => expect(h.clear).toHaveBeenCalledTimes(1))
    release(); await Promise.all([first, second])
    expect(h.clear).toHaveBeenCalledTimes(1)
  })
  it('refuses a changed owner on the link path and revokes the returned token', async () => {
    const h = harness(), a = h.create()
    await a.startGuest(); await a.requestEmail('learner@example.invalid', 'link', 'en')
    h.fetch.mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ ...linked, userId: '22222222-2222-4222-8222-222222222222' }) })
    await expect(a.verifyEmail('12345678')).rejects.toThrow('OWNER_CHANGED')
    expect(await h.create().restore()).toEqual(guest)
  })
  it('preserves a retryable challenge after email delivery failure', async () => {
    const h = harness(), a = h.create(); await a.startGuest()
    h.fetch.mockResolvedValueOnce({ status: 503, ok: false, json: async () => ({ error: 'EMAIL_UNAVAILABLE', ...challenge }) })
    await expect(a.requestEmail('learner@example.invalid', 'link', 'en')).rejects.toMatchObject({ code: 'EMAIL_UNAVAILABLE', retryChallenge: expect.objectContaining(challenge) })
    expect(await h.create().pending()).toMatchObject(challenge)
  })
  it('permits protected erasure retry after the server confirms deletion', async () => {
    const h = harness(), a = h.create(); await a.startGuest()
    await a.requestEmail('learner@example.invalid', 'delete', 'en')
    h.fetch.mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ deleted: true }) })
    h.clear.mockRejectedValueOnce(new Error('device locked'))
    await expect(a.verifyEmail('12345678')).rejects.toThrow('device locked')
    await expect(a.account()).rejects.toThrow('Account changed')
    await a.signOut()
    expect(h.clear).toHaveBeenCalledTimes(2)
    expect(await h.create().restore()).toBeNull()
  })
  it('rejects insecure endpoints and corrupted stored credentials', async () => {
    const h = harness()
    expect(() => createD1AuthClient({ baseURL: 'http://public.example.invalid', storage: h.storage, clearCredentials: h.clear, fetch: h.fetch })).toThrow('INSECURE_ENDPOINT')
    await h.create().startGuest()
    h.values.set([...h.values.keys()][0]!, '{broken')
    await expect(h.create().restore()).rejects.toThrow('CREDENTIALS_INVALID')
    expect(h.fetch).toHaveBeenCalledTimes(1)
  })
  it('durably prepares renewal before sending, preserves verification, and restores the new bearer', async () => {
    const h = harness(), a = h.create(); await a.startGuest()
    await a.requestEmail('learner@example.invalid', 'link', 'sv')
    h.setTime(guest.expiresAt - 86_400_000)
    expect(await a.sessionStatus()).toBe('renewal-due')
    h.events.length = 0
    const next = await a.ensureSession()
    expect(next).toMatchObject({ userId: owner, token: 'd'.repeat(64) })
    expect(h.events).toEqual(['saved', 'renew', 'saved'])
    expect(await h.create().restore()).toEqual(next)
    expect(await h.create().pending()).toMatchObject({ purpose: 'link', email: 'learner@example.invalid' })
    expect(await a.sessionStatus()).toBe('active')
  })
  it('does not rotate on D1 when the preparatory secure write fails', async () => {
    const h = harness(), a = h.create(); await a.startGuest(); h.setTime(guest.expiresAt - 1)
    vi.mocked(h.storage.setItem).mockRejectedValueOnce(new Error('device locked'))
    await expect(a.ensureSession()).rejects.toThrow('device locked')
    expect(h.fetch).toHaveBeenCalledTimes(1)
    expect(await h.create().restore()).toEqual(guest)
    expect(await a.sessionStatus()).toBe('renewal-due')
  })
  it.each(['lost response', 'secure commit failure'])('resumes the same saved renewal after restart: %s', async failure => {
    const h = harness(), a = h.create(); await a.startGuest(); h.setTime(guest.expiresAt - 1)
    if (failure === 'lost response') h.fetch.mockRejectedValueOnce(new Error(failure))
    else {
      vi.mocked(h.storage.setItem).mockImplementationOnce(async (key, value) => { h.values.set(key, value) })
        .mockRejectedValueOnce(new Error(failure))
    }
    await expect(a.ensureSession()).rejects.toThrow(failure)
    const b = h.create()
    expect(await b.sessionStatus()).toBe('renewal-pending')
    const next = await b.ensureSession()
    const calls = h.fetch.mock.calls.filter(([url]) => url.endsWith('/renew'))
    expect(calls).toHaveLength(2)
    expect(calls[0]![1].body).toEqual(calls[1]![1].body)
    expect(await b.restore()).toEqual(next)
    expect(h.fetch.mock.calls.some(([url]) => url.endsWith('/logout'))).toBe(false)
  })
  it('revokes both saved bearers when logout interrupts renewal', async () => {
    const h = harness(), a = h.create(); await a.startGuest(); h.setTime(guest.expiresAt - 1)
    let release!: () => void
    const wait = new Promise<void>(resolve => { release = resolve })
    h.fetch.mockImplementationOnce(async () => {
      await wait
      return { status: 200, ok: true, json: async () => ({ ...guest, token: 'd'.repeat(64) }) }
    })
    const promise = a.ensureSession()
    const rejected = expect(promise).rejects.toThrow('Account changed')
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(2))
    await a.signOut(); release(); await rejected
    const logouts = h.fetch.mock.calls.filter(([url]) => url.endsWith('/logout'))
    expect(logouts.map(([, init]) => init.headers)).toContainEqual(expect.objectContaining({ Authorization: `Bearer ${guest.token}` }))
    expect(logouts.map(([, init]) => init.headers)).toContainEqual(expect.objectContaining({ Authorization: `Bearer ${'d'.repeat(64)}` }))
    expect(await h.create().sessionStatus()).toBe('missing')
  })
  it.each(['prepare', 'commit'])('recovers when secure storage writes successfully but loses its %s acknowledgement', async phase => {
    const h = harness(), a = h.create(); await a.startGuest(); h.setTime(guest.expiresAt - 1)
    let writes = 0
    vi.mocked(h.storage.setItem).mockImplementation(async (key, value) => {
      h.values.set(key, value)
      if (++writes === (phase === 'prepare' ? 1 : 2)) throw new Error('readback failed')
    })
    await expect(a.ensureSession()).rejects.toThrow('readback failed')
    const b = h.create()
    expect(await b.sessionStatus()).toBe(phase === 'prepare' ? 'renewal-pending' : 'active')
    expect(await b.ensureSession()).toMatchObject({ userId: owner, token: 'd'.repeat(64) })
    expect(h.fetch.mock.calls.filter(([url]) => url.endsWith('/renew'))).toHaveLength(1)
    expect(h.fetch.mock.calls.some(([url]) => url.endsWith('/logout'))).toBe(false)
  })
  it('keeps an expired owner for explicit recovery and never silently replaces it with a guest', async () => {
    const h = harness(), a = h.create(); await a.startGuest(); h.setTime(guest.expiresAt + 1)
    expect(await a.sessionStatus()).toBe('expired')
    h.fetch.mockResolvedValueOnce({ status: 401, ok: false, json: async () => ({ error: 'SESSION_EXPIRED' }) })
    await expect(a.startGuest()).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
    expect(await h.create().restore()).toEqual(guest)
    expect(await a.sessionStatus()).toBe('expired')
    expect(h.fetch.mock.calls.filter(([url]) => url.endsWith('/guest'))).toHaveLength(1)
  })
  it('uses server time when a device clock requests renewal too early', async () => {
    const h = harness(), a = h.create(); await a.startGuest(); h.setTime(guest.expiresAt + 1)
    h.fetch.mockResolvedValueOnce({ status: 409, ok: false, json: async () => ({ error: 'SESSION_NOT_DUE' }) })
    expect(await a.ensureSession()).toEqual(guest)
    expect(await a.sessionStatus()).not.toBe('renewal-pending')
  })
})
