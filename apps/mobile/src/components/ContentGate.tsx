import { createThemeStyles } from '@worldquest/design'
/**
 * The error and offline halves of the five states, for the screens whose data comes
 * from `useContent`.
 *
 * ## Why this exists
 *
 * `scripts/five-states.ts` audited every screen against the rule that has been in
 * `PROJECT.md` since week one — content, loading, empty, error, offline — and found
 * that `useContent()` can return `status === 'error'` while **every browse screen
 * ignored it**. Explore, Collection, Country and Region all destructured `status` and
 * used only `status === 'loading'`. A content load that failed rendered an empty
 * screen with no explanation and no way to retry.
 *
 * It had never been noticed because content ships in the binary and therefore
 * essentially never fails — until the day a pack is downloaded (week 9, per
 * architecture.md §3), at which point it fails on exactly the users with the worst
 * connections.
 *
 * ## Why a wrapper and not a prop on each screen
 *
 * Routes are the layer that fetches (`apps/mobile/CLAUDE.md`), so error and offline
 * belong to the route. Threading two more props through nine presentational screens
 * would put the same nine branches in nine files, and the tenth screen would forget.
 *
 * The screens keep `loading` and `empty` — those are about the *shape* of the data
 * and belong with the thing that draws it.
 */

import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Skeleton, space, text } from '@worldquest/design'
import { useT } from '../lib/i18n.js'
import { FailureState } from './FailureState.js'

export type ContentGateProps = {
  /** `status` from `useContent`. Only `'error'` changes what is rendered. */
  readonly status: 'loading' | 'ready' | 'error'
  readonly onRetry: () => void
  /**
   * Renders the reassurance banner above the screen.
   *
   * Reassurance, never an alarm: everything on these screens is local, so offline
   * changes nothing about what works. Saying so is the point — a user who notices
   * they have no signal should not have to wonder whether the app still functions.
   */
  readonly isOffline?: boolean
  /**
   * Render a skeleton while loading, instead of the children.
   *
   * Off by default because most screens here own a skeleton shaped like their own
   * content — a grid of tiles, a list of rows — and a generic one would be a downgrade.
   * On for the screens that have none of their own (`CountryScreen`, `RegionScreen`),
   * where the alternative is a blank frame.
   */
  readonly showLoading?: boolean
  readonly children: ReactNode
}

export function ContentGate({
  status,
  onRetry,
  isOffline = false,
  showLoading = false,
  children,
}: ContentGateProps) {
  const { styles } = useThemeValues()
  const t = useT()

  if (showLoading && status === 'loading') {
    return (
      <View style={styles.loading} aria-label={t('common:loading')}>
        <Skeleton width="60%" height={28} />
        <Skeleton height={120} />
        <Skeleton height={120} />
      </View>
    )
  }

  if (status === 'error') {
    return (
      <FailureState titleKey="common:error.generic.title" bodyKey="common:error.generic.body" ctaKey="common:retry" onPress={onRetry} />
    )
  }

  return (
    <View style={styles.flex}>
      {isOffline && (
        // `role="alert"` so a screen reader announces the change rather than leaving a
        // blind user to discover it by wandering into the banner.
        <View style={styles.offline} role="alert">
          <Text style={styles.offlineText}>{t('common:offline.banner')}</Text>
        </View>
      )}
      {children}
    </View>
  )
}



const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  flex: { flex: 1 },
  // No `backgroundColor`. It painted `bg.canvas` flat over the root gradient — the
  // third and last of the stragglers `ScreenBackground` was written to remove, after
  // League and the account form. A skeleton on a flat fill that becomes a gradient the
  // moment the content lands is a visible seam at the one moment a screen is meant to
  // feel like it is filling in.
  loading: { flex: 1, padding: space[4], gap: space[3] },
  offline: {
    backgroundColor: colors.bg.surfaceRaised,
    borderBottomWidth: 2,
    borderBottomColor: colors.border.subtle,
    paddingVertical: space[2],
    paddingHorizontal: space[4],
  },
  offlineText: { ...text('caption'), color: colors.text.secondary, textAlign: 'center' },
})
  return { colors, styles }
})
