import { describe, expect, it } from 'vitest'
import { seededRng } from '../shared/index.js'
import {
  MAX_ATTEMPTS,
  acknowledge,
  backoffMs,
  emptyQueue,
  enqueue,
  fail,
  hasUnsyncedProgress,
  nextBatch,
  reconcile,
  retryParked,
  type QueuedMutation,
} from './index.js'

const T0 = 1_800_000_000_000

const lesson = (id: string, ts = T0): Omit<QueuedMutation, 'attempts'> => ({
  id,
  kind: 'lesson_complete',
  payload: { answers: [] },
  clientTs: ts,
})

describe('enqueue', () => {
  it('adds a mutation', () => {
    const q = enqueue(emptyQueue(), lesson('a'))
    expect(q.pending).toHaveLength(1)
    expect(q.pending[0]!.attempts).toBe(0)
  })

  it('ignores a duplicate id — replay must never double-award', () => {
    // A retry racing a successful write is normal. Duplicating it would double
    // someone's XP, which is exactly what the idempotency key exists to prevent.
    let q = enqueue(emptyQueue(), lesson('a'))
    q = enqueue(q, lesson('a'))
    q = enqueue(q, lesson('a'))
    expect(q.pending).toHaveLength(1)
  })

  it('ignores an id that is already parked', () => {
    let q = enqueue(emptyQueue(), lesson('a'))
    for (let i = 0; i < MAX_ATTEMPTS; i++) q = fail(q, 'a', 'network')
    expect(q.parked).toHaveLength(1)
    q = enqueue(q, lesson('a'))
    expect(q.pending).toHaveLength(0)
    expect(q.parked).toHaveLength(1)
  })
})

describe('nextBatch', () => {
  it('sends oldest first', () => {
    // Order matters: streaks and the daily XP cap depend on sequence.
    let q = emptyQueue()
    q = enqueue(q, lesson('c', T0 + 3_000))
    q = enqueue(q, lesson('a', T0 + 1_000))
    q = enqueue(q, lesson('b', T0 + 2_000))
    expect(nextBatch(q).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('respects the batch limit', () => {
    let q = emptyQueue()
    for (let i = 0; i < 25; i++) q = enqueue(q, lesson(`m${i}`, T0 + i))
    expect(nextBatch(q, 10)).toHaveLength(10)
  })

  it('is empty when nothing is pending', () => {
    expect(nextBatch(emptyQueue())).toHaveLength(0)
  })
})

describe('acknowledge', () => {
  it('removes an accepted mutation', () => {
    let q = enqueue(emptyQueue(), lesson('a'))
    q = acknowledge(q, 'a')
    expect(q.pending).toHaveLength(0)
  })

  it('is harmless for an unknown id', () => {
    // The server acknowledging something we already dropped must not throw.
    const q = enqueue(emptyQueue(), lesson('a'))
    expect(acknowledge(q, 'nope')).toEqual(q)
  })
})

describe('fail', () => {
  it('counts attempts and keeps retrying', () => {
    let q = enqueue(emptyQueue(), lesson('a'))
    q = fail(q, 'a', 'timeout')
    expect(q.pending[0]!.attempts).toBe(1)
    expect(q.pending[0]!.lastError).toBe('timeout')
    expect(q.parked).toHaveLength(0)
  })

  it('parks after the attempt limit rather than dropping', () => {
    // Progress is never silently discarded — it moves somewhere the user can see it.
    let q = enqueue(emptyQueue(), lesson('a'))
    for (let i = 0; i < MAX_ATTEMPTS; i++) q = fail(q, 'a', 'network')
    expect(q.pending).toHaveLength(0)
    expect(q.parked).toHaveLength(1)
    expect(q.parked[0]!.attempts).toBe(MAX_ATTEMPTS)
  })

  it('parks immediately on a permanent failure', () => {
    // A 400 will still be a 400 in eight seconds. Don't burn five attempts on it.
    let q = enqueue(emptyQueue(), lesson('a'))
    q = fail(q, 'a', 'malformed', true)
    expect(q.parked).toHaveLength(1)
    expect(q.parked[0]!.attempts).toBe(1)
  })

  it('is harmless for an unknown id', () => {
    const q = enqueue(emptyQueue(), lesson('a'))
    expect(fail(q, 'nope', 'x')).toEqual(q)
  })
})

describe('retryParked', () => {
  it('moves a parked mutation back with a clean slate', () => {
    let q = enqueue(emptyQueue(), lesson('a'))
    for (let i = 0; i < MAX_ATTEMPTS; i++) q = fail(q, 'a', 'network')
    q = retryParked(q, 'a')
    expect(q.parked).toHaveLength(0)
    expect(q.pending).toHaveLength(1)
    expect(q.pending[0]!.attempts).toBe(0)
    expect(q.pending[0]!.lastError).toBeUndefined()
  })

  it('is harmless for an unknown id', () => {
    expect(retryParked(emptyQueue(), 'nope')).toEqual(emptyQueue())
  })
})

describe('backoff', () => {
  it('grows exponentially and caps', () => {
    const rng = seededRng(1)
    const delays = [0, 1, 2, 3, 8].map((a) => backoffMs(a, rng.next()))
    expect(delays[0]!).toBeLessThan(delays[2]!)
    expect(delays[4]!).toBeLessThanOrEqual(60_000)
  })

  it('jitters so clients do not sync in lockstep', () => {
    const a = backoffMs(3, 0)
    const b = backoffMs(3, 1)
    expect(a).not.toBe(b)
    expect(a).toBeGreaterThan(0)
  })
})

describe('reconcile', () => {
  it('accepts the server value when they agree', () => {
    const r = reconcile({ xpTotal: 100, coins: 50 }, { xpTotal: 100, coins: 50 })
    expect(r.mismatch).toBe(false)
    expect(r.shouldNotify).toBe(false)
    expect(r.xpTotal).toBe(100)
  })

  it('always takes the server value when they disagree', () => {
    // The server always wins. There is no branch where the client's number stands.
    const r = reconcile({ xpTotal: 500, coins: 200 }, { xpTotal: 120, coins: 60 })
    expect(r.xpTotal).toBe(120)
    expect(r.coins).toBe(60)
    expect(r.mismatch).toBe(true)
    expect(r.xpDelta).toBe(-380)
  })

  it('corrects a small difference silently', () => {
    // A rounding difference is not worth a dialog, and certainly not an accusation.
    const r = reconcile({ xpTotal: 100, coins: 50 }, { xpTotal: 98, coins: 50 })
    expect(r.mismatch).toBe(true)
    expect(r.shouldNotify).toBe(false)
  })

  it('surfaces a large correction', () => {
    const r = reconcile({ xpTotal: 300, coins: 50 }, { xpTotal: 100, coins: 50 })
    expect(r.shouldNotify).toBe(true)
  })

  it('handles the server awarding MORE than predicted', () => {
    // Happens legitimately: a streak milestone the client didn't know about.
    const r = reconcile({ xpTotal: 100, coins: 50 }, { xpTotal: 350, coins: 90 })
    expect(r.xpDelta).toBe(250)
    expect(r.xpTotal).toBe(350)
  })
})

describe('unsynced progress', () => {
  it('reports learning work as at risk', () => {
    const q = enqueue(emptyQueue(), lesson('a'))
    expect(hasUnsyncedProgress(q)).toBe(true)
  })

  it('counts parked work too', () => {
    // Parked still means unsynced — it must still block a silent sign-out.
    let q = enqueue(emptyQueue(), lesson('a'))
    for (let i = 0; i < MAX_ATTEMPTS; i++) q = fail(q, 'a', 'network')
    expect(q.pending).toHaveLength(0)
    expect(hasUnsyncedProgress(q)).toBe(true)
  })

  it('does not count a settings change as progress', () => {
    const q = enqueue(emptyQueue(), {
      id: 's1', kind: 'setting', payload: { sound: false }, clientTs: T0,
    })
    expect(hasUnsyncedProgress(q)).toBe(false)
  })

  it('is false for an empty queue', () => {
    expect(hasUnsyncedProgress(emptyQueue())).toBe(false)
  })
})

describe('the offline round trip', () => {
  it('survives going offline mid-session and reconnecting', () => {
    // E2E flow 7, as a unit test: three lessons queued with no network, then a
    // flush where the middle one fails once and succeeds on retry.
    let q = emptyQueue()
    q = enqueue(q, lesson('l1', T0 + 1_000))
    q = enqueue(q, lesson('l2', T0 + 2_000))
    q = enqueue(q, lesson('l3', T0 + 3_000))
    expect(hasUnsyncedProgress(q)).toBe(true)

    const batch = nextBatch(q)
    expect(batch.map((m) => m.id)).toEqual(['l1', 'l2', 'l3'])

    q = acknowledge(q, 'l1')
    q = fail(q, 'l2', 'timeout')
    q = acknowledge(q, 'l3')
    expect(q.pending.map((m) => m.id)).toEqual(['l2'])

    q = acknowledge(q, 'l2')
    expect(q.pending).toHaveLength(0)
    expect(q.parked).toHaveLength(0)
    expect(hasUnsyncedProgress(q)).toBe(false)
  })

  it('is safe when the same batch is flushed twice', () => {
    // Two flushes racing — a real occurrence when connectivity flaps.
    let q = enqueue(emptyQueue(), lesson('l1'))
    const first = nextBatch(q)
    const second = nextBatch(q)
    expect(first).toEqual(second)

    q = acknowledge(q, 'l1')
    q = acknowledge(q, 'l1') // the second flush's response
    expect(q.pending).toHaveLength(0)
  })
})
