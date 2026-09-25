/**
 * Unlocks that have happened and have not yet been shown to anybody.
 *
 * ## The gap this closes
 *
 * An achievement unlocked, `track('achievement_unlocked')` fired, and the user was told
 * nothing. No celebration, no card, no badge on a tab — the only way to find out was to
 * open Profile, then Achievements, and notice a medal that had gained its frame.
 * `docs/systems/achievements.md §7` specifies a full-screen celebration at the unlock
 * moment; what existed was an analytics event.
 *
 * That is the whole reward loop for thirty achievements arriving silently, which is the
 * same failure as a currency with no sink one level up: the system works and means
 * nothing.
 *
 * ## Why a queue rather than a callback
 *
 * Unlocks do not all happen at a moment anybody is looking at. Three come from the lesson
 * the user just finished; the rest are decided by the SERVER and arrive through
 * `recordServerOutcome` when the sync queue drains — which for a lesson finished in a
 * tunnel is on the walk home, with the app in the background. A callback fired there
 * reaches no screen at all.
 *
 * So an unlock is recorded rather than announced, and the end of the next lesson shows
 * whatever is waiting — one full-screen card per tier, straight after the summary
 * (`features/lesson/afterLesson.ts`). Nothing is lost, and the celebration lands where a
 * celebration belongs: right after the user has done the work.
 *
 * ## Why it is persisted
 *
 * The queue has to survive the app being killed for the same reason the sync queue does.
 * An unlock earned offline and delivered by a background flush is exactly the case that
 * would otherwise be dropped, and it is the one the user is least likely to forgive —
 * they did the work and the app never mentioned it.
 *
 * Bounded, because it is a display buffer and not a ledger: the achievements screen is
 * the permanent record, and a summary that lists twenty medals is not a celebration.
 */

import type { Tier } from '@worldquest/engines'
import { isRecord, readJson, writeJson } from '../../lib/storage.js'
import { CATALOGUE } from './useAchievements.js'

const KEY = 'achievements.pending.v1'

export type PendingUnlock = {
  readonly achievementId: string
  readonly tier: Tier
}

/**
 * How many are held at once.
 *
 * Six: three cards and an "and 3 more" line is already a long run of celebrations. Past
 * that the oldest are dropped rather than the newest: a user who has just finished a
 * lesson cares most about what just happened, and the achievements screen still holds
 * every one of them.
 */
const MAX_PENDING = 6

const isPending = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.every(
    (u) =>
      isRecord(u) &&
      typeof (u as PendingUnlock).achievementId === 'string' &&
      typeof (u as PendingUnlock).tier === 'string',
  )

const read = (): readonly PendingUnlock[] => readJson<PendingUnlock[]>(KEY, isPending) ?? []

/**
 * Record unlocks for the next screen that can celebrate them.
 *
 * Deduplicated on (achievement, tier): a lesson replayed from the queue re-runs the same
 * server outcome, and `evaluateAll` is incremental rather than idempotent about what it
 * REPORTS — so the same tier can be announced twice. Celebrating it twice would read as
 * the app being confused rather than as generosity.
 *
 * Ids the shipped catalogue no longer carries are dropped here rather than at render
 * time, because a pending row with no name is a blank medal on a celebration screen.
 */
export function queueUnlocks(unlocks: readonly PendingUnlock[]): void {
  if (unlocks.length === 0) return
  const known = new Set(CATALOGUE.map((def) => def.id))
  const seen = new Set<string>()
  const next: PendingUnlock[] = []

  for (const unlock of [...read(), ...unlocks]) {
    if (!known.has(unlock.achievementId)) continue
    const key = `${unlock.achievementId}:${unlock.tier}`
    if (seen.has(key)) continue
    seen.add(key)
    next.push(unlock)
  }

  writeJson(KEY, next.slice(-MAX_PENDING))
}

/**
 * What is waiting, without consuming it.
 *
 * The lesson route reads this when the summary's Continue is pressed and puts the list
 * in the after-lesson chain's URL. Reading is not taking: a learner who closes the app
 * on the summary still has every badge waiting for the next lesson.
 */
export const peekUnlocks = (): readonly PendingUnlock[] => read()

const keyOf = (unlock: PendingUnlock): string => `${unlock.achievementId}:${unlock.tier}`

/**
 * Take THESE unlocks off the queue — the ones a card is about to show.
 *
 * Called when the celebration mounts, so clearing is on read rather than on dismiss: a
 * card swiped past is still a card that was seen, and the alternative is a queue that
 * only drains when somebody presses the right button.
 *
 * Only these, rather than everything. The list the card shows was read a few screens
 * earlier; a server unlock that landed in between (a background flush during the streak
 * beat) is not in it, and draining the whole queue would drop that one unseen.
 */
export function acknowledgeUnlocks(shown: readonly PendingUnlock[]): void {
  if (shown.length === 0) return
  const done = new Set(shown.map(keyOf))
  const pending = read()
  const rest = pending.filter((unlock) => !done.has(keyOf(unlock)))
  if (rest.length !== pending.length) writeJson(KEY, rest)
}
