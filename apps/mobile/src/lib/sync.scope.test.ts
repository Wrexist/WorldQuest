import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubmitLessonResponse } from '@worldquest/api'
import * as storage from './storage.js'

const state = vi.hoisted(() => ({ online: false, submit: vi.fn(), reconcile: vi.fn() }))
vi.mock('./supabase.js', () => ({
  isConfigured: () => true,
  currentUser: async () => ({ userId: 'unused-by-transport' }),
  accountRepository: async (userId: string) => ({
    submitLesson: (body: unknown) => state.submit(userId, body),
  }),
}))
vi.mock('./connectivity.js', () => ({ isOnline: () => state.online, onConnectivityChange: () => () => {} }))
vi.mock('./query.js', () => ({ invalidateProgress: () => state.reconcile() }))
vi.mock('./analytics.js', () => ({ track: () => {} }))

const { enqueueLesson, flush, peekQueue } = await import('./sync.js')
const lesson = (lessonId: string) => ({ lessonId, kind: 'lesson' as const, startedAt: 0, answers: [], heartsLost: 0 })
const result: SubmitLessonResponse = {
  lessonId: 'A-lesson', items: 1, correct: 1, accuracy: 1, xpAwarded: 0,
  coinsAwarded: 0, perfect: true, rejected: 0, timingDiscarded: false, replayed: false,
}

beforeEach(async () => {
  state.online = false
  await flush()
  await storage.clearAll()
  storage.setStorageAccount('A')
  state.submit.mockReset().mockResolvedValue(result)
  state.reconcile.mockClear()
})
afterEach(() => { state.online = false; vi.restoreAllMocks() })

describe('outbox ownership and durability', () => {
  it('only drains the selected account and preserves the other account for later', async () => {
    enqueueLesson(lesson('A-lesson'))
    storage.setStorageAccount('B')
    expect(peekQueue().pending).toHaveLength(0)
    enqueueLesson(lesson('B-lesson'))
    state.online = true
    await flush()
    expect(state.submit.mock.calls.map(([owner, body]) => [owner, body.lessonId])).toEqual([['B', 'B-lesson']])
    state.online = false
    storage.setStorageAccount('A')
    expect(peekQueue().pending.map((m) => m.id)).toEqual(['A-lesson'])
  })

  it('ignores A completion after switching to B, keeping A available for idempotent retry', async () => {
    let complete!: (value: SubmitLessonResponse) => void
    state.submit.mockImplementation(() => new Promise<SubmitLessonResponse>((resolve) => { complete = resolve }))
    enqueueLesson(lesson('A-lesson'))
    state.online = true
    const pending = flush()
    await vi.waitFor(() => expect(state.submit).toHaveBeenCalledOnce())
    storage.setStorageAccount('B')
    complete(result)
    await pending
    expect(state.reconcile).not.toHaveBeenCalled()
    expect(peekQueue().pending).toHaveLength(0)
    state.online = false
    storage.setStorageAccount('A')
    expect(peekQueue().pending.map((m) => m.id)).toEqual(['A-lesson'])
  })

  it('does not acknowledge an enqueue when persistence fails', () => {
    vi.spyOn(storage, 'writeJson').mockImplementationOnce(() => { throw new Error('disk full') })
    expect(() => enqueueLesson(lesson('unsaved'))).toThrow('disk full')
    expect(peekQueue().pending).toHaveLength(0)
  })
})
