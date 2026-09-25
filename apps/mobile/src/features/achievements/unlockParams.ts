/**
 * Unlocked tiers, as they travel through the after-lesson chain's URL.
 *
 * `ach.flags.collector:bronze,ach.lessons.done:silver` — an id and a tier per entry, in
 * the order they were queued. The chain carries everything in its URL rather than in a
 * store (`features/lesson/afterLesson.ts` says why), so the celebration card learns what
 * to celebrate from a string anybody can type.
 *
 * ## Never trust an id you cannot find
 *
 * So every entry is re-read against the catalogue that ships in the binary: the id must
 * be an achievement the pack defines, and the tier must be one THAT achievement has.
 * `ach.session.speedrun` has no bronze, and "Bronze Speedrun" would be a medal for a
 * tier that does not exist. Anything else is dropped rather than drawn — a card with
 * no name, or a raw key where the name belongs, is the failure this guards.
 *
 * What it cannot prove is that THIS person earned it; the queue that fills the URL is
 * the evidence for that. A hand-typed link can therefore show a real badge to someone
 * who has not earned it. It grants nothing — no XP, no coins, no row on the shelf —
 * which is why the card carries no reward line (see `AchievementUnlocked`).
 */

import type { Tier } from '@worldquest/engines'
import { CATALOGUE } from './useAchievements.js'
import type { PendingUnlock } from './pending.js'

/**
 * The most a URL may carry. The pending queue holds six, so nothing legitimate is ever
 * longer; the cap turns a pasted wall of ids into six cards at most rather than sixty.
 */
export const MAX_CARRIED_UNLOCKS = 6

export function formatUnlocks(unlocks: readonly PendingUnlock[]): string {
  return unlocks.map((unlock) => `${unlock.achievementId}:${unlock.tier}`).join(',')
}

/** Known ids with a tier they define, once each, in order, at most six. */
export function parseUnlocks(raw: string | undefined): readonly PendingUnlock[] {
  if (!raw) return []
  const seen = new Set<string>()
  const unlocks: PendingUnlock[] = []

  for (const entry of raw.split(',')) {
    const [id, tier, ...extra] = entry.split(':')
    if (id === undefined || tier === undefined || extra.length > 0) continue
    const def = CATALOGUE.find((candidate) => candidate.id === id)
    if (def === undefined || !def.tiers.some((spec) => spec.tier === tier)) continue
    if (seen.has(entry)) continue
    seen.add(entry)
    unlocks.push({ achievementId: id, tier: tier as Tier })
    if (unlocks.length === MAX_CARRIED_UNLOCKS) break
  }

  return unlocks
}

/**
 * How many full-screen cards one run of unlocks gets before the rest are counted.
 *
 * Three. A card each is the point — one badge, one moment — but a fourth and fifth card
 * stop being celebrations and become a queue to tap through, which is the moment the
 * learner starts skipping without reading. The rest are named on the last card as
 * "and N more", and the achievements screen holds every one of them.
 */
export const MAX_UNLOCK_CARDS = 3

export function unlockCards(unlocks: readonly PendingUnlock[]): {
  readonly cards: readonly PendingUnlock[]
  readonly more: number
} {
  return {
    cards: unlocks.slice(0, MAX_UNLOCK_CARDS),
    more: Math.max(0, unlocks.length - MAX_UNLOCK_CARDS),
  }
}

/** The target that tier asked for — the `{threshold}` in the achievement's description. */
export function thresholdOf(unlock: PendingUnlock): number | undefined {
  return CATALOGUE.find((def) => def.id === unlock.achievementId)?.tiers.find(
    (spec) => spec.tier === unlock.tier,
  )?.threshold
}
