/**
 * The four events the server's answer made honest.
 *
 * All four were declared in `packages/analytics` from the day the registry was written
 * and had no producer — 17 of 44 were in that state. Three of them were blocked on the
 * same thing and stopped being blocked at the same moment: the client cannot know that a
 * fact reached mastery or that a streak grew without being told, and a client that
 * DECIDES either is a client that can be edited. `submit-lesson` returns both now.
 *
 * A separate file from `sync.test.ts` because it mocks the analytics module, and a mock
 * that broad in the main sync suite would hide a real regression in the sink from every
 * other test in it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubmitLessonResponse } from '@worldquest/api'

const track = vi.fn()
vi.mock('./analytics.js', () => ({ track: (...args: readonly unknown[]) => track(...args) }))

const { __testReconcile } = await import('./sync.js')

/**
 * `Object.assign` onto a complete base, not a spread of `Partial`.
 *
 * `exactOptionalPropertyTypes` is on, and under it `{...base, ...partial}` is not
 * assignable to the base type: the partial may carry an explicit `undefined` where the
 * target wants the key absent. Assigning onto a value that is already the right type
 * keeps the compiler's guarantee instead of casting it away.
 */
const response = (over: Partial<SubmitLessonResponse> = {}): SubmitLessonResponse =>
  Object.assign(
    {
      lessonId: 'lesson-1',
      items: 5,
      correct: 5,
      accuracy: 1,
      xpAwarded: 50,
      coinsAwarded: 25,
      perfect: true,
      rejected: 0,
      timingDiscarded: false,
      replayed: false,
    } satisfies SubmitLessonResponse,
    over,
  )

const fired = (name: string) => track.mock.calls.filter((call) => call[0] === name)

beforeEach(() => {
  track.mockClear()
})

describe('what the server tells us, as analytics', () => {
  it('reports a fact that reached mastery, and only the ones that did', () => {
    __testReconcile(
      response({
        masteryChanges: [
          { factId: 'geo.SE.capital', from: 'learning', to: 'mastered' },
          { factId: 'geo.NO.flag', from: 'unseen', to: 'learning' },
          { factId: 'geo.DK.capital', from: 'mastered', to: 'burnished' },
        ],
      }),
    )
    expect(fired('fact_mastered').map((call) => call[1])).toEqual([
      { fact_id: 'geo.SE.capital' },
      { fact_id: 'geo.DK.capital' },
    ])
  })

  it('sends only the properties the response actually carries', () => {
    // The registry declares `days_to_master` and `total_reviews`. The response does not
    // carry them — they live in `review_log` — and inventing either would put a wrong
    // figure in the one dashboard that measures whether the product works.
    __testReconcile(
      response({ masteryChanges: [{ factId: 'geo.SE.capital', from: 'learning', to: 'mastered' }] }),
    )
    expect(Object.keys(fired('fact_mastered')[0]![1] as object)).toEqual(['fact_id'])
  })

  it('reports the streak the server holds, never one the client worked out', () => {
    __testReconcile(
      response({
        streak: { current: 12, longest: 30, extended: true, freezeUsed: false, reset: false },
      }),
    )
    expect(fired('streak_extended')).toHaveLength(1)
    expect(fired('streak_extended')[0]![1]).toEqual({ length: 12 })
  })

  it('says nothing on a second lesson of a day the streak already grew on', () => {
    // The bug the type checker caught. This fired on `current > 0`, which is every lesson
    // of every active day — so the chart would have counted lessons and called them
    // streaks. `extended` is the server answering the question directly.
    __testReconcile(
      response({
        streak: { current: 7, longest: 30, extended: false, freezeUsed: false, reset: false },
      }),
    )
    expect(fired('streak_extended')).toHaveLength(0)
  })

  it('reports a break with the length lost and whether a freeze absorbed it', () => {
    // Both declared properties, both real. Whether freezes actually save streaks is the
    // whole reason they exist, and no other event can answer it.
    __testReconcile(
      response({
        streak: { current: 1, longest: 21, extended: false, freezeUsed: true, reset: true },
      }),
    )
    expect(fired('streak_broken')[0]![1]).toEqual({ length: 21, freeze_used: true })
  })

  it('says nothing when the server sent no streak at all', () => {
    __testReconcile(response())
    expect(fired('streak_extended')).toHaveLength(0)
  })
})

describe('xp_reconciliation_failed', () => {
  // A DISTINCT lesson id per test. `recordPredictedAward` is keyed on it and returns
  // early for one it already holds — that is what stops a replayed lesson counting twice
  // — and the storage double is per-file, so reusing an id here made the second record a
  // silent no-op and the test compared 50 against 50.
  it('stays silent when the prediction was right', async () => {
    const { recordPredictedAward, resetAwardsCache } = await import('./awards.js')
    resetAwardsCache()
    recordPredictedAward({ lessonId: 'agreed', xp: 50, coins: 25, localDay: '2026-08-19' })
    __testReconcile(response({ lessonId: 'agreed', xpAwarded: 50 }))
    expect(fired('xp_reconciliation_failed')).toHaveLength(0)
  })

  it('reports both numbers when the client and the server disagree', async () => {
    // `docs/engineering/rollback-plan.md` step 1 names this as one of the two ways to
    // tell "our release" from "the internet", and it had no caller — so that step was
    // "wait for a user to complain" twice over rather than once. A disagreement is a
    // grading bug, a stale balance table, or somebody editing the client.
    const { recordPredictedAward, resetAwardsCache } = await import('./awards.js')
    resetAwardsCache()
    recordPredictedAward({ lessonId: 'disagreed', xp: 80, coins: 25, localDay: '2026-08-19' })
    __testReconcile(response({ lessonId: 'disagreed', xpAwarded: 50 }))
    expect(fired('xp_reconciliation_failed')[0]![1]).toEqual({ client_xp: 80, server_xp: 50 })
  })

  it('stays silent when there is no prediction to compare against', async () => {
    // A replayed lesson from a queue that outlived its award record. Absent is not a
    // disagreement, and reporting one would make a spike out of an ordinary flush.
    const { resetAwardsCache } = await import('./awards.js')
    resetAwardsCache()
    __testReconcile(response({ lessonId: 'never-predicted', xpAwarded: 50 }))
    expect(fired('xp_reconciliation_failed')).toHaveLength(0)
  })
})
