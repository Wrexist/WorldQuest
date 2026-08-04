/**
 * Home — the daily entry point, and the app's default route.
 *
 * Routes stay thin: fetch, compose, delegate. All of Home's layout lives in
 * `features/home/HomeScreen`, which is what the screenshot tooling renders and what
 * component tests mount. This file connects it to navigation and to data.
 */

import { useMemo } from 'react'
import { useRouter } from 'expo-router'
import { HomeScreen, type HomeProgress } from '../../src/features/home/HomeScreen.js'
import { useContent } from '../../src/lib/content.js'
import { useProgress } from '../../src/features/home/useProgress.js'
import { lessonsToday } from '../../src/features/profile/useWeekActivity.js'
import { useItemPace } from '../../src/features/lesson/usePace.js'
import { usePreferences } from '../../src/features/settings/usePreferences.js'
import { lessonsPerDay, worldProgress } from '@worldquest/engines'

/**
 * Zeroed rather than invented. A first launch shows the real empty state — and a
 * failed fetch shows it too, rather than numbers that would be a lie.
 */
const COLD_START: HomeProgress = {
  xpTotal: 0,
  coins: 0,
  streak: 0,
}

export default function HomeRoute() {
  const router = useRouter()
  const { data, status, isStale } = useProgress()

  // The SAME call Explore makes, rather than a second count assembled here. Two
  // places counting the same thing agree until one of them changes — and these two
  // already disagreed: Home carried a hardcoded `factsTotal: 10` beside a comment
  // saying "the packs are five countries deep today". They are 65 countries and 259
  // facts, and nothing rendered the number, so nobody saw it was wrong.
  const { index, memory } = useContent()
  const world = useMemo(
    () => (index === null ? undefined : worldProgress(index.index, memory, Date.now())),
    [index, memory],
  )

  // The daily goal, finally connected to something. It was asked for in onboarding,
  // stored, shown in Settings, and read by nothing — `lessonsPerDay()` sat unused in
  // the engine, so choosing 5 minutes or 20 minutes changed precisely nothing.
  const { preferences } = usePreferences()
  const itemMs = useItemPace()
  const goal = {
    done: lessonsToday(),
    target: lessonsPerDay(preferences.dailyGoalMinutes, itemMs),
  }

  const progress: HomeProgress = data
    ? {
        xpTotal: data.xpTotal,
        coins: data.coins,
        streak: data.streak,
      }
    : COLD_START

  return (
    <HomeScreen
      progress={progress}
      loading={status === 'loading'}
      // Stale numbers are exactly what "offline" means to a user: what you see is
      // real, it is just from last time. The banner says so instead of hiding it.
      isOffline={isStale || status === 'error'}
      onOpenStreak={() => router.push('/streak')}
      onStartLesson={() => router.push('/lesson')}
      goal={goal}
      world={world}
      onOpenWorld={() => router.push('/explore')}
    />
  )
}
