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
import { ContentGate } from '../../src/components/ContentGate.js'
import { QuestScreen } from '../../src/features/quests/QuestScreen.js'
import { useDailyQuest } from '../../src/features/quests/useDailyQuest.js'
import { questFocus } from '@worldquest/engines'
import { focusToParams } from '../../src/features/lesson/focusParams.js'
import { useDayCountdown } from '../../src/features/quests/useDayCountdown.js'
import { useProgress } from '../../src/features/home/useProgress.js'

export default function QuestsRoute() {
  const { quest, loading, status, reload } = useDailyQuest()
  const untilReset = useDayCountdown()
  // The wallet, for the bar at the top. The server's figure rather than the optimistic
  // one: this bar sits above a screen that leads to the Shop, and a balance that
  // includes a lesson the server has not graded is a balance you cannot spend.
  const { data } = useProgress()

  // Routes are the layer that fetches, so the error state belongs here rather than in
  // the screen (apps/mobile/CLAUDE.md). Without it a failed content load rendered the
  // screen's EMPTY state — "no quest yet" — which is a confident wrong answer.
  return (
    <ContentGate status={status} onRetry={reload}>
      <QuestScreen
        quest={quest}
        loading={loading}
        onStartSpeedRound={() => router.push('/lesson?mode=speed')}
        coins={data?.coins ?? 0}
        resetsIn={untilReset}
        onOpenAchievements={() => router.push('/achievements')}
        onOpenInbox={() => router.push('/streak')}
        // The quest's own facts. This button said "Continue" above five named tasks and
        // started a generic lesson, so the five rows were a report on a lesson chosen by
        // something else. Now the rows ARE the lesson.
        onStart={() => {
          const focus = quest === null ? undefined : questFocus(quest)
          const query = focus === undefined ? '' : `?${focusToParams(focus, undefined)}`
          router.push(`/lesson${query}`)
        }}
      />
    </ContentGate>
  )
}
