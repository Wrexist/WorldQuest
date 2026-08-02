/**
 * More — Settings, and eventually everything that does not earn a tab of its own.
 *
 * The tab is called "More" rather than "Settings" because that is what will be
 * behind it: settings, help, the parent area, and whatever v2 adds. Renaming a tab
 * later moves a destination users have already learned.
 */

import { openURL } from 'expo-linking'
import Constants from 'expo-constants'
import { SettingsScreen } from '../../src/features/settings/SettingsScreen.js'
import { usePreferences } from '../../src/features/settings/usePreferences.js'
import { useSyncStatus } from '../../src/features/settings/useSyncStatus.js'

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

export default function MoreRoute() {
  const { preferences, set } = usePreferences()
  const sync = useSyncStatus()

  return (
    <SettingsScreen
      version={Constants.expoConfig?.version ?? '0.0.0'}
      preferences={preferences}
      onChange={set}
      sync={sync}
      onOpenPrivacyPolicy={open(PRIVACY_URL)}
      onOpenTerms={open(TERMS_URL)}
      onOpenLicences={open(LICENCES_URL)}
    />
  )
}
