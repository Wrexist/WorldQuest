/**
 * Quests — today's five.
 *
 * The quest is generated on the device from the content index and the user's memory,
 * seeded by (user, local date), so it is identical on every device and after a
 * reinstall without a round trip. The server re-derives the same quest when it grades
 * a lesson — the XP for a slot is awarded there, never here (ADR 0006).
 */

import { useMemo } from 'react'
import { router } from 'expo-router'
import { generateDailyQuest, localDate, seededRng, type DailyQuest } from '@worldquest/engines'
import { QuestScreen } from '../../src/features/quests/QuestScreen.js'
import { useContent } from '../../src/lib/content.js'

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

export default function QuestsRoute() {
  const { index, memory, status } = useContent()

  const quest = useMemo<DailyQuest | null>(() => {
    if (index === null) return null

    const now = Date.now()
    // The user's own midnight, not UTC. A quest that rolls over at 2 a.m. local is a
    // quest that resets in the middle of someone's evening.
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const date = localDate(now, timeZone)

    // Anonymous until accounts land; the seed only has to be stable per install.
    const userId = 'local'

    return generateDailyQuest({
      userId,
      date,
      index: index.index,
      memory,
      now,
      rng: seededRng(seedFor(userId, date)),
      // Read from the user's recent lessons once history is synced. 0.8 puts a new
      // user on the middle goal rather than the hardest one.
      recentAccuracy: 0.8,
    })
  }, [index, memory])

  return (
    <QuestScreen
      quest={quest}
      loading={status === 'loading'}
      onStart={() => router.push('/lesson')}
    />
  )
}
