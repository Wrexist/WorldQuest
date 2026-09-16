import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseBackend } from './supabase-adapter.js'
import { AccountChangedError } from './ports.js'
import type { WorldQuestClient } from './client.js'

const config = { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' }

function sessionClient(read: () => { userId: string; token: string } | null): WorldQuestClient {
  return {
    auth: {
      getSession: async () => {
        const value = read()
        return { error: null, data: { session: value && {
          user: { id: value.userId }, access_token: value.token,
        } } }
      },
    },
  } as unknown as WorldQuestClient
}

afterEach(() => vi.unstubAllGlobals())

describe('account repository contract: source adapter', () => {
  it('refuses to open an A handle using B credentials', async () => {
    const backend = createSupabaseBackend(config, sessionClient(() => ({ userId: 'B', token: 'token-B' })))
    await expect(backend.forAccount('A')).rejects.toBeInstanceOf(AccountChangedError)
  })

  it('refuses a missing session without creating an anonymous replacement', async () => {
    const backend = createSupabaseBackend(config, sessionClient(() => null))
    await expect(backend.forAccount('A')).rejects.toBeInstanceOf(AccountChangedError)
  })

  it('keeps A credentials on an already opened request after switching to B', async () => {
    let current = { userId: 'A', token: 'token-A' }
    const backend = createSupabaseBackend(config, sessionClient(() => current))
    const accountA = await backend.forAccount('A')
    const requests: { url: string; token: string | null; body: string }[] = []
    vi.stubGlobal('fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      requests.push({ url: String(input), token: new Headers(init?.headers).get('Authorization'), body: String(init?.body) })
      return new Response(JSON.stringify({ lessonId: 'lesson-A', replayed: false }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    })
    current = { userId: 'B', token: 'token-B' }
    await accountA.submitLesson({ lessonId: 'lesson-A', kind: 'lesson', startedAt: 0, answers: [] })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.token).toBe('Bearer token-A')
    expect(JSON.parse(requests[0]!.body)).toEqual({ lessonId: 'lesson-A', kind: 'lesson', startedAt: 0, answers: [] })
    expect(accountA.identity).toEqual({ backendId: config.url, userId: 'A' })
  })

  it('passes a read failure through instead of manufacturing a zero wallet', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ message: 'unavailable' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    }))
    const backend = createSupabaseBackend(config, sessionClient(() => ({ userId: 'A', token: 'token-A' })))
    const account = await backend.forAccount('A')
    await expect(account.fetchProgress()).rejects.toMatchObject({ message: 'unavailable' })
  })
})
