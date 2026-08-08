/**
 * The counts behind "# lessons haven't reached the server yet".
 *
 * The queue holds four kinds of mutation and the sentence names one of them. This hook
 * used to hand Settings `queue.pending.length` — every kind — so a lesson finished
 * offline plus one flipped switch read "2 lessons are waiting to reach the server". The
 * screen's own tests could not see it: they pass the counts in as props, which is exactly
 * where the number was already wrong.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { emptyQueue, enqueue, fail, MAX_ATTEMPTS, type SyncQueue } from '@worldquest/engines'

let queue: SyncQueue = emptyQueue()

vi.mock('../../lib/sync.js', () => ({
  peekQueue: () => queue,
  // The real store notifies on commit; nothing here mutates the queue after mounting,
  // so an unsubscribe is all the contract needs.
  onQueueChange: () => () => undefined,
  retryParkedMutation: vi.fn(),
}))

const { useSyncStatus } = await import('./useSyncStatus.js')

const T0 = 1_800_000_000_000

const lesson = (id: string) => ({
  id,
  kind: 'lesson_complete' as const,
  payload: { answers: [] },
  clientTs: T0,
})

beforeEach(() => {
  queue = emptyQueue()
})

describe('useSyncStatus', () => {
  it('counts nothing when the queue is empty', () => {
    const { result } = renderHook(() => useSyncStatus())
    expect(result.current).toMatchObject({ parked: 0, pending: 0, hasUnsynced: false })
  })

  it('counts only the lessons its copy is about', () => {
    // The bug, at the width a user would meet it: one lesson and one setting queued.
    queue = enqueue(emptyQueue(), lesson('l1'))
    queue = enqueue(queue, { id: 's1', kind: 'setting', payload: { sound: false }, clientTs: T0 })
    expect(queue.pending).toHaveLength(2)

    const { result } = renderHook(() => useSyncStatus())
    expect(result.current.pending).toBe(1)
    expect(result.current.hasUnsynced).toBe(true)
  })

  it('says nothing is waiting when only housekeeping is', () => {
    // Not merely a count of zero — `hasUnsynced` hides the whole section, so a settings
    // change must not open a panel headed "Waiting to sync".
    queue = enqueue(emptyQueue(), { id: 's1', kind: 'setting', payload: {}, clientTs: T0 })
    queue = enqueue(queue, { id: 'p1', kind: 'purchase', payload: {}, clientTs: T0 })

    const { result } = renderHook(() => useSyncStatus())
    expect(result.current).toMatchObject({ parked: 0, pending: 0, hasUnsynced: false })
  })

  it('keeps work that gave up apart from work still trying', () => {
    // Two numbers because they drive two different sentences and a retry link.
    queue = enqueue(emptyQueue(), lesson('l1'))
    queue = enqueue(queue, lesson('l2'))
    for (let i = 0; i < MAX_ATTEMPTS; i++) queue = fail(queue, 'l1', 'network')

    const { result } = renderHook(() => useSyncStatus())
    expect(result.current.parked).toBe(1)
    expect(result.current.pending).toBe(1)
  })

  it('does not count a parked purchase as a parked lesson', () => {
    queue = enqueue(emptyQueue(), { id: 'p1', kind: 'purchase', payload: {}, clientTs: T0 })
    for (let i = 0; i < MAX_ATTEMPTS; i++) queue = fail(queue, 'p1', 'network')
    expect(queue.parked).toHaveLength(1)

    const { result } = renderHook(() => useSyncStatus())
    expect(result.current.parked).toBe(0)
  })
})
