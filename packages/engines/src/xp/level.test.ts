import { describe, expect, it } from 'vitest'
import { TITLES, levelForXp, xpForLevel } from './balance.js'
import { MAX_LEVEL, levelProgress, titleKeyForLevel } from './level.js'

describe('levelProgress', () => {
  it('starts everyone at level 1 with the first title', () => {
    const p = levelProgress(0)
    expect(p.level).toBe(1)
    expect(p.titleKey).toBe(TITLES[0]!.key)
    expect(p.fraction).toBe(0)
  })

  it('measures progress inside the band, not against the total', () => {
    // The curve is exponential, so `xp / nextLevelXp` is nearly 1 at every level and
    // renders a bar that is always almost full. The band is the only honest denominator.
    const level = 20
    const start = xpForLevel(level)
    const next = xpForLevel(level + 1)
    const halfway = start + Math.floor((next - start) / 2)

    const p = levelProgress(halfway)
    expect(p.level).toBe(level)
    expect(p.fraction).toBeGreaterThan(0.45)
    expect(p.fraction).toBeLessThan(0.55)
  })

  it('reports what is left rather than what is done', () => {
    const start = xpForLevel(10)
    const p = levelProgress(start + 5)
    expect(p.remaining).toBe(xpForLevel(11) - (start + 5))
  })

  it('lands exactly on a boundary without overshooting', () => {
    const p = levelProgress(xpForLevel(30))
    expect(p.level).toBe(30)
    expect(p.earnedInLevel).toBe(0)
    expect(p.fraction).toBe(0)
  })

  it('caps at the last level the curve defines a title for', () => {
    const p = levelProgress(xpForLevel(MAX_LEVEL) * 10)
    expect(p.level).toBe(MAX_LEVEL)
    expect(p.isMax).toBe(true)
    expect(p.nextLevelXp).toBeNull()
    expect(p.remaining).toBeNull()
    // A full bar rather than a divide-by-zero on the screen users check most.
    expect(p.fraction).toBe(1)
  })

  it('renders level 1 rather than NaN for impossible input', () => {
    // Not reachable legitimately, but a corrupt cache or a bad payload should not put
    // "Level NaN" on someone's profile.
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY * 0]) {
      const p = levelProgress(bad)
      expect(p.level).toBe(1)
      expect(Number.isFinite(p.fraction)).toBe(true)
    }
  })

  it('agrees with levelForXp everywhere below the cap', () => {
    for (let level = 1; level < MAX_LEVEL; level++) {
      const xp = xpForLevel(level)
      expect(levelProgress(xp).level).toBe(levelForXp(xp))
    }
  })

  it('never reports a fraction outside 0–1', () => {
    for (let xp = 0; xp < 500_000; xp += 971) {
      const { fraction } = levelProgress(xp)
      expect(fraction).toBeGreaterThanOrEqual(0)
      expect(fraction).toBeLessThanOrEqual(1)
    }
  })
})

describe('titleKeyForLevel', () => {
  it('holds the earned title until the next threshold', () => {
    expect(titleKeyForLevel(1)).toBe('titles:wanderer')
    expect(titleKeyForLevel(9)).toBe('titles:wanderer')
    expect(titleKeyForLevel(10)).toBe('titles:scout')
    expect(titleKeyForLevel(19)).toBe('titles:scout')
    expect(titleKeyForLevel(20)).toBe('titles:navigator')
  })

  it('gives every title an i18n key rather than a display string', () => {
    // This package has no locale and must never acquire one.
    for (const title of TITLES) expect(title.key).toMatch(/^titles:[a-z]+$/)
  })
})
