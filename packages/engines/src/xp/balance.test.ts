import { describe, expect, it } from 'vitest'
import { BALANCE, TITLES, levelForXp, xpForLevel } from './balance.js'


describe('level curve', () => {
  it('starts at zero and rises monotonically', () => {
    expect(xpForLevel(1)).toBe(0)
    for (let l = 1; l < 120; l++) {
      expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l))
    }
  })

  it('is the exact inverse of levelForXp', () => {
    for (const level of [1, 2, 7, 20, 38, 61, 99]) {
      expect(levelForXp(xpForLevel(level))).toBe(level)
    }
  })

  it('paces so the early game is fast and the long tail is long', () => {
    // ~300 XP/day for a regular user. A shallower curve reaches level 100 inside
    // a year and leaves Alex nothing to chase; a steeper one makes the first ten
    // levels feel like work and loses Emma.
    const perDay = 300
    expect(xpForLevel(10) / perDay).toBeLessThan(21) // level 10 within 3 weeks
    expect(xpForLevel(38) / perDay).toBeGreaterThan(90) // level 38 is months, not weeks
    expect(xpForLevel(100) / perDay).toBeGreaterThan(700) // level 100 is years
  })

  it('reports the highest level fully paid for, never a partial one', () => {
    expect(levelForXp(xpForLevel(10) - 1)).toBe(9)
    expect(levelForXp(xpForLevel(10))).toBe(10)
  })

  it('handles zero and negative totals', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(-5)).toBe(1)
  })
})

describe('titles', () => {
  it('grants one every ten levels, in ascending order', () => {
    for (let i = 1; i < TITLES.length; i++) {
      expect(TITLES[i]!.level).toBeGreaterThan(TITLES[i - 1]!.level)
    }
    expect(TITLES[0]!.level).toBe(1)
  })

  it('uses i18n keys, never literal copy', () => {
    for (const title of TITLES) expect(title.key).toMatch(/^titles:[a-z]+$/)
  })
})

describe('hearts', () => {
  it('has exactly one design, not two', () => {
    // `regenMinutes` and `childRegenMinutes` lived beside `resetPerLesson: true`, which
    // are two answers to the same question. If hearts reset at the start of every lesson
    // there is no pool to regenerate, and a regeneration rate is a second mechanic the
    // next reader will find and believe. This asserts the contradiction cannot come back.
    const hearts = BALANCE.hearts as Record<string, unknown>
    expect(hearts.resetPerLesson).toBe(true)
    expect(hearts.regenMinutes).toBeUndefined()
    expect(hearts.childRegenMinutes).toBeUndefined()
  })

  it('prices continuing a lesson, not refilling a pool that does not exist', () => {
    const prices = BALANCE.prices as Record<string, unknown>
    expect(prices.continueLesson).toBeGreaterThan(0)
    expect(prices.heartRefill).toBeUndefined()
  })
})

describe('balance invariants', () => {
  it('keeps XP strictly positive — XP never decreases', () => {
    // Spending a progression score would corrupt levels and leagues. ADR 0011.
    const values = Object.values(BALANCE.xp).flatMap((v) =>
      typeof v === 'number' ? [v] : typeof v === 'object' ? Object.values(v) : [],
    )
    for (const v of values) expect(v).toBeGreaterThan(0)
  })

  it('keeps coin income to roughly a third of XP, so prices stay legible', () => {
    expect(BALANCE.coins.correctAnswer / BALANCE.xp.correctAnswer).toBeLessThanOrEqual(0.6)
  })

  it('prices a meaningful cosmetic at several days of saving', () => {
    // Faster and rewards feel weightless; slower and the shop feels pointless.
    const perDay = 300 // coins for a regular 10-minute user
    const cheapest = BALANCE.prices.avatarItem.min
    expect(cheapest / perDay).toBeGreaterThan(0.5)
    expect(cheapest / perDay).toBeLessThan(10)
  })

  it('rewards mastery more than a single correct answer', () => {
    // The only XP source that cannot be farmed by volume.
    expect(BALANCE.xp.factMastered).toBeGreaterThan(BALANCE.xp.correctAnswer)
  })

  it('caps the speed bonus so speed is not a strategy', () => {
    const maxSpeedXp = BALANCE.xp.speedBonus * BALANCE.xp.speedBonusMaxPerLesson
    expect(maxSpeedXp).toBeLessThan(BALANCE.xp.dailyQuest)
  })

  it('makes repeating a mastered fact nearly worthless the same day', () => {
    expect(BALANCE.xp.repeatKnownNotDue).toBeLessThan(BALANCE.xp.correctAnswer / 3)
  })

  it('sets a daily soft cap that a healthy session cannot reach', () => {
    // 15 items × 10 XP × 5 lessons ≈ 750, comfortably under the cap.
    expect(BALANCE.xp.dailySoftCap).toBeGreaterThan(750)
    expect(BALANCE.xp.softCapMultiplier).toBeLessThan(1)
  })

  it('gates referral rewards behind real activation', () => {
    expect(BALANCE.integrity.referralLessonsRequired).toBeGreaterThan(1)
    expect(BALANCE.integrity.referralDaysRequired).toBeGreaterThan(1)
  })

  it('keeps hearts off in relaxed mode and unlimited for premium', () => {
    // Hearts must never block learning — this is the line we do not cross.
    expect(BALANCE.hearts.disabledInRelaxedMode).toBe(true)
    expect(BALANCE.hearts.premiumUnlimited).toBe(true)
  })
})
