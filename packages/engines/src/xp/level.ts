/**
 * Everything a level badge needs, computed once, in the engine.
 *
 * The arithmetic is small enough to tempt anyone into doing it in a component — and
 * that is exactly how a progress bar ends up disagreeing with the number printed
 * beside it. `xpForLevel` is exponential, so "progress toward the next level" is not
 * `xp / xpForLevel(next)`; it is the position *within the band*, and getting that
 * wrong renders a bar that is nearly full at every level.
 *
 * Pure, like everything else here. Spec: docs/systems/xp-economy.md
 */

import { TITLES, levelForXp, xpForLevel } from './balance.js'

/** The last level the curve defines a title for. Nothing above this is reachable. */
export const MAX_LEVEL = TITLES[TITLES.length - 1]!.level

export type LevelProgress = {
  readonly level: number
  /** i18n key, e.g. `titles:navigator`. Never a display string — this package has no locale. */
  readonly titleKey: string
  /** Total XP at which the current level began. */
  readonly levelStartXp: number
  /** Total XP needed to reach the next level, or null at the cap. */
  readonly nextLevelXp: number | null
  /** XP earned inside the current band. */
  readonly earnedInLevel: number
  /** XP the band is worth in total. Zero-safe: never used as a divisor without a guard. */
  readonly levelSpan: number
  /** What is LEFT, which is the number worth showing. Null at the cap. */
  readonly remaining: number | null
  /** 0–1, for a progress bar. Exactly 1 at the cap. */
  readonly fraction: number
  readonly isMax: boolean
}

/**
 * The title earned at or below this level.
 *
 * Scans rather than indexes because the thresholds are not every ten levels forever —
 * a future curve can add one at 45 without this needing to know.
 */
export function titleKeyForLevel(level: number): string {
  let key = TITLES[0]!.key
  for (const title of TITLES) {
    if (title.level <= level) key = title.key
    else break
  }
  return key
}

export function levelProgress(totalXp: number): LevelProgress {
  // Negative XP is not reachable through any legitimate path, but a corrupt cache or
  // a bad server payload should render level 1 rather than NaN on the user's profile.
  const xp = Number.isFinite(totalXp) && totalXp > 0 ? Math.floor(totalXp) : 0

  const level = Math.min(levelForXp(xp), MAX_LEVEL)
  const isMax = level >= MAX_LEVEL

  const levelStartXp = xpForLevel(level)
  const nextLevelXp = isMax ? null : xpForLevel(level + 1)

  const levelSpan = nextLevelXp === null ? 0 : nextLevelXp - levelStartXp
  const earnedInLevel = Math.max(0, xp - levelStartXp)

  return {
    level,
    titleKey: titleKeyForLevel(level),
    levelStartXp,
    nextLevelXp,
    earnedInLevel,
    levelSpan,
    remaining: nextLevelXp === null ? null : Math.max(0, nextLevelXp - xp),
    // A band of zero width would be a divide-by-zero on the one screen a user checks
    // most. Treat it as complete, which is what it means.
    fraction: isMax || levelSpan <= 0 ? 1 : Math.min(1, earnedInLevel / levelSpan),
    isMax,
  }
}
