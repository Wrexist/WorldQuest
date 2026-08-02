/**
 * Quests — today's five.
 *
 * The quest is generated on the device from the content index and the user's memory,
 * seeded by (user, local date), so it is identical on every device and after a
 * reinstall without a round trip. The server re-derives the same quest when it grades
 * a lesson — the XP for a slot is awarded there, never here (ADR 0006).
 *
 * Generation and progress both live in `features/quests` because the lesson runner
 * needs them too: it is what advances the tasks when a lesson ends.
 */

import { router } from 'expo-router'
import { QuestScreen } from '../../src/features/quests/QuestScreen.js'
import { useDailyQuest } from '../../src/features/quests/useDailyQuest.js'

export default function QuestsRoute() {
  const { quest, loading } = useDailyQuest()

  return (
    <QuestScreen
      quest={quest}
      loading={loading}
      onStartSpeedRound={() => router.push('/lesson?mode=speed')}
      onStart={() => router.push('/lesson')}
    />
  )
}
