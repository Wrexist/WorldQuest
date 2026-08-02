/**
 * Home — the daily entry point, and the app's default route.
 *
 * Routes stay thin: fetch, compose, delegate. All of Home's layout lives in
 * `features/home/HomeScreen`, which is what the screenshot tooling renders and what
 * component tests mount. This file connects it to navigation and to data.
 */

import { useRouter } from 'expo-router'
import { HomeScreen, type HomeProgress } from '../../src/features/home/HomeScreen.js'
import { useProgress } from '../../src/features/home/useProgress.js'
import { lessonsToday } from '../../src/features/profile/useWeekActivity.js'
import { useItemPace } from '../../src/features/lesson/usePace.js'
import { usePreferences } from '../../src/features/settings/usePreferences.js'
import { lessonsPerDay } from '@worldquest/engines'

/**
 * Zeroed rather than invented. A first launch shows the real empty state — and a
 * failed fetch shows it too, rather than numbers that would be a lie.
 */
const COLD_START: HomeProgress = {
  xpTotal: 0,
  coins: 0,
  streak: 0,
  factsMastered: 0,
  factsTotal: 10,
}

export default function HomeRoute() {
  const router = useRouter()
  const { data, status, isStale } = useProgress()

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
        factsMastered: data.factsMastered,
        // The denominator is how many facts the shipped packs contain, which is a
        // content question rather than a server one. Wired to the content index when
        // Explore lands; the packs are five countries deep today.
        factsTotal: 10,
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
    />
  )
}
