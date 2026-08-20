/**
 * The sync queue against a stored value it cannot use.
 *
 * This module reads its queue at import time and `enqueueLesson` immediately calls
 * `enqueue`, which does `queue.pending.some(...)`. A stored queue from an older shape —
 * or one whose write was cut short — therefore threw a TypeError at the END OF EVERY
 * LESSON, inside the one function whose entire purpose is that a finished lesson
 * survives, and nothing short of a reinstall could clear it.
 *
 * A separate file from `sync.test.ts` because the poisoning has to happen before this
 * module is imported: the read is at module scope, which is the whole reason it was so
 * hard to recover from.
 */

import { describe, expect, it, vi } from 'vitest'
import { writeJson } from './storage.js'

vi.mock('./supabase.js', () => ({
  isConfigured: () => false,
  supabase: () => ({}),
  currentUser: () => Promise.resolve(null),
  // `connectivity.ts` reads this at import time to configure NetInfo's reachability
  // probe, and `sync.ts` imports it transitively.
  backendUrl: () => '',
}))
vi.mock('./query.js', () => ({ invalidateProgress: vi.fn() }))
vi.mock('./analytics.js', () => ({ track: vi.fn() }))

/**
 * Written through `storage.ts` itself, and before the module under test is imported.
 *
 * Not through a fresh `new MMKV(...)`: the test double is per-INSTANCE, so a second
 * handle is a second empty store and the poisoned value never reaches the reader. That
 * mistake made this test pass against the unfixed code, which is the worst outcome a
 * regression test has.
 */
const poison = (value: unknown): void => writeJson('sync.queue.v1', value)

describe('a queue that cannot be read', () => {
  it('starts empty and still accepts a lesson', async () => {
    // `parked` absent — the shape before it existed. `enqueue` reads it.
    poison({ pending: [] })
    const sync = await import('./sync.js')

    expect(sync.peekQueue()).toEqual({ pending: [], parked: [] })
    expect(() =>
      sync.enqueueLesson({
        lessonId: 'd1a5c0de-0000-4000-8000-000000000001',
        kind: 'lesson',
        startedAt: 0,
        answers: [],
        heartsLost: 0,
      }),
    ).not.toThrow()
    expect(sync.peekQueue().pending).toHaveLength(1)
  })
})
