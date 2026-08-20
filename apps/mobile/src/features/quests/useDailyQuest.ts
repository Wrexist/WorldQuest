/**
 * Today's quest, composed on the device.
 *
 * Extracted from the Quests route because the lesson runner needs the same five tasks
 * to advance them when a lesson ends. Two copies of the seed logic would be two
 * quests: the screen would show one set and the lesson would tick another, and the
 * bug would look like "progress sometimes does not save".
 *
 * `generateDailyQuest` is deterministic per (user, day), so this is cheap to call
 * again rather than something to hold in a store.
 */

import { useMemo } from 'react'
import {
  generateDailyQuest,
  localDate,
  seededRng,
  type ContentIndex,
  type DailyQuest,
  type MemoryState,
} from '@worldquest/engines'
import { useContent } from '../../lib/content.js'
import { recentAccuracy, useRecentAccuracy } from '../lesson/useAccuracy.js'
import { useQuestWithProgress } from './questProgress.js'

/**
 * A stable seed for (user, day).
 *
 * A simple string hash, not a cryptographic one — this decides which four of a user's
 * due facts appear today, and the only property it needs is that the same day gives
 * the same answer. Anything stronger is cost with no benefit.
 */
function seedFor(userId: string, date: string): number {
  let hash = 2166136261
  for (const char of `${userId}:${date}`) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Anonymous until accounts land; the seed only has to be stable per install. */
const USER_ID = 'local'

export function todaysQuest(
  index: ContentIndex,
  memory: ReadonlyMap<string, MemoryState>,
  now: number = Date.now(),
  /**
   * How the user has been doing, for the fifth slot alone.
   *
   * A parameter with a default rather than a call inside, so the two callers — this
   * hook and the lesson runner — can be handed the SAME figure and cannot compose two
   * different quests. `recentAccuracy` is already constant for a local day by
   * construction (it excludes today's lessons), which is what makes the default safe.
   */
  accuracy: number = recentAccuracy(new Date(now)),
): DailyQuest {
  // The user's own midnight, not UTC. A quest that rolls over at 2 a.m. local is a
  // quest that resets in the middle of someone's evening.
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const date = localDate(now, timeZone)

  return generateDailyQuest({
    userId: USER_ID,
    date,
    index,
    memory,
    now,
    rng: seededRng(seedFor(USER_ID, date)),
    /**
     * Real, at last. This was the literal `0.8` under a note saying to read it from
     * lessons "once history is synced" — so `performTask` sent every user on earth the
     * same goal, `speed_round`, every day: finish a lesson in under ninety seconds.
     *
     * For a confident learner that is easier than the goal they earned. For a slow
     * reader, a child, or anyone using a screen reader it is the daily failure the
     * scaling exists to prevent, and `streak_keeper` — finish one lesson, any accuracy —
     * was unreachable by anybody.
     */
    recentAccuracy: accuracy,
  })
}

/**
 * Today's quest with the user's progress applied. Null until content is loaded.
 *
 * `status` is passed through rather than collapsed into `loading`. It used to be, and
 * the consequence was that a content load which FAILED produced `quest: null` with
 * `loading: false` — which the screen renders as "no quest yet, start a lesson". That
 * is a wrong answer rather than a missing one: it tells a user nothing is wrong and
 * offers them an action that cannot fix it. Surfaced by tightening `pnpm five-states`
 * to stop counting the word "error" inside a comment as error handling.
 */
export function useDailyQuest(): {
  quest: DailyQuest | null
  loading: boolean
  status: 'loading' | 'ready' | 'error'
  reload: () => void
} {
  const { index, memory, status, reload } = useContent()
  // Subscribed rather than read once: finishing a lesson changes this, and a quest screen
  // holding the figure from the render before it would draw a goal the runner is no
  // longer scoring against.
  const accuracy = useRecentAccuracy()

  const generated = useMemo<DailyQuest | null>(
    () => (index === null ? null : todaysQuest(index.index, memory, Date.now(), accuracy)),
    [index, memory, accuracy],
  )

  return {
    quest: useQuestWithProgress(generated),
    loading: status === 'loading',
    status,
    reload,
  }
}
