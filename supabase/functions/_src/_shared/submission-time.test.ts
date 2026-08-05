/**
 * The exploit these tests describe was real, and green tests did not catch it — the
 * grader was fully covered and the field it trusted was never asserted about. So these
 * are written as the attacks rather than as the API: each one names what a modified
 * client was able to mint before the clamp existed.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  MAX_ANSWER_MS,
  MAX_OFFLINE_AGE_MS,
  MIN_ANSWER_MS,
  NO_TIMING_SIGNAL_MS,
  clampStartedAt,
  isFiniteMs,
  retimeLesson,
} from './submission-time.js'

const NOW = 1_800_000_000_000
const MINUTE = 60_000

/** A plausible lesson: ten answers, a few seconds apart, finishing just before now. */
const realLesson = (count = 10, spacing = 6_000) => {
  const startedAt = NOW - (count + 1) * spacing
  return {
    startedAt,
    answers: Array.from({ length: count }, (_, i) => ({
      factId: `geo.F${i}.capital`,
      answeredAt: startedAt + (i + 1) * spacing,
      elapsedMs: 4_200,
    })),
  }
}

describe('a real lesson is left alone', () => {
  it('keeps every timestamp and duration of an ordinary session', () => {
    const { startedAt, answers } = realLesson()
    const out = retimeLesson(answers, startedAt, NOW)

    expect(out.startedAt).toBe(startedAt)
    expect(out.timingDiscarded).toBe(false)
    expect(out.answers.map((a) => a.answeredAt)).toEqual(answers.map((a) => a.answeredAt))
    expect(out.answers.map((a) => a.elapsedMs)).toEqual(answers.map((a) => a.elapsedMs))
  })

  it('keeps a lesson finished offline six days ago', () => {
    // The whole reason this clamps rather than rejects. A lesson done in a tunnel and
    // synced when the phone found signal must still schedule from when it happened.
    const sixDays = NOW - 6 * 86_400_000
    const answers = [
      { answeredAt: sixDays + 5_000, elapsedMs: 3_000 },
      { answeredAt: sixDays + 12_000, elapsedMs: 3_000 },
      { answeredAt: sixDays + 19_000, elapsedMs: 3_000 },
      { answeredAt: sixDays + 26_000, elapsedMs: 3_000 },
      { answeredAt: sixDays + 33_000, elapsedMs: 3_000 },
    ]
    const out = retimeLesson(answers, sixDays, NOW)

    expect(out.startedAt).toBe(sixDays)
    expect(out.timingDiscarded).toBe(false)
    expect(out.answers.map((a) => a.answeredAt)).toEqual(answers.map((a) => a.answeredAt))
  })

  it('does not push a fast answer below the credibility threshold', () => {
    // A ceiling taken straight from the gap would do exactly that, and the grader
    // discards anything under MIN_ANSWER_MS — so a fast reader would lose the XP for an
    // answer they actually got right.
    const answers = [
      { answeredAt: NOW - 800, elapsedMs: 600 },
      { answeredAt: NOW - 500, elapsedMs: 450 },
    ]
    const out = retimeLesson(answers, NOW - 1_000, NOW)
    for (const a of out.answers) expect(a.elapsedMs).toBeGreaterThanOrEqual(MIN_ANSWER_MS)
  })
})

describe('the timestamp exploit', () => {
  it('refuses to date an answer in the future', () => {
    // THE bug. A year ahead gave retrievability ≈ 0 — the largest stability multiplier
    // the curve has — plus a guaranteed `wasOverdue`, on every item, for ever.
    const answers = [{ answeredAt: NOW + 365 * 86_400_000, elapsedMs: 5_000 }]
    const out = retimeLesson(answers, NOW - MINUTE, NOW)
    expect(out.answers[0]!.answeredAt).toBe(NOW)
  })

  it('refuses to date an answer before the session began', () => {
    const answers = [{ answeredAt: NOW - 10 * 86_400_000, elapsedMs: 5_000 }]
    const out = retimeLesson(answers, NOW - MINUTE, NOW)
    expect(out.answers[0]!.answeredAt).toBe(NOW - MINUTE)
  })

  it('bounds how old a submission may claim to be', () => {
    expect(clampStartedAt(NOW - 400 * 86_400_000, NOW)).toBe(NOW - MAX_OFFLINE_AGE_MS)
    expect(clampStartedAt(NOW + 86_400_000, NOW)).toBe(NOW)
  })

  it('makes answers monotonic rather than dropping a scrambled clock', () => {
    const answers = [
      { answeredAt: NOW - 30_000, elapsedMs: 2_000 },
      { answeredAt: NOW - 90_000, elapsedMs: 2_000 }, // earlier than its predecessor
      { answeredAt: NOW - 10_000, elapsedMs: 2_000 },
    ]
    const out = retimeLesson(answers, NOW - MINUTE * 5, NOW)
    const times = out.answers.map((a) => a.answeredAt)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(times[1]).toBe(times[0]) // pulled forward onto its predecessor
  })

  it('survives NaN, Infinity and 1e300 without producing an invalid date', () => {
    // `typeof x === 'number'` admits all three, and `new Date(1e300).toISOString()`
    // throws — which used to be a 500 anyone could ask for.
    const answers = [
      { answeredAt: Number.NaN, elapsedMs: Number.NaN },
      { answeredAt: 1e300, elapsedMs: Number.POSITIVE_INFINITY },
      { answeredAt: Number.NEGATIVE_INFINITY, elapsedMs: -5 },
    ]
    const out = retimeLesson(answers, Number.NaN, NOW)
    for (const a of out.answers) {
      expect(Number.isFinite(a.answeredAt)).toBe(true)
      expect(() => new Date(a.answeredAt).toISOString()).not.toThrow()
      expect(a.elapsedMs).toBeGreaterThanOrEqual(0)
      expect(a.elapsedMs).toBeLessThanOrEqual(MAX_ANSWER_MS)
    }
    expect(() => new Date(out.startedAt).toISOString()).not.toThrow()
  })
})

describe('the duration exploit', () => {
  it('caps an answer by the gap to the one before it', () => {
    // You cannot spend two minutes on a question you answered three seconds later.
    const answers = [
      { answeredAt: NOW - 20_000, elapsedMs: 5_000 },
      { answeredAt: NOW - 17_000, elapsedMs: 120_000 },
    ]
    const out = retimeLesson(answers, NOW - MINUTE, NOW)
    expect(out.answers[1]!.elapsedMs).toBe(3_000)
  })

  it('discards the timing of a session too short to contain its own answers', () => {
    // The consistent forgery: ten answers, each claiming 401 ms — fast enough for both
    // the Easy rating and the speed bonus — inside a window that also says four seconds.
    // Nothing per-answer separates this from a real lesson, so it is caught in
    // aggregate.
    const startedAt = NOW - 4_000
    const answers = Array.from({ length: 10 }, (_, i) => ({
      answeredAt: startedAt + (i + 1) * 400,
      elapsedMs: 401,
    }))
    const out = retimeLesson(answers, startedAt, NOW)

    expect(out.timingDiscarded).toBe(true)
    for (const a of out.answers) expect(a.elapsedMs).toBe(NO_TIMING_SIGNAL_MS)
  })

  it('credits a discarded session as exactly average, not as a punishment', () => {
    // NO_TIMING_SIGNAL_MS is the grader's own DEFAULT_MEDIAN_MS, so deriveRating returns
    // Good — no Easy bonus, no Hard penalty — and it is far above the 3s speed-bonus
    // threshold. The forged case earns what an ordinary answer earns and nothing more.
    expect(NO_TIMING_SIGNAL_MS).toBeGreaterThan(3_000)
    expect(NO_TIMING_SIGNAL_MS).toBeLessThan(MAX_ANSWER_MS)
  })

  it('does not discard the timing of a slow, genuine session', () => {
    const { startedAt, answers } = realLesson(10, 6_000)
    expect(retimeLesson(answers, startedAt, NOW).timingDiscarded).toBe(false)
  })

  it('handles an empty answer list without claiming the timing is forged', () => {
    expect(retimeLesson([], NOW - MINUTE, NOW).timingDiscarded).toBe(false)
  })
})

describe('constants agree with the engine', () => {
  /**
   * The shared modules declare their own copies of engine constants because Deno cannot
   * resolve a pnpm workspace. That is the same reason `apple-notification.ts` redeclares
   * `StoreNotification` — and, like that one, the copy needs something holding it to the
   * original. Reading the source is the only mechanism available on this side of the
   * boundary.
   */
  const types = readFileSync(
    new URL('../../../../packages/engines/src/learning/types.ts', import.meta.url),
    'utf8',
  )
  const grading = readFileSync(
    new URL('../../../../packages/engines/src/grading/index.ts', import.meta.url),
    'utf8',
  )

  const numberAfter = (source: string, name: string): number => {
    const found = source.match(new RegExp(`${name}\\s*=\\s*([\\d_]+)`))
    expect(found, `${name} not found`).not.toBeNull()
    return Number(found![1]!.replace(/_/g, ''))
  }

  it('MIN_ANSWER_MS matches MIN_CREDIBLE_ANSWER_MS', () => {
    expect(MIN_ANSWER_MS).toBe(numberAfter(types, 'MIN_CREDIBLE_ANSWER_MS'))
  })

  it('MAX_ANSWER_MS matches MAX_CREDITED_ANSWER_MS', () => {
    expect(MAX_ANSWER_MS).toBe(numberAfter(types, 'MAX_CREDITED_ANSWER_MS'))
  })

  it('NO_TIMING_SIGNAL_MS matches the grader’s DEFAULT_MEDIAN_MS', () => {
    expect(NO_TIMING_SIGNAL_MS).toBe(numberAfter(grading, 'DEFAULT_MEDIAN_MS'))
  })
})

describe('isFiniteMs', () => {
  it('rejects what typeof accepts', () => {
    expect(isFiniteMs(NOW)).toBe(true)
    expect(isFiniteMs(0)).toBe(true)
    expect(isFiniteMs(Number.NaN)).toBe(false)
    expect(isFiniteMs(Number.POSITIVE_INFINITY)).toBe(false)
    expect(isFiniteMs(1e300)).toBe(false)
    expect(isFiniteMs('1800000000000')).toBe(false)
    expect(isFiniteMs(null)).toBe(false)
  })
})
