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
 *
 * ## The one place the app asks for a review
 *
 * This is the only moment in the product where the user has just finished the thing the
 * whole app is built around and is looking at a screen that says so. `askForReview`
 * decides whether to actually ask — see `lib/review.ts` for the four rules — and it is
 * called from here rather than from the component so the celebration stays a pure
 * screen that a test and the screenshot renderer can mount without a store SDK.
 */

import { useEffect } from 'react'
import { router } from 'expo-router'
import { BALANCE, questProgress } from '@worldquest/engines'
import { QuestComplete } from '../src/features/quests/QuestComplete.js'
import { useDailyQuest } from '../src/features/quests/useDailyQuest.js'
import { useProgress } from '../src/features/home/useProgress.js'
import { askForReview } from '../src/lib/review.js'

/**
 * How long the celebration gets to itself before we consider interrupting it.
 *
 * The burst animates in and settles; putting a system modal over that is asking someone
 * to rate an app while covering up the reason they might. Long enough to read the
 * headline and see the numbers, short enough that they are still on this screen.
 *
 * Cancelled on unmount, so a user who taps through in under two seconds gets the prompt
 * over Home — which is to say, does not get it. That is the right trade: someone
 * dismissing the celebration that fast is not in the mood to be asked.
 */
const ASK_AFTER_MS = 2000

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
  const milestoneXp = milestoneFor(streak)

  // Only from a quest that genuinely finished. This route is reachable by a router, and
  // the screen already refuses to draw a score it does not believe (see `done` below);
  // asking for five stars on the back of a celebration the app is not sure happened
  // would be the same bug with a worse consequence.
  const earned = standing !== null && standing.total > 0 && standing.done >= standing.total

  useEffect(() => {
    if (!earned) return
    const timer = setTimeout(() => {
      void askForReview(milestoneXp !== undefined ? 'streak_milestone' : 'quest_complete')
    }, ASK_AFTER_MS)
    return () => clearTimeout(timer)
  }, [earned, milestoneXp])

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
      {...(milestoneXp !== undefined ? { milestoneXp } : {})}
      // `replace`, not `back()`: the lesson has already been replaced off the stack, and
      // going "back" from a celebration would return the user to the summary they just
      // dismissed.
      onDone={() => router.replace('/')}
    />
  )
}
