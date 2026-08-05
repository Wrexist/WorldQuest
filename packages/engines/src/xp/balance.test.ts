import { describe, expect, it } from 'vitest'
import { BALANCE, TITLES, heartsNow, levelForXp, xpForLevel } from './balance.js'

const NOW = 1_800_000_000_000
const MIN = 60_000

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
  it('regenerates one per interval and never exceeds the maximum', () => {
    expect(heartsNow(0, NOW - 45 * MIN, NOW, false)).toBe(1)
    expect(heartsNow(0, NOW - 90 * MIN, NOW, false)).toBe(2)
    expect(heartsNow(0, NOW - 999 * MIN, NOW, false)).toBe(BALANCE.hearts.max)
    expect(heartsNow(BALANCE.hearts.max, NOW - 999 * MIN, NOW, false)).toBe(BALANCE.hearts.max)
  })

  it('regenerates faster for child accounts', () => {
    const adult = heartsNow(0, NOW - 90 * MIN, NOW, false)
    const child = heartsNow(0, NOW - 90 * MIN, NOW, true)
    expect(child).toBeGreaterThan(adult)
  })

  it('does not regenerate before a full interval has passed', () => {
    expect(heartsNow(0, NOW - 44 * MIN, NOW, false)).toBe(0)
  })

  it('never goes backwards if the clock moves oddly', () => {
    // Server timestamps are authoritative, but the function must not produce a
    // negative or decreasing value if it ever sees a future lastUpdatedAt.
    expect(heartsNow(2, NOW + 60 * MIN, NOW, false)).toBe(2)
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
