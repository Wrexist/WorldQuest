/**
 * Home — the daily entry point, and the app's default route.
 *
 * Routes stay thin: fetch, compose, delegate. All of Home's layout lives in
 * `features/home/HomeScreen`, which is what the screenshot tooling renders and what
 * component tests will mount. This file exists to connect it to navigation.
 */

import { useRouter } from 'expo-router'
import { HomeScreen, type HomeProgress } from '../../src/features/home/HomeScreen.js'

/**
 * Zeroed rather than invented. A first launch should show the real empty state — the
 * numbers arrive from Supabase in Track A3 (docs/plan/asset-independent-work.md), and
 * placeholder progress is the kind of thing that survives to a demo.
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

  return (
    <HomeScreen
      progress={COLD_START}
      loading={false}
      isOffline={false}
      onStartLesson={() => router.push('/lesson')}
    />
  )
}
