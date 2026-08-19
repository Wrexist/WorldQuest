/**
 * The predicted-award ledger, executed.
 *
 * ## Why this file needed one
 *
 * These 130 lines decide the XP and coin figures a user SEES between finishing a lesson
 * and the server confirming it — which, offline, is every figure they see. Home, Profile
 * and the streak card all render `optimisticProgress(authoritative + these rows)`.
 * `sync.ts` also compares the total here against the server's answer and fires
 * `xp_reconciliation_failed` when they disagree, which is the release-health signal the
 * rollback plan names.
 *
 * The engine half — `optimisticProgress`, `settledAwards` — is well tested in
 * `packages/engines/src/sync/optimistic.test.ts`. What was not tested is the half that
 * needs a device: the persistence, the shape checking on the way back in, the cap, and
 * the idempotency that stops one lesson counting twice.
 *
 * Every one of those is a defence written against a specific failure, and a defence
 * nothing executes is a comment.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  markAwardDelivered,
  peekAwards,
  pruneSettledAwards,
  recordPredictedAward,
  resetAwardsCache,
} from './awards.js'
import { readJson, remove, writeJson } from './storage.js'

const KEY = 'awards.predicted.v1'

const award = (over: Partial<{ lessonId: string; xp: number; coins: number; localDay: string }> = {}) => ({
  lessonId: over.lessonId ?? 'lesson-1',
  xp: over.xp ?? 30,
  coins: over.coins ?? 10,
  localDay: over.localDay ?? '2026-08-19',
})

beforeEach(() => {
  remove(KEY)
  resetAwardsCache()
})

describe('recording what a lesson is expected to be worth', () => {
  it('keeps the figures the summary card already showed', () => {
    recordPredictedAward(award())
    expect(peekAwards()).toEqual([
      { lessonId: 'lesson-1', xp: 30, coins: 10, localDay: '2026-08-19', deliveredAt: null },
    ])
  })

  it('counts a lesson once however many times it is recorded', () => {
    // `lessonId` is the server's idempotency key. A double-record here would show the
    // user XP they are not going to be paid, and then take it away when the real total
    // arrives — which reads as the app removing XP for finishing a lesson.
    recordPredictedAward(award())
    recordPredictedAward(award({ xp: 999 }))
    expect(peekAwards()).toHaveLength(1)
    expect(peekAwards()[0]?.xp).toBe(30)
  })

  it('survives a cold start', () => {
    // The whole reason this is persisted: a lesson finished in a tunnel has to survive
    // the app being killed on the walk home, or the visible XP zeroes on every launch
    // until the queue happens to flush.
    recordPredictedAward(award())
    resetAwardsCache()
    expect(peekAwards()).toHaveLength(1)
  })
})

describe('rows that came back wrong', () => {
  it('drops a row whose xp is not a finite number, and keeps the rest', () => {
    // `pendingXp` is `reduce((sum, a) => sum + a.xp, 0)`. A string turns the user's
    // visible total into "0" + "10"; a null turns it into NaN, rendered as "NaN XP" on
    // Home on top of a real balance. `Array.isArray` and a cast admitted both.
    writeJson(KEY, [
      { lessonId: 'good', xp: 30, coins: 10, localDay: '2026-08-19', deliveredAt: null },
      { lessonId: 'string-xp', xp: '10', coins: 10, localDay: '2026-08-19', deliveredAt: null },
      { lessonId: 'null-xp', xp: null, coins: 10, localDay: '2026-08-19', deliveredAt: null },
      { lessonId: 'nan-coins', xp: 10, coins: Number.NaN, localDay: '2026-08-19', deliveredAt: null },
      { lessonId: 'no-day', xp: 10, coins: 10, deliveredAt: null },
      { lessonId: 42, xp: 10, coins: 10, localDay: '2026-08-19', deliveredAt: null },
      'not even an object',
      null,
    ])
    resetAwardsCache()
    // A bad ROW is dropped, never the file — unlike the sync queue. These are independent
    // predictions of independent lessons, and each lesson is still queued and still going
    // to be paid.
    expect(peekAwards().map((a) => a.lessonId)).toEqual(['good'])
  })

  it('accepts a delivered row and rejects a nonsense delivery time', () => {
    writeJson(KEY, [
      { lessonId: 'a', xp: 1, coins: 1, localDay: '2026-08-19', deliveredAt: 1_700_000_000_000 },
      { lessonId: 'b', xp: 1, coins: 1, localDay: '2026-08-19', deliveredAt: 'yesterday' },
      { lessonId: 'c', xp: 1, coins: 1, localDay: '2026-08-19' },
    ])
    resetAwardsCache()
    expect(peekAwards().map((a) => a.lessonId)).toEqual(['a'])
  })

  it('reads a file that is not an array as no awards at all', () => {
    for (const stored of [{ lessonId: 'a' }, 'nope', 42]) {
      writeJson(KEY, stored)
      resetAwardsCache()
      expect(peekAwards(), JSON.stringify(stored)).toEqual([])
    }
  })
})

describe('delivery and pruning', () => {
  it('marks a row delivered without changing what it is worth', () => {
    recordPredictedAward(award())
    markAwardDelivered('lesson-1', 1_700_000_000_000)
    expect(peekAwards()[0]).toMatchObject({ xp: 30, deliveredAt: 1_700_000_000_000 })
  })

  it('ignores a delivery for a lesson it does not hold, and does not re-stamp one', () => {
    // Both are ordinary: a replayed queue flush delivers the same lesson twice, and a
    // prune can have already retired the row. Re-stamping the second time would push the
    // row past the fetch time it was already settled against and resurrect it.
    recordPredictedAward(award())
    markAwardDelivered('lesson-1', 1_000)
    markAwardDelivered('lesson-1', 9_999)
    markAwardDelivered('never-existed', 1_000)
    expect(peekAwards()[0]?.deliveredAt).toBe(1_000)
  })

  it('forgets only what the server has both accepted and reported back', () => {
    recordPredictedAward(award({ lessonId: 'settled' }))
    recordPredictedAward(award({ lessonId: 'in-flight' }))
    markAwardDelivered('settled', 1_000)
    // Totals fetched after the delivery: 'settled' is now inside them and can go.
    // 'in-flight' has never been accepted, so it keeps counting.
    pruneSettledAwards(2_000)
    expect(peekAwards().map((a) => a.lessonId)).toEqual(['in-flight'])
  })

  it('keeps a row the server accepted AFTER the totals were fetched', () => {
    // The race this exists for: the figures on screen were read before the lesson landed,
    // so they do not contain it yet. Dropping the row here would make the XP disappear
    // until the next fetch.
    recordPredictedAward(award())
    markAwardDelivered('lesson-1', 3_000)
    pruneSettledAwards(2_000)
    expect(peekAwards()).toHaveLength(1)
  })

  it('leaves storage untouched when there is nothing to prune', () => {
    recordPredictedAward(award())
    const before = readJson<unknown>(KEY)
    pruneSettledAwards(9_999)
    expect(readJson<unknown>(KEY)).toEqual(before)
  })
})

describe('the ceiling', () => {
  it('keeps the newest rows and never grows without bound', () => {
    // Generous on purpose: losing a row under-reports XP the user really earned, which is
    // the bug this file exists to fix. It only binds for someone with hundreds of
    // unsynced lessons, whose sync queue is the real problem by then.
    for (let i = 0; i < 520; i++) recordPredictedAward(award({ lessonId: `l${i}`, xp: i }))
    const rows = peekAwards()
    expect(rows).toHaveLength(500)
    expect(rows[rows.length - 1]?.lessonId).toBe('l519')
    expect(rows[0]?.lessonId).toBe('l20')
  })
})
