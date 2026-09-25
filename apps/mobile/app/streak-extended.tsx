/**
 * The streak celebration, between the lesson summary and whatever comes next.
 *
 * Reached only from the lesson route's after-lesson plan (`afterLesson.ts`), once per
 * local day. The number is the optimistic streak — the server's plus the lesson it has
 * not seen yet — because a learner who finished offline did extend their streak, and
 * this is the screen that says so. If that figure is somehow zero (a hand-typed link,
 * a cleared cache), there is nothing true to celebrate, so it steps straight on.
 */

import { useEffect, useRef } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { BALANCE } from '@worldquest/engines'
import { StreakExtended } from '../src/features/streak/StreakExtended.js'
import { useOptimisticProgress } from '../src/features/home/useOptimisticProgress.js'
import { useWeekActivity } from '../src/features/profile/useWeekActivity.js'
import { nextAfterLesson } from '../src/features/lesson/afterLesson.js'
import { hapticCelebrate } from '../src/lib/haptics.js'
import { soundStreak } from '../src/lib/sound.js'

export default function StreakExtendedRoute() {
  const { then, countries } = useLocalSearchParams<{ then?: string; countries?: string }>()
  const { shown, status } = useOptimisticProgress()
  const week = useWeekActivity()
  const streak = shown?.streak ?? 0
  const next = nextAfterLesson(then, countries)
  const milestones = BALANCE.xp.streakMilestones as Readonly<Record<number, number>>

  // Decide once the figures have settled: a cold start reads the persisted cache, and
  // stepping on from a zero that was merely still loading would skip a real streak.
  const settled = status !== 'loading'
  const celebrated = useRef(false)
  useEffect(() => {
    if (!settled || celebrated.current) return
    if (streak < 1) {
      router.replace(next)
      return
    }
    // Once: the count settling or a refetch must not replay the fanfare.
    celebrated.current = true
    hapticCelebrate()
    soundStreak()
  }, [settled, streak, next])

  if (!settled || streak < 1) return null
  return (
    <StreakExtended
      streak={streak}
      week={week}
      milestoneXp={milestones[streak]}
      onContinue={() => router.replace(next)}
    />
  )
}
