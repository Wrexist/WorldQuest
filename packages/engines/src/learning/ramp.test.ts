import { describe, expect, it } from 'vitest'
import { START_LEVELS, difficultyRamp, experienceFrom, type StartLevel } from './ramp.js'

/** The ramp's tuning, restated: stage thresholds in facts practised, and reviews before accuracy counts. */
const RAMP_STAGES = [0, 15, 40, 80, 140, 220] as const
const XP_STAGES = [0, 300, 900, 2_000, 4_500, 9_000] as const
const RAMP_MIN_REVIEWS = 20
import type { MemoryState } from './types.js'

const LEVELS = Object.keys(START_LEVELS) as StartLevel[]
const fresh = { practised: 0, accuracy: null } as const

/** The repo's own seeded LCG (as fsrs.test.ts), so a failure replays exactly. */
function cases(n: number, run: (rnd: () => number) => void) {
  let seed = 4242
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  for (let i = 0; i < n; i++) run(rnd)
}
const pick = <T,>(rnd: () => number, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!

function memory(reps: number, lapses: number, suspended = false, i = 0): MemoryState {
  return { factId: `f${i}`, stability: 1, difficulty: 5, reps, lapses, lastReviewAt: 0, dueAt: 0, suspended }
}

describe('difficultyRamp', () => {
  it('starts every learner exactly where onboarding put them', () => {
    for (const level of LEVELS) expect(difficultyRamp(level, fresh).band).toEqual(START_LEVELS[level])
  })

  it('asks the plainest way first for someone just starting', () => {
    expect(difficultyRamp('new', fresh).maxModifier).toBe(0)
    expect(difficultyRamp('confident', fresh).maxModifier).toBeGreaterThan(0)
  })

  it('opens the whole range to a beginner who keeps going', () => {
    const last = RAMP_STAGES.at(-1)!
    expect(difficultyRamp('new', { practised: last, accuracy: 0.75 }).band.max).toBe(5)
    expect(difficultyRamp('new', { practised: last, accuracy: 0.75 }).maxModifier).toBe(2)
  })

  it('never raises the floor, so easy reviews keep coming back', () => {
    cases(2000, rnd => {
      const level = pick(rnd, LEVELS)
      const accuracy = rnd() < 0.2 ? null : rnd()
      const result = difficultyRamp(level, { practised: Math.floor(rnd() * 1000), accuracy, reviews: Math.floor(rnd() * 2000) })
      expect(result.band.min).toBe(START_LEVELS[level].min)
    })
  })

  it('only widens with experience, never narrows', () => {
    cases(2000, rnd => {
      const level = pick(rnd, LEVELS)
      const a = Math.floor(rnd() * 500), b = Math.floor(rnd() * 500)
      const [less, more] = a <= b ? [a, b] : [b, a]
      const before = difficultyRamp(level, { practised: less, accuracy: null })
      const after = difficultyRamp(level, { practised: more, accuracy: null })
      expect(after.band.max).toBeGreaterThanOrEqual(before.band.max)
      expect(after.maxModifier).toBeGreaterThanOrEqual(before.maxModifier)
    })
  })

  it('stays a valid band for any input, including nonsense', () => {
    const odd = [NaN, Infinity, -Infinity, -5, 0, 1e9, 0.5]
    cases(2000, rnd => {
      const level = pick(rnd, LEVELS)
      const practised = rnd() < 0.3 ? pick(rnd, odd) : rnd() * 1000
      const accuracy = rnd() < 0.3 ? pick(rnd, [null, ...odd]) : rnd()
      const { band, maxModifier, stage } = difficultyRamp(level, { practised, accuracy, reviews: 500 })
      expect(band.min).toBeGreaterThanOrEqual(1)
      expect(band.max).toBeLessThanOrEqual(5)
      expect(band.max).toBeGreaterThanOrEqual(band.min)
      expect(maxModifier).toBeGreaterThanOrEqual(0)
      expect(maxModifier).toBeLessThanOrEqual(2)
      expect(stage).toBeGreaterThanOrEqual(0)
      expect(stage).toBeLessThan(RAMP_STAGES.length)
    })
  })

  it('keeps introduceFrom inside the band, for any input', () => {
    cases(2000, rnd => {
      const level = pick(rnd, LEVELS)
      const { band, introduceFrom } = difficultyRamp(level, { practised: rnd() * 400, xp: rnd() * 20_000, accuracy: rnd() < 0.3 ? null : rnd(), reviews: 500 })
      expect(introduceFrom).toBeGreaterThanOrEqual(band.min)
      expect(introduceFrom).toBeLessThanOrEqual(band.max)
    })
  })

  it('moves one stage early for a learner who gets nearly everything right', () => {
    const steady = difficultyRamp('new', { practised: 20, accuracy: 0.75, reviews: 100 })
    const sharp = difficultyRamp('new', { practised: 20, accuracy: 0.95, reviews: 100 })
    expect(sharp.stage).toBe(steady.stage + 1)
  })

  it('gives a struggling learner a stage of breathing room, never more', () => {
    const steady = difficultyRamp('new', { practised: 90, accuracy: 0.75, reviews: 300 })
    const struggling = difficultyRamp('new', { practised: 90, accuracy: 0.3, reviews: 300 })
    expect(struggling.stage).toBe(steady.stage - 1)
  })

  it('does not read accuracy from a handful of answers', () => {
    const lucky = difficultyRamp('new', { practised: 3, accuracy: 1, reviews: RAMP_MIN_REVIEWS - 1 })
    expect(lucky.stage).toBe(0)
  })
})

describe('difficultyRamp and XP', () => {
  it('a learner with no facts practised still climbs on XP alone', () => {
    for (const [stage, threshold] of XP_STAGES.entries()) {
      expect(difficultyRamp('new', { practised: 0, accuracy: null, xp: threshold }).stage).toBe(stage)
    }
  })

  it('takes whichever of facts practised and XP is further along', () => {
    // 100 facts is stage 3; 5,000 XP is stage 4. The XP wins, and neither drags the other down.
    expect(difficultyRamp('new', { practised: 100, accuracy: null, xp: 5_000 }).stage).toBe(4)
    expect(difficultyRamp('new', { practised: 150, accuracy: null, xp: 100 }).stage).toBe(4)
  })

  it('never makes a learner easier for earning more', () => {
    cases(2000, rnd => {
      const level = pick(rnd, LEVELS)
      const practised = Math.floor(rnd() * 300)
      const a = Math.floor(rnd() * 20_000), b = Math.floor(rnd() * 20_000)
      const [less, more] = a <= b ? [a, b] : [b, a]
      const before = difficultyRamp(level, { practised, accuracy: null, xp: less })
      const after = difficultyRamp(level, { practised, accuracy: null, xp: more })
      expect(after.stage).toBeGreaterThanOrEqual(before.stage)
      expect(after.band.max).toBeGreaterThanOrEqual(before.band.max)
      expect(after.maxModifier).toBeGreaterThanOrEqual(before.maxModifier)
      expect(after.introduceFrom).toBeGreaterThanOrEqual(before.introduceFrom)
    })
  })

  it('serves new facts harder and harder as XP is earned', () => {
    const at = (xp: number) => difficultyRamp('new', { practised: 0, accuracy: null, xp }).introduceFrom
    expect(at(0)).toBe(1)
    expect(at(9_000)).toBeGreaterThan(at(0))
  })

  it('ignores an XP figure that is not a number', () => {
    for (const xp of [NaN, Infinity, -Infinity, -50]) {
      expect(difficultyRamp('new', { practised: 0, accuracy: null, xp }).stage).toBe(0)
    }
  })
})

describe('experienceFrom', () => {
  it('counts practised facts and overall accuracy, ignoring leeches and unseen facts', () => {
    const exp = experienceFrom([memory(4, 1, false, 1), memory(6, 0, false, 2), memory(0, 0, false, 3), memory(9, 8, true, 4)])
    expect(exp.practised).toBe(2)
    expect(exp.reviews).toBe(10)
    expect(exp.accuracy).toBeCloseTo(0.9)
  })

  it('has no accuracy before the first review', () => {
    expect(experienceFrom([]).accuracy).toBeNull()
  })
})
