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

import { useMemo } from 'react'
import { openSettings, openURL } from 'expo-linking'
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
import { useReminder } from '../src/features/settings/useReminder.js'
import { useAccountStatus } from '../src/features/account/useAccountStatus.js'
import { useLeagueOptOut } from '../src/features/league/useLeagueOptOut.js'
import { useLeagueEnabled } from '../src/features/league/flag.js'
import { signOutEverywhere } from '../src/features/account/signOut.js'
import { useT } from '../src/lib/i18n.js'

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
  const t = useT()
  const account = useAccountStatus()
  const leagueOn = useLeagueEnabled()
  const league = useLeagueOptOut()

  /**
   * The words the reminder will arrive in.
   *
   * Memoised because `useReminder` re-schedules whenever they change, and a fresh
   * object every render would re-schedule on every render — which on this feature means
   * cancelling and re-registering an OS notification sixty times a second.
   *
   * The region is the continent onboarding chose to start in, so the nudge names
   * somewhere this particular person is actually learning. Falling back to "The world"
   * rather than dropping the sentence: `notifications.md` §4 rule 7 says a notification
   * is localised as a WHOLE sentence and never assembled from fragments, and a template
   * with an empty slot is a fragment with extra steps.
   */
  const copy = useMemo(
    () => ({
      title: t('notifications:daily.title'),
      body: t('notifications:daily.reminder', {
        region:
          preferences.startRegion === null
            ? t('notifications:daily.anywhere')
            : t(`explore:region.${preferences.startRegion}` as 'explore:region.EU'),
      }),
    }),
    [t, preferences.startRegion],
  )
  const reminder = useReminder(copy)

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
      // Absent on a child account. Same rule as `premium` above and a stronger reason:
      // we must not collect an email address from an under-13, so there is no flow to
      // show. Settings draws a plain note in its place.
      {...(account.isChild
        ? {}
        : {
            account: {
              email: account.email,
              onLink: () => router.push('/account?mode=link'),
              onSignIn: () => router.push('/account?mode=signIn'),
              onSignOut: () => void signOutEverywhere(),
            },
          })}
      // Absent on a child account and while the flag is closed — see the prop's note.
      // Under-13s are never placed in a cohort, so a switch to join one would be one
      // more control that does nothing.
      {...(leagueOn && !account.isChild
        ? { league: { joined: league.joined, onChange: league.setJoined } }
        : {})}
      reminder={{
        ...reminder,
        onChange: reminder.setEnabled,
        // The OS's own page for this app — the only place a denied notification
        // permission can be granted, and the reason the blocked row is a link rather
        // than an apology.
        onOpenSystemSettings: () => void openSettings(),
      }}
      onOpenPrivacyPolicy={open(PRIVACY_URL)}
      onOpenTerms={open(TERMS_URL)}
      onOpenLicences={open(LICENCES_URL)}
    />
  )
}
