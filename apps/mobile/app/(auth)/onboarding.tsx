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
  const { set } = usePreferences()

  const finish = (result: OnboardingResult): void => {
    complete(result)
    // The goal was chosen here; Settings and the reminder scheduler read it from
    // preferences. Writing it in two places would let them disagree.
    set('dailyGoalMinutes', result.dailyGoalMinutes)

    // Straight into the taster lesson — not to Home. The promise on the previous
    // screen was "one short lesson, no account needed", and landing on Home instead
    // would break it at the exact moment trust is being established.
    router.replace('/lesson')
  }

  return <OnboardingScreen currentYear={new Date().getFullYear()} onFinish={finish} />
}
