/**
 * The quest-complete celebration — mockup screen 8.
 *
 * Reached from one place: the lesson summary's exit, when that lesson landed the quest's
 * fifth task. `LessonExit.questCompleted` is what says so, and it is computed by the
 * runner because the runner is what advances the quest.
 *
 * ## The streak comes from the server, and is allowed to be absent
 *
 * `useProgress` is the authoritative wallet and streak (ADR 0006). A lesson finished
 * offline has not moved it yet, and this screen would rather say nothing about a streak
 * than say a number that is one behind — the celebration is about the quest, and the
 * streak is a line on it.
 */

import { router } from 'expo-router'
import { BALANCE, questProgress } from '@worldquest/engines'
import { QuestComplete } from '../src/features/quests/QuestComplete.js'
import { useDailyQuest } from '../src/features/quests/useDailyQuest.js'
import { useProgress } from '../src/features/home/useProgress.js'

/**
 * The milestone this streak length hits, or nothing.
 *
 * Read from the balance table rather than listed here — `streakMilestones` is `{ 7: 50,
 * 30: 200, 100: 500, 365: 1000 }` and it is the server that pays it, so a second copy of
 * the thresholds in a screen is a second copy that can disagree about what today was
 * worth. Exact match, not "at least": the bonus lands on the day you reach it.
 */
function milestoneFor(streak: number | undefined): number | undefined {
  if (streak === undefined) return undefined
  const milestones = BALANCE.xp.streakMilestones as Readonly<Record<number, number>>
  return milestones[streak]
}

export default function QuestCompleteRoute() {
  const { quest } = useDailyQuest()
  const { data } = useProgress()
  const standing = quest === null ? null : questProgress(quest)
  const streak = data?.streak

  return (
    <QuestComplete
      // Passed straight through, honestly. An earlier version coalesced `done` up to
      // `total` on the reasoning that this route is only reachable once a quest is
      // finished — which is true of the app and not of a router, and it would have
      // meant the screen claiming five tasks done on a device whose stored progress
      // said otherwise. The screen hides the score when it disagrees with the headline
      // instead, which is the version that cannot lie in either direction.
      done={standing?.done ?? 0}
      total={standing?.total ?? 0}
      {...(streak !== undefined ? { streak } : {})}
      {...(milestoneFor(streak) !== undefined ? { milestoneXp: milestoneFor(streak) } : {})}
      // `replace`, not `back()`: the lesson has already been replaced off the stack, and
      // going "back" from a celebration would return the user to the summary they just
      // dismissed.
      onDone={() => router.replace('/')}
    />
  )
}
