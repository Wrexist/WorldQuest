import { describe, expect, it } from 'vitest'
import { createD1AuthClient, type AuthFetch } from './d1-auth.js'
import { createD1LearningClient } from './d1-learning.js'

const owner = '00000000-0000-4000-8000-000000000001'
const memory = (factId: string) => ({ factId, stability: 20, difficulty: 5, reps: 3, lapses: 0,
  lastReviewAt: 1000, dueAt: 100000, suspended: false })
const first = { revision: 7, xp: 12, coins: 2, memories: [memory('geo.AA.one')],
  next: { after: 'geo.AA.one', revision: 7 } }
async function harness(reply: (url: string, switchOwner: () => void) => { status: number; value: unknown }) {
  const vault = new Map<string, string>(), urls: string[] = []
  let current = true
  const fetch: AuthFetch = async url => {
    const result = url.endsWith('/guest')
      ? { status: 201, value: { userId: owner, token: 'a'.repeat(64), expiresAt: 30 * 86400000 } }
      : (urls.push(url), reply(url, () => { current = false }))
    return { status: result.status, ok: result.status < 400, json: async () => result.value }
  }
  const auth = createD1AuthClient({ baseURL: 'https://api.example', now: () => 0, fetch,
    clearCredentials: async () => { vault.clear() }, storage: {
      getItem: async key => vault.get(key) ?? null, setItem: async (key, value) => { vault.set(key, value) },
      removeItem: async key => { vault.delete(key) },
    } })
  await auth.startGuest()
  return { client: createD1LearningClient({ auth, owner, isCurrent: () => current, fetch }), urls }
}

describe('coherent bounded memory hydration', () => {
  it('keeps first-page metadata and combines the complete memory only after the last page', async () => {
    const h = await harness(url => ({ status: 200, value: url.includes('after=')
      ? { revision: 7, memories: [memory('geo.BB.two')], next: null } : first }))
    expect(await h.client.state()).toMatchObject({ revision: 7, xp: 12, coins: 2,
      memories: [memory('geo.AA.one'), memory('geo.BB.two')] })
    expect(h.urls).toHaveLength(2)
  })
  it('rejects overlapping memories instead of inflating mastery', async () => {
    const h = await harness(url => ({ status: 200, value: url.includes('after=')
      ? { revision: 7, memories: first.memories, next: null } : first }))
    await expect(h.client.state()).rejects.toThrow('INVALID_RESPONSE')
  })
  it('bounds restarts when another device keeps changing the account revision', async () => {
    const h = await harness(url => url.includes('after=')
      ? { status: 409, value: { error: 'STATE_CHANGED' } } : { status: 200, value: first })
    await expect(h.client.state()).rejects.toThrow('STATE_CHANGED')
    expect(h.urls).toHaveLength(6)
  })
  it('abandons hydration immediately if the active account changes', async () => {
    const h = await harness((_url, switchOwner) => { switchOwner(); return { status: 200, value: first } })
    await expect(h.client.state()).rejects.toThrow('Account changed')
    expect(h.urls).toHaveLength(1)
  })
  it('still accepts a complete pre-paging Worker response', async () => {
    const { next: _next, ...legacy } = first
    const h = await harness(() => ({ status: 200, value: legacy }))
    expect((await h.client.state()).memories).toEqual(first.memories)
    expect(h.urls).toHaveLength(1)
  })
})
