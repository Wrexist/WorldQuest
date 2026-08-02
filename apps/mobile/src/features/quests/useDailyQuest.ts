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
    // Read from the user's recent lessons once history is synced. 0.8 puts a new
    // user on the middle goal rather than the hardest one.
    recentAccuracy: 0.8,
  })
}

/** Today's quest with the user's progress applied. Null until content is loaded. */
export function useDailyQuest(): { quest: DailyQuest | null; loading: boolean } {
  const { index, memory, status } = useContent()

  const generated = useMemo<DailyQuest | null>(
    () => (index === null ? null : todaysQuest(index.index, memory)),
    [index, memory],
  )

  return { quest: useQuestWithProgress(generated), loading: status === 'loading' }
}
