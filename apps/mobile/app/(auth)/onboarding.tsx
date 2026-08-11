/**
 * The onboarding route — storage and navigation only.
 *
 * Everything the user sees lives in the feature component, which takes the current
 * year as a prop and hands back what was chosen. That split is why the flow can be
 * mounted by a component test and by the screenshot renderer, neither of which has
 * device storage or a router.
 */

import { router } from 'expo-router'
import { OnboardingScreen, type OnboardingResult } from '../../src/features/onboarding/OnboardingScreen.js'
import { useOnboarding } from '../../src/features/onboarding/useOnboarding.js'
import { usePreferences } from '../../src/features/settings/usePreferences.js'

export default function OnboardingRoute() {
  const { complete } = useOnboarding()
  const { preferences, set } = usePreferences()

  const finish = (result: OnboardingResult): void => {
    complete(result)

    /**
     * The two content answers, stored where the lesson composer can read them.
     *
     * `startRegion` and `level` are the whole reason those two steps exist — an
     * onboarding question whose answer goes nowhere is a form, not an onboarding, and
     * this repo has spent a month finding capabilities that shipped unwired. Home reads
     * both when it composes the first lessons; both stop mattering once the scheduler
     * has real answers to work from.
     */
    set('startRegion', result.startRegion)
    set('startLevel', result.level)
    // The goal was chosen here; Settings and the reminder scheduler read it from
    // preferences. Writing it in two places would let them disagree.
    set('dailyGoalMinutes', result.dailyGoalMinutes)

    // Straight into the taster lesson — not to Home. The promise on the previous
    // screen was "one short lesson, no account needed", and landing on Home instead
    // would break it at the exact moment trust is being established.
    // `?taster=1` so the lesson knows it is THE activation moment. Same runner, same
    // items, same scoring — the flag only changes what is recorded, which is why it is
    // a query param like `mode` rather than a second route.
    router.replace('/lesson?taster=1')
  }

  return (
    <OnboardingScreen
      currentYear={new Date().getFullYear()}
      language={preferences.language}
      // Straight through to the preference, which calls `setLocale` — so the tap
      // redraws this screen in the chosen language before the finger lifts.
      onLanguage={(choice) => set('language', choice)}
      onFinish={finish}
    />
  )
}
