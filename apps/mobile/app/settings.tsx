/**
 * Settings — reached from the gear on Profile.
 *
 * It was the fifth TAB, called "More", on the reasoning that "settings, help, the parent
 * area, and whatever v2 adds" would accumulate behind it and renaming a tab later moves a
 * destination users have already learned. Two years of v2 never arrived and the tab held
 * one screen, while the Shop — the app's only coin sink, and the thing the whole economy
 * points at — was a route reachable from one row on Profile.
 *
 * The redesign swaps them, and the gear it puts on Profile is what makes that safe: a
 * settings screen behind a gear on your own profile is where every phone already keeps
 * one, so this is a destination moving to the place users look first rather than a
 * destination being buried.
 */

import { openURL } from 'expo-linking'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import {
  SettingsScreen,
  type PremiumStatus,
} from '../src/features/settings/SettingsScreen.js'
import { usePreferences } from '../src/features/settings/usePreferences.js'
import { useSyncStatus } from '../src/features/settings/useSyncStatus.js'
import { useEntitlement } from '../src/features/paywall/useEntitlement.js'
import { usePurchases } from '../src/features/paywall/usePurchases.js'
import { useOnboarding } from '../src/features/onboarding/useOnboarding.js'

/**
 * Real URLs, not placeholders.
 *
 * A settings screen that opens a 404 is worse than one that opens nothing — these
 * are the two documents a user goes looking for when they already distrust an app.
 * They land with the marketing site; until then the rows have no handler and
 * correctly render as text rather than as buttons that do nothing.
 */
const PRIVACY_URL: string | undefined = undefined
const TERMS_URL: string | undefined = undefined
const LICENCES_URL: string | undefined = undefined

const open = (url: string | undefined) =>
  url === undefined ? undefined : () => void openURL(url)

export default function SettingsRoute() {
  const { preferences, set } = usePreferences()
  const sync = useSyncStatus()
  const entitlement = useEntitlement()
  const purchases = usePurchases()
  const { state } = useOnboarding()

  /**
   * Absent entirely on a child account.
   *
   * Not hidden, not disabled — absent. Apple requires commerce behind a parental gate
   * for under-13s, and "manage subscription" is commerce. A disabled row would still
   * be a purchasing opportunity in the listing sense, and it would also be a row that
   * tells a ten-year-old they are missing something.
   */
  const premium: PremiumStatus | undefined =
    state.isChild === true
      ? undefined
      : {
          isPremium: entitlement.isPremium,
          isTrialing: entitlement.isTrialing,
          trialDaysLeft: entitlement.trialDaysLeft,
          needsBillingFix: entitlement.needsBillingFix,
          isPaused: entitlement.isPaused,
          isEnding: entitlement.winbackWorthShowing,
          onFixBilling: purchases.manageBilling,
          onSeePlans: () => router.push('/paywall?source=settings'),
          onRestore: () => void purchases.restore(),
        }

  return (
    <SettingsScreen
      version={Constants.expoConfig?.version ?? '0.0.0'}
      preferences={preferences}
      onChange={set}
      sync={sync}
      premium={premium}
      onOpenPrivacyPolicy={open(PRIVACY_URL)}
      onOpenTerms={open(TERMS_URL)}
      onOpenLicences={open(LICENCES_URL)}
    />
  )
}
