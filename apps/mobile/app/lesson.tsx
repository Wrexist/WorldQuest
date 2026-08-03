/**
 * The lesson runner, as a full-screen route outside the tabs.
 *
 * `/lesson` is deep-linkable on purpose — the daily reminder notification opens it
 * directly, and a push that lands the user on Home instead of in a lesson is a push
 * that costs a tap for no reason.
 */

import { router, useLocalSearchParams } from 'expo-router'
import { LessonScreen } from '../src/features/lesson/LessonScreen.js'
import { useProgress } from '../src/features/home/useProgress.js'

export default function LessonRoute() {
  // `/lesson?mode=speed`. A query param rather than a second route: it is the same
  // runner, the same items and the same scoring — only the clock differs.
  const { mode, taster } = useLocalSearchParams<{ mode?: string; taster?: string }>()
  // Fetched here rather than in the screen: server state belongs to the route, and
  // the runner should stay mountable without a QueryClientProvider.
  const { data } = useProgress()

  return (
    <LessonScreen
      mode={mode === 'speed' ? 'speed' : 'normal'}
      // Set only by the onboarding hand-off. Finishing this one lesson is the single
      // biggest predictor of a user coming back, so it gets its own event rather than
      // being inferred later from "first lesson_completed", which is wrong for anyone
      // who reinstalls.
      isTaster={taster === '1'}
      coins={data?.coins ?? 0}
      onExit={() => {
        // Opened from a notification there is no history to pop, and `back()` would
        // do nothing at all — leaving the user stuck on the summary.
        if (router.canGoBack()) router.back()
        else router.replace('/')
      }}
    />
  )
}
