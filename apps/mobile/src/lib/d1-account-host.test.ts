import { describe, expect, it, vi } from 'vitest'
import { createD1AuthClient } from '@worldquest/api/d1-auth'
import { createD1AccountHost } from './d1-account-host.js'

const first = { userId: '11111111-1111-4111-8111-111111111111', token: 'a'.repeat(64), expiresAt: Date.now() + 30 * 86400000 }
const second = { ...first, userId: '22222222-2222-4222-8222-222222222222', token: 'b'.repeat(64) }
function harness() {
  const credentials = new Map<string, string>(), data = new Map<string, string>()
  const save = (session: typeof first) => credentials.set('d1.auth.state.v1', JSON.stringify({ version: 1, session, challenge: null }))
  save(first)
  let active: ReturnType<typeof createD1AuthClient> | null = null
  const client = (): ReturnType<typeof createD1AuthClient> => active ??= createD1AuthClient({ baseURL: 'https://d1.example.invalid',
    storage: { getItem: async key => credentials.get(key) ?? null, setItem: async (key, value) => { credentials.set(key, value) }, removeItem: async key => { credentials.delete(key) } },
    clearCredentials: async () => { credentials.clear(); active = null },
    fetch: async () => ({ status: 200, ok: true, json: async () => second }),
  })
  const stopLearning = vi.fn(async () => {}), activateOwner = vi.fn(async (_prefix: string) => {})
  const eraseOwner = vi.fn(async (prefix: string) => { for (const key of data.keys()) if (key.startsWith(prefix)) data.delete(key) })
  const create = () => createD1AccountHost({ baseURL: 'https://d1.example.invalid', client,
    store: { get: key => data.get(key) ?? null, set: (key, value) => { data.set(key, value) }, remove: key => { data.delete(key) } },
    stopLearning, activateOwner, eraseOwner })
  return { create, save, data, client, stopLearning, activateOwner, eraseOwner }
}
describe('D1 account transition isolation', () => {
  it('quarantines old handles before login and leaves their queue in the original namespace', async () => {
    const h = harness(), host = h.create(); await host.resume()
    const old = host.capture(); h.data.set(old.namespace + 'queue', 'original offline lessons')
    await host.changeIdentity(async () => {
      expect(old.isCurrent()).toBe(false)
      expect(() => host.capture()).toThrow('ACCOUNT_TRANSITION_PENDING')
      h.save(second); return second
    })
    expect(host.capture().namespace).not.toBe(old.namespace)
    expect(h.data.get(old.namespace + 'queue')).toBe('original offline lessons')
    h.save(first); await host.resume()
    expect(host.capture().namespace).toBe(old.namespace)
    expect(old.isCurrent()).toBe(false)
  })
  it('retains same-owner data through linking while rejecting stale callbacks', async () => {
    const h = harness(), host = h.create(); await host.resume()
    const old = host.capture(); h.data.set(old.namespace + 'queue', 'pending')
    await host.changeIdentity(async () => first)
    expect(host.capture().namespace).toBe(old.namespace)
    expect(old.isCurrent()).toBe(false)
    expect(h.data.get(old.namespace + 'queue')).toBe('pending')
    expect(h.eraseOwner).not.toHaveBeenCalled()
  })
  it('does not send identity mutations when learning cannot be stopped', async () => {
    const h = harness(), host = h.create(); await host.resume()
    h.stopLearning.mockRejectedValueOnce(new Error('queue busy'))
    const operation = vi.fn(async () => second)
    await expect(host.changeIdentity(operation)).rejects.toThrow('queue busy')
    expect(operation).not.toHaveBeenCalled()
    expect(() => host.capture()).toThrow('ACCOUNT_TRANSITION_PENDING')
  })
  it('repairs failed cache activation from saved credentials after restart', async () => {
    const h = harness(), host = h.create(); await host.resume()
    h.activateOwner.mockRejectedValueOnce(new Error('disk full'))
    await expect(host.changeIdentity(async () => { h.save(second); return second })).rejects.toThrow('ACCOUNT_ACTIVATION_REQUIRED')
    expect(() => host.capture()).toThrow('ACCOUNT_TRANSITION_PENDING')
    const restarted = h.create(); await restarted.resumeIdentity()
    expect(restarted.capture().namespace).toContain(encodeURIComponent(second.userId))
  })
  it('deletes only the departing owner namespace and keeps cleanup retryable', async () => {
    const h = harness(), host = h.create(); await host.resume()
    const old = host.capture(); h.data.set(old.namespace + 'queue', 'pending'); h.data.set('other-backend.queue', 'keep')
    await host.changeIdentity(async () => ({ deleted: true }), true)
    expect(h.create().deletionPending()).toBe(true)
    h.eraseOwner.mockRejectedValueOnce(new Error('disk busy'))
    await expect(host.finishDeletion()).rejects.toThrow('disk busy')
    expect(() => host.capture()).toThrow('ACCOUNT_TRANSITION_PENDING')
    await host.finishDeletion()
    expect(h.create().deletionPending()).toBe(false)
    expect(h.data.get(old.namespace + 'queue')).toBeUndefined()
    expect(h.data.get('other-backend.queue')).toBe('keep')
  })
  it('leaves original work detached during explicitly chosen recovery', async () => {
    const h = harness(), host = h.create(); await host.resume()
    const old = host.capture(); h.data.set(old.namespace + 'queue', 'pending')
    const recovered = await host.recoverSession()
    expect(await recovered.restore()).toEqual(second)
    expect(() => host.capture()).toThrow('ACCOUNT_TRANSITION_PENDING')
    expect(h.data.get(old.namespace + 'queue')).toBe('pending')
  })
})
