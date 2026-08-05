import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MS_PER_DAY } from '../shared/index.js'
import {
  DEFAULT_WEIGHTS,
  MASTERY_THRESHOLDS,
  deriveRating,
  intervalDays,
  masteryOf,
  rebuild,
  retrievability,
  review,
} from './fsrs.js'
import { DEFAULT_TARGET_RETENTION, type MemoryState, type Rating, type ReviewEvent } from './types.js'

const T0 = 1_800_000_000_000
const FACT = 'geo.JP.capital'

const first = (rating: Rating = 3, now = T0) =>
  review({ factId: FACT, state: null, rating, now })

describe('review — first exposure', () => {
  it('schedules a first correct answer a few days out', () => {
    const state = first(3)
    const days = (state.dueAt - T0) / MS_PER_DAY
    expect(days).toBeGreaterThan(1)
    expect(days).toBeLessThan(10)
    expect(state.reps).toBe(1)
    expect(state.lapses).toBe(0)
    expect(state.lastReviewAt).toBe(T0)
  })

  it('counts a first wrong answer as a lapse and schedules it sooner', () => {
    const wrong = first(1)
    const right = first(3)
    expect(wrong.lapses).toBe(1)
    expect(wrong.dueAt).toBeLessThan(right.dueAt)
  })

  it('orders initial stability by rating: again < hard < good < easy', () => {
    const stabilities = ([1, 2, 3, 4] as Rating[]).map((r) => first(r).stability)
    for (let i = 1; i < stabilities.length; i++) {
      expect(stabilities[i]!).toBeGreaterThan(stabilities[i - 1]!)
    }
  })

  it('puts initial difficulty mid-range, not on a clamp boundary', () => {
    // This is the check that catches a bad weight vector immediately. A vector
    // whose difficulty formula is mismatched pins D at 1, which maximises the
    // (11 - D) growth term and produces decades-long intervals.
    const d = first(3).difficulty
    expect(d).toBeGreaterThan(3)
    expect(d).toBeLessThan(8)
  })
})

describe('review — repeated exposure', () => {
  it('grows intervals monotonically across consecutive correct answers', () => {
    let state: MemoryState | null = null
    let now = T0
    const intervals: number[] = []

    for (let i = 0; i < 5; i++) {
      state = review({ factId: FACT, state, rating: 3, now })
      intervals.push(state.dueAt - now)
      now = state.dueAt
    }

    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]!).toBeGreaterThan(intervals[i - 1]!)
    }
  })

  it('never increases stability on a lapse', () => {
    let state = first(3)
    state = review({ factId: FACT, state, rating: 3, now: state.dueAt })
    const before = state.stability
    const after = review({ factId: FACT, state, rating: 1, now: state.dueAt })
    expect(after.stability).toBeLessThan(before)
    expect(after.lapses).toBe(1)
  })

  it('rewards Easy more than Good, and Good more than Hard', () => {
    const base = first(3)
    const at = base.dueAt
    const hard = review({ factId: FACT, state: base, rating: 2, now: at }).stability
    const good = review({ factId: FACT, state: base, rating: 3, now: at }).stability
    const easy = review({ factId: FACT, state: base, rating: 4, now: at }).stability
    expect(hard).toBeLessThan(good)
    expect(good).toBeLessThan(easy)
  })

  it('caps the interval at one year', () => {
    let state: MemoryState | null = null
    let now = T0
    for (let i = 0; i < 12; i++) {
      state = review({ factId: FACT, state, rating: 4, now })
      now = state.dueAt
    }
    const finalInterval = (state!.dueAt - state!.lastReviewAt!) / MS_PER_DAY
    // A product cap, not a mathematical one: a geography app that never checks in
    // on Japan again has quietly stopped being able to claim you know it.
    expect(finalInterval).toBeLessThanOrEqual(365)
  })

  it('suspends a fact as a leech after 8 lapses', () => {
    let state: MemoryState | null = null
    let now = T0
    for (let i = 0; i < 8; i++) {
      state = review({ factId: FACT, state, rating: 1, now })
      now = state.dueAt
    }
    expect(state!.lapses).toBe(8)
    expect(state!.suspended).toBe(true)
  })

  it('keeps difficulty within 1..10 under any rating sequence', () => {
    let state: MemoryState | null = null
    let now = T0
    for (const rating of [1, 1, 4, 4, 1, 2, 4, 3, 1, 4] as Rating[]) {
      state = review({ factId: FACT, state, rating, now })
      expect(state.difficulty).toBeGreaterThanOrEqual(1)
      expect(state.difficulty).toBeLessThanOrEqual(10)
      now = state.dueAt
    }
  })
})

describe('retrievability', () => {
  it('is 1.0 immediately after a review and decays with time', () => {
    const state = first(3)
    expect(retrievability(state, state.lastReviewAt!)).toBeCloseTo(1, 5)
    const later = retrievability(state, state.lastReviewAt! + 30 * MS_PER_DAY)
    expect(later).toBeLessThan(1)
    expect(later).toBeGreaterThan(0)
  })

  it('equals the target retention at dueAt when the interval is uncapped', () => {
    const state = first(3)
    expect(retrievability(state, state.dueAt)).toBeCloseTo(DEFAULT_TARGET_RETENTION, 4)
  })

  it('is above target at dueAt when the 365-day cap binds', () => {
    let state: MemoryState | null = null
    let now = T0
    for (let i = 0; i < 12; i++) {
      state = review({ factId: FACT, state, rating: 4, now })
      now = state.dueAt
    }
    expect(retrievability(state!, state!.dueAt)).toBeGreaterThan(DEFAULT_TARGET_RETENTION)
  })

  it('returns 0 for a never-reviewed state', () => {
    const unseen: MemoryState = {
      factId: FACT,
      stability: 1,
      difficulty: 5,
      reps: 0,
      lapses: 0,
      lastReviewAt: null,
      dueAt: T0,
      suspended: false,
    }
    expect(retrievability(unseen, T0)).toBe(0)
  })
})

describe('intervalDays', () => {
  it('grows with stability', () => {
    expect(intervalDays(10, 0.9)).toBeGreaterThan(intervalDays(1, 0.9))
  })

  it('shortens as the retention target rises', () => {
    // Wanting to remember more means reviewing more often. This is the knob we
    // expose to users in human terms.
    expect(intervalDays(10, 0.95)).toBeLessThan(intervalDays(10, 0.85))
  })
})

describe('masteryOf', () => {
  const stateWith = (over: Partial<MemoryState>): MemoryState => ({
    factId: FACT,
    stability: 1,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    lastReviewAt: T0,
    dueAt: T0 + MS_PER_DAY,
    suspended: false,
    ...over,
  })

  it('reports unseen for null or never-reviewed state', () => {
    expect(masteryOf(null, T0)).toBe('unseen')
    expect(masteryOf(stateWith({ lastReviewAt: null }), T0)).toBe('unseen')
  })

  it('transitions at the documented boundaries', () => {
    expect(masteryOf(stateWith({ stability: 0.5 }), T0)).toBe('learning')
    expect(masteryOf(stateWith({ stability: 2, reps: 1 }), T0)).toBe('familiar')
    expect(masteryOf(stateWith({ stability: 7, reps: 3, lapses: 1 }), T0)).toBe('proficient')
    expect(masteryOf(stateWith({ stability: 21, reps: 5 }), T0)).toBe('mastered')
    expect(masteryOf(stateWith({ stability: 180, reps: 9, lapses: 0 }), T0)).toBe('burnished')
  })

  it('withholds proficient from a fact with too many lapses', () => {
    // "183 / 195 countries" has to mean something specific, so the boundary is
    // strict about lapses rather than just elapsed time.
    expect(masteryOf(stateWith({ stability: 7, reps: 3, lapses: 3 }), T0)).not.toBe('proficient')
  })

  it('withholds burnished from a fact that has ever lapsed', () => {
    expect(masteryOf(stateWith({ stability: 200, reps: 9, lapses: 1 }), T0)).toBe('mastered')
  })
})

/**
 * The stored half of mastery, and the only guard that can exist against it drifting.
 *
 * `user_facts.mastery` is derived by a Postgres trigger. A trigger cannot import this
 * module, so the rule genuinely exists twice — the one situation this repo's "two
 * copies of a rule are one copy and one bug" note cannot design away. What it CAN do is
 * make the second copy fail loudly when the first one moves.
 *
 * So the numbers have names (`MASTERY_THRESHOLDS`) and this reads the migration and
 * checks the CASE uses them. Change a boundary in `masteryOf` without changing the
 * migration and the count on Home starts disagreeing with the label on the country
 * card — silently, and only for users whose facts sit near the boundary. That is the
 * failure this exists to make impossible.
 */
describe('stored mastery agrees with masteryOf', () => {
  const migration = readFileSync(
    new URL('../../../../supabase/migrations/20260805090000_mastery_is_derived.sql', import.meta.url),
    'utf8',
  )

  /** Both copies of the CASE — the trigger body and the backfill — must match. */
  const cases = migration.match(/when new\.stability[\s\S]*?else 'learning'/g) ?? []
  const backfills = migration.match(/when stability[\s\S]*?else 'learning'/g) ?? []

  it('the migration still contains both copies of the rule', () => {
    expect(cases).toHaveLength(1)
    expect(backfills).toHaveLength(1)
  })

  it.each([
    ['burnished', MASTERY_THRESHOLDS.burnishedStability, /stability >= (\d+) and \w*\.?lapses = 0\s+then 'burnished'/],
    ['mastered', MASTERY_THRESHOLDS.masteredStability, /stability >= (\d+)\s+and \w*\.?reps\s+>= \d+\s+then 'mastered'/],
    ['proficient', MASTERY_THRESHOLDS.proficientStability, /stability >= (\d+)\s+and \w*\.?reps\s+>= \d+ and \w*\.?lapses <= \d+\s+then 'proficient'/],
  ])('the %s stability boundary is %i in SQL too', (_level, expected, pattern) => {
    for (const clause of [...cases, ...backfills]) {
      const found = clause.match(pattern)
      expect(found, `no ${_level} clause in:\n${clause}`).not.toBeNull()
      expect(Number(found![1])).toBe(expected)
    }
  })

  it('SQL never claims a level that depends on retrievability', () => {
    // 'familiar' and 'unseen' are functions of `now`, so a stored column cannot hold
    // them. If one appears here somebody has stored an answer that expires.
    expect(migration).not.toMatch(/then 'familiar'/)
    expect(migration).not.toMatch(/then 'unseen'/)
  })

  /**
   * The behavioural half: for every level the trigger CAN produce, it must produce the
   * same one `masteryOf` does. Transcribed from the SQL rather than shared with it,
   * which is the point — a transcription that stops matching is what fails.
   */
  it('agrees with masteryOf on every level a row can store', () => {
    const stored = (s: MemoryState): string => {
      const t = MASTERY_THRESHOLDS
      if (s.stability >= t.burnishedStability && s.lapses === 0) return 'burnished'
      if (s.stability >= t.masteredStability && s.reps >= t.masteredReps) return 'mastered'
      if (
        s.stability >= t.proficientStability &&
        s.reps >= t.proficientReps &&
        s.lapses <= t.proficientLapses
      ) {
        return 'proficient'
      }
      return 'learning'
    }

    for (const stability of [0.5, 1, 6.9, 7, 20.9, 21, 179.9, 180, 400]) {
      for (const reps of [1, 2, 3, 4, 5, 12]) {
        for (const lapses of [0, 1, 2, 9]) {
          const state: MemoryState = {
            factId: FACT,
            stability,
            difficulty: 5,
            reps,
            lapses,
            lastReviewAt: T0,
            dueAt: T0 + MS_PER_DAY,
            suspended: false,
          }
          const live = masteryOf(state, T0)
          // 'familiar' has no stored form, so the only legitimate disagreement is the
          // trigger saying 'learning' where the live label says 'familiar'.
          const expected = live === 'familiar' ? 'learning' : live
          expect(stored(state), `s=${stability} reps=${reps} lapses=${lapses}`).toBe(expected)
        }
      }
    }
  })
})

describe('deriveRating', () => {
  const median = 3000

  it('returns Again for a wrong answer regardless of speed', () => {
    expect(deriveRating(false, 200, median)).toBe(1)
    expect(deriveRating(false, 20_000, median)).toBe(1)
  })

  it('returns Hard for a correct but slow answer', () => {
    expect(deriveRating(true, median * 3, median)).toBe(2)
  })

  it('returns Good for a correct answer at typical speed', () => {
    expect(deriveRating(true, median, median)).toBe(3)
  })

  it('returns Easy for instant recall', () => {
    expect(deriveRating(true, median * 0.4, median)).toBe(4)
  })

  it('caps elapsed time so a put-down phone is not scored as forgetting', () => {
    // Without the cap, walking away mid-lesson would permanently mark a fact hard.
    expect(deriveRating(true, 10 * 60 * 1000, 60_000)).toBe(3)
  })
})

describe('rebuild', () => {
  it('reproduces incrementally-computed state exactly', () => {
    // THE recovery guarantee. review_log is authoritative and user_facts is a
    // cache, so a weight change or a corrupted row is always recoverable. This
    // test may never be skipped.
    const log: ReviewEvent[] = []
    let state: MemoryState | null = null
    let now = T0

    for (const rating of [3, 3, 1, 3, 4, 2, 3, 3] as Rating[]) {
      state = review({ factId: FACT, state, rating, now })
      log.push({
        factId: FACT,
        templateId: 'tpl.capital.mc4',
        rating,
        wasCorrect: rating > 1,
        elapsedMs: 2000,
        at: now,
      })
      now = state.dueAt
    }

    expect(rebuild(log).get(FACT)).toEqual(state)
  })

  it('is order-independent — it sorts the log by timestamp', () => {
    const log: ReviewEvent[] = [3, 1, 4].map((rating, i) => ({
      factId: FACT,
      templateId: 'tpl.capital.mc4',
      rating: rating as Rating,
      wasCorrect: rating > 1,
      elapsedMs: 2000,
      at: T0 + i * 10 * MS_PER_DAY,
    }))

    expect(rebuild([...log].reverse()).get(FACT)).toEqual(rebuild(log).get(FACT))
  })

  it('rebuilds independent state per fact', () => {
    const log: ReviewEvent[] = [
      { factId: 'geo.JP.capital', templateId: 't', rating: 4, wasCorrect: true, elapsedMs: 1000, at: T0 },
      { factId: 'geo.SE.capital', templateId: 't', rating: 1, wasCorrect: false, elapsedMs: 5000, at: T0 },
    ]
    const out = rebuild(log)
    expect(out.size).toBe(2)
    expect(out.get('geo.JP.capital')!.stability).toBeGreaterThan(
      out.get('geo.SE.capital')!.stability,
    )
  })

  it('returns an empty map for an empty log', () => {
    expect(rebuild([]).size).toBe(0)
  })
})

describe('properties', () => {
  it('never produces NaN, negative stability, or a due date in the past', () => {
    // 10,000 random review sequences. Scheduling bugs are silent — nobody files a
    // ticket saying "your scheduler is miscalibrated", they just leave.
    let seed = 12345
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff

    for (let i = 0; i < 10_000; i++) {
      let state: MemoryState | null = null
      let now = T0
      const steps = 1 + Math.floor(rnd() * 12)

      for (let s = 0; s < steps; s++) {
        const rating = (1 + Math.floor(rnd() * 4)) as Rating
        state = review({ factId: FACT, state, rating, now })

        expect(Number.isFinite(state.stability)).toBe(true)
        expect(state.stability).toBeGreaterThan(0)
        expect(Number.isFinite(state.difficulty)).toBe(true)
        expect(state.difficulty).toBeGreaterThanOrEqual(1)
        expect(state.difficulty).toBeLessThanOrEqual(10)
        expect(state.dueAt).toBeGreaterThan(now)
        expect(state.reps).toBe(s + 1)

        now = state.dueAt + Math.floor(rnd() * 5 * MS_PER_DAY)
      }
    }
  })

  it('is deterministic — identical inputs give identical output', () => {
    const a = review({ factId: FACT, state: null, rating: 3, now: T0 })
    const b = review({ factId: FACT, state: null, rating: 3, now: T0 })
    expect(a).toEqual(b)
  })

  it('accepts an explicit weight vector', () => {
    const custom = DEFAULT_WEIGHTS.map((w) => w * 1.1)
    expect(review({ factId: FACT, state: null, rating: 3, now: T0 }, custom).stability)
      .not.toBe(first(3).stability)
  })
})
