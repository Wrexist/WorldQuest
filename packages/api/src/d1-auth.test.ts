import { describe, expect, it, vi } from 'vitest'
import { createD1AuthClient, type AuthFetch, type ProtectedStorage } from './d1-auth.js'

const owner = '11111111-1111-4111-8111-111111111111'
const guest = { userId: owner, token: 'a'.repeat(64), expiresAt: 2_000_000_000_000 }
const linked = { userId: owner, token: 'b'.repeat(64), expiresAt: 2_000_000_000_000 }
const challenge = { challengeId: 'c'.repeat(64), expiresAt: 2_000_000_000_000 }
function harness() {
  const values = new Map<string, string>(), events: string[] = []
  const storage: ProtectedStorage = {
    getItem: vi.fn(async key => values.get(key) ?? null),
    setItem: vi.fn(async (key, value) => { events.push('saved'); values.set(key, value) }),
    removeItem: vi.fn(async key => { values.delete(key) }),
  }
  const fetch = vi.fn<AuthFetch>(async url => {
    events.push(url.split('/').at(-1)!)
    const value = url.endsWith('/guest') ? guest : url.endsWith('/request') ? challenge
      : url.endsWith('/verify') ? linked : { signedOut: true }
    return { status: 200, ok: true, json: async () => value }
  })
  const clear = vi.fn(async () => { values.clear() })
  const create = () => createD1AuthClient({ baseURL: 'https://api.example.invalid', storage, clearCredentials: clear, fetch })
  return { create, values, storage, fetch, clear, events }
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
  it('rejects insecure endpoints and corrupted stored credentials', async () => {
    const h = harness()
    expect(() => createD1AuthClient({ baseURL: 'http://public.example.invalid', storage: h.storage, clearCredentials: h.clear, fetch: h.fetch })).toThrow('INSECURE_ENDPOINT')
    await h.create().startGuest()
    h.values.set([...h.values.keys()][0]!, '{broken')
    await expect(h.create().restore()).rejects.toThrow('CREDENTIALS_INVALID')
    expect(h.fetch).toHaveBeenCalledTimes(1)
  })
})
