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

    // Fresh installs use defaults; replaying the intro preserves saved preferences.
    // The same course lesson and scoring run here. The taster flag keeps its first
    // completion focused on the next challenge instead of additional offers.
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
      // Returning sign-in has its own age safeguard. Push allows returning to welcome.
      onSignIn={() => router.push('/account?mode=signIn')}
    />
  )
}
