import { describe, expect, it } from 'vitest'
import { optimisticProgress, settledAwards, type PredictedAward } from './optimistic.js'

const award = (over: Partial<PredictedAward> = {}): PredictedAward => ({
  lessonId: 'l1',
  xp: 120,
  coins: 30,
  localDay: '2026-08-10',
  deliveredAt: null,
  ...over,
})

const server = {
  xpTotal: 1_000,
  coins: 400,
  streak: 3,
  lastActiveDate: '2026-08-09',
}

const at = (over: Partial<Parameters<typeof optimisticProgress>[0]> = {}) =>
  optimisticProgress({
    authoritative: server,
    awards: [],
    progressFetchedAt: 5_000,
    today: '2026-08-10',
    ...over,
  })

describe('optimisticProgress — the offline lesson', () => {
  it('shows XP the server has not seen', () => {
    // The bug in one assertion: before this, a lesson finished on a plane moved nothing
    // on Home, Profile or Streak, because every one of those figures came from the
    // server and the lesson was sitting in the queue.
    const shown = at({ awards: [award()] })

    expect(shown.xpTotal).toBe(1_120)
    expect(shown.pendingXp).toBe(120)
    expect(shown.pendingLessons).toBe(1)
    expect(shown.isOptimistic).toBe(true)
  })

  it('leaves the spendable balance alone, and predicts it separately', () => {
    // Coins are a wallet, not a record. Counting queued coins into the balance offers a
    // purchase the server is about to refuse — the user taps Buy on something they can
    // "afford" and is told no, which is worse than a balance that lags by one sync.
    const shown = at({ awards: [award()] })

    expect(shown.coins).toBe(400)
    expect(shown.coinsIncludingPending).toBe(430)
    expect(shown.pendingCoins).toBe(30)
  })

  it('adds nothing at all when there is nothing queued', () => {
    // The overwhelmingly common case, and the one that must be exactly the server's
    // numbers — an optimistic layer that drifts when it has no work to do would be
    // worse than not having one.
    const shown = at()

    expect(shown).toMatchObject({
      xpTotal: server.xpTotal,
      coins: server.coins,
      coinsIncludingPending: server.coins,
      streak: server.streak,
      lastActiveDate: server.lastActiveDate,
      pendingXp: 0,
      pendingCoins: 0,
      pendingLessons: 0,
      isOptimistic: false,
    })
  })

  it('counts every queued lesson, not just the last one', () => {
    const shown = at({
      awards: [award({ lessonId: 'a' }), award({ lessonId: 'b' }), award({ lessonId: 'c' })],
    })

    expect(shown.pendingXp).toBe(360)
    expect(shown.pendingLessons).toBe(3)
  })
})

describe('optimisticProgress — the streak', () => {
  it('extends by one when today is not counted yet', () => {
    expect(at({ awards: [award({ localDay: '2026-08-10' })] }).streak).toBe(4)
  })

  it('moves the last active date with it', () => {
    // The number alone is not enough. `currentStreak()` re-derives whether a run is still
    // alive from this date and returns 0 when it is null, so an optimistic `current` fed
    // in beside the server's stale date got zeroed straight back out — Profile said "1
    // day streak" while Streak said "No days yet".
    expect(at({ awards: [award({ localDay: '2026-08-10' })] }).lastActiveDate).toBe('2026-08-10')
  })

  it('leaves the date alone when the queued lesson is from an earlier day', () => {
    // The server will credit yesterday to yesterday. Moving the date forward would claim
    // activity on a day the user did not have any.
    expect(at({ awards: [award({ localDay: '2026-08-09' })] }).lastActiveDate).toBe('2026-08-09')
  })

  it('does not extend twice for two lessons on the same day', () => {
    // A streak is a count of DAYS. Summing it the way XP is summed would give a user
    // who did three lessons this morning a streak three longer than they have.
    const shown = at({
      awards: [
        award({ lessonId: 'a', localDay: '2026-08-10' }),
        award({ lessonId: 'b', localDay: '2026-08-10' }),
      ],
    })

    expect(shown.streak).toBe(4)
  })

  it('does not extend when the server already counted today', () => {
    // The lesson synced, the streak moved, and a second lesson is queued. Adding again
    // would show 5 for a user whose streak is 4 — and it would snap back on the next
    // refetch, which is the flicker this whole module is shaped to avoid.
    const shown = optimisticProgress({
      authoritative: { ...server, streak: 4, lastActiveDate: '2026-08-10' },
      awards: [award({ localDay: '2026-08-10' })],
      progressFetchedAt: 5_000,
      today: '2026-08-10',
    })

    expect(shown.streak).toBe(4)
  })

  it('ignores a queued lesson from a previous day', () => {
    // Finished last night in a tunnel, still queued this morning. It is XP the user is
    // owed and it is not evidence about today — the server will credit yesterday.
    const shown = at({ awards: [award({ localDay: '2026-08-09' })] })

    expect(shown.streak).toBe(3)
    expect(shown.xpTotal).toBe(1_120)
  })

  it('never predicts a streak going down', () => {
    // A gap between `lastActiveDate` and today could mean broken, reduced, or covered
    // by a freeze, and this cannot tell them apart. Guessing would show a number that
    // then falls, which is worse than one that lags.
    const shown = optimisticProgress({
      authoritative: { ...server, streak: 9, lastActiveDate: '2026-07-01' },
      awards: [],
      progressFetchedAt: 5_000,
      today: '2026-08-10',
    })

    expect(shown.streak).toBe(9)
  })
})

describe('optimisticProgress — settling', () => {
  it('keeps counting an award the server accepted but has not reported back', () => {
    // The flicker this prevents: the mutation is acknowledged at t=6000 and the progress
    // query last read at t=5000, so the server's totals are from BEFORE the lesson.
    // Dropping the prediction here would show the old number and then jump.
    const shown = at({
      awards: [award({ deliveredAt: 6_000 })],
      progressFetchedAt: 5_000,
    })

    expect(shown.xpTotal).toBe(1_120)
    expect(shown.isOptimistic).toBe(true)
  })

  it('stops counting once the totals were fetched after delivery', () => {
    const shown = at({
      awards: [award({ deliveredAt: 6_000 })],
      progressFetchedAt: 7_000,
    })

    expect(shown.xpTotal).toBe(1_000)
    expect(shown.pendingLessons).toBe(0)
    expect(shown.isOptimistic).toBe(false)
  })

  it('treats never-fetched totals as covering nothing', () => {
    // A first launch offline: the authoritative figures are the zeroed cold start and
    // have never been read. Everything the user has done is unsettled, which is the
    // whole reason they can see it.
    const shown = optimisticProgress({
      authoritative: { xpTotal: 0, coins: 0, streak: 0, lastActiveDate: null },
      awards: [award({ deliveredAt: 3_000 })],
      progressFetchedAt: 0,
      today: '2026-08-10',
    })

    expect(shown.xpTotal).toBe(120)
    expect(shown.streak).toBe(1)
  })

  it('splits every award into exactly one of settled and unsettled', () => {
    // The partition matters more than either half: an award in NEITHER is a row the
    // pruner leaks forever, and one in BOTH is counted and deleted at the same time —
    // which is the flicker, back again. Asserted through the two things callers can
    // actually see, because the unsettled list itself is module-private.
    const awards = [
      award({ lessonId: 'a', deliveredAt: null }),
      award({ lessonId: 'b', deliveredAt: 6_000 }),
      award({ lessonId: 'c', deliveredAt: 4_000 }),
    ]

    const done = settledAwards(awards, 5_000)
    const open = at({ awards, progressFetchedAt: 5_000 }).pendingLessons

    expect(done.map((a) => a.lessonId)).toEqual(['c'])
    expect(open).toBe(2)
    expect(open + done.length).toBe(awards.length)
  })
})
