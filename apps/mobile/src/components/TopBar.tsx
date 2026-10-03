import { createThemeStyles } from '@worldquest/design'
/**
 * The row every tab starts with: who you are, what you own, and the way into the inbox.
 *
 * ## Why it is one component and not five copies
 *
 * The redesign puts the same bar on Home, Explore, Quests, Profile and Shop, and the app
 * had it on exactly one of them — Home, assembled inline out of an `Avatar`, two `Stat`
 * chips and a bell in a `View`. Five copies of that is five chances for the coin balance
 * to sit at a different height, five places to remember when a sixth currency arrives,
 * and — the one that actually bites — five different answers to what the bar does when
 * the numbers are still loading.
 *
 * Coins are the spendable wallet. Streak gems are cosmetic keepsakes on the streak screen.
 *
 * ## The streak chip and the gear are optional, and absent means absent
 *
 * A control with no handler is not rendered rather than rendered dead. The mockup puts a
 * gear on Profile and nowhere else, which is what `onSettings` is: the way to Settings
 * now that it is not a tab.
 *
 * The streak chip replaced a bell labelled "Inbox". There is no inbox: the bell opened
 * Quests on Home and the streak page everywhere else. Duolingo's bar carries the streak,
 * as a flame and a count that open the streak, and that is what this is now.
 *
 * ## The portrait is the one the learner chose
 *
 * Every tab but Profile passed nothing, so the bar drew "EX" on four tabs whatever the
 * learner had picked in Settings. With no `avatar` given it now reads the preference.
 */

import { StyleSheet, View, Pressable, Text, useWindowDimensions } from 'react-native'
import { Avatar, ClaySurface, clayShadow, layout, radius, space, text } from '@worldquest/design'
import { Art } from './Art.js'
import { HeaderJewel } from './HeaderJewel.js'

import { Icon } from './Icon.js'
import { useT } from '../lib/i18n.js'
import { usePreferences } from '../features/settings/usePreferences.js'
import { avatarArt } from '../features/settings/AvatarPicker.js'
import { lessonsToday } from '../features/profile/useWeekActivity.js'

export type TopBarProps = {
  /** Initials, when the user has not chosen a portrait. */
  readonly initials?: string | undefined
  /** The chosen portrait, clipped to the avatar circle. */
  readonly avatar?: React.ReactNode | undefined
  /** Spendable coins. Rendered at zero — a balance is a fact, not a verdict. */
  readonly coins?: number | undefined
  readonly onAvatar?: (() => void) | undefined
  /** The current streak, drawn as a flame chip. Shown with `onStreak`, at zero too. */
  readonly streak?: number | undefined
  /** Opens the streak page. */
  readonly onStreak?: (() => void) | undefined
  /** Profile only. The way into Settings now that More is not a tab. */
  readonly onSettings?: (() => void) | undefined
}

/** Settings glyph inside its full touch target. */
const GLYPH = 20

export function TopBar({
  initials,
  avatar,
  coins,
  onAvatar,
  streak,
  onStreak,
  onSettings,
}: TopBarProps) {
  const { colors, styles } = useThemeValues()
  const t = useT()
  const { width, fontScale } = useWindowDimensions()
  const showBrand = streak === undefined || width / fontScale >= layout.baseWidth
  // Use the same device log as the daily goal, so the pending state updates immediately.
  const countedToday = streak !== undefined && lessonsToday() > 0
  const { preferences } = usePreferences()
  const portrait = avatar === undefined ? avatarArt(preferences.avatar) : null
  const image = avatar ?? (portrait !== null ? <Art name={portrait} size={40} /> : undefined)
  // Spread rather than passed: `exactOptionalPropertyTypes` is on, so an explicit
  // `image={undefined}` is a different thing from an absent `image`, and `Avatar`'s
  // fallback-to-initials path is the absent one.
  const face = {
    ...(initials !== undefined ? { initials } : {}),
    ...(image === undefined ? {} : { image }),
  }

  return (
    <View style={styles.bar}>
      <ClaySurface tone="navy" radius={radius['2xl']} />
      {/* Pressable ONLY when it goes somewhere. `Avatar` is already an accessibility
          element with its own name, so wrapping it in a button that does nothing would
          add a second focus stop announcing the same thing. */}
      {onAvatar === undefined ? (
        image === undefined ? <View accessible aria-label={t('home:avatar.label')}><HeaderJewel name="globe" size={48} /></View> : <Avatar {...face} accessibilityLabel={t('home:avatar.label')} />
      ) : (
        <Pressable onPress={onAvatar} role="button" aria-label={t('home:avatar.label')}>
          {/* Named by the Pressable, so the picture inside it is silent. Two nested
              elements with the same name is the same word twice to a screen reader. */}
          {image === undefined ? <HeaderJewel name="globe" size={48} /> : <Avatar {...face} accessibilityLabel="" />}
        </Pressable>
      )}

      {showBrand && <Text style={styles.brand}>{t('common:appName')}</Text>}
      <View style={styles.spacer} />

      {streak !== undefined && onStreak !== undefined && (
        <Pressable
          onPress={onStreak}
          role="button"
          aria-label={t(countedToday || streak === 0 ? 'home:streak.chip' : 'home:streak.chip.pending', { count: streak })}
          hitSlop={8}
        >
          {/* Named by the Pressable, so the chip inside it is silent, like the avatar.
              The muted number indicates a pending day; the label explains it in words. */}
          <View style={styles.counter} aria-hidden>
            <ClaySurface tone="navy" transparent radius={radius.lg} />
            <HeaderJewel name="flame" size={36} />
            <Text style={[styles.value, !countedToday && styles.pending]}>{streak}</Text>
          </View>
        </Pressable>
      )}

      {coins !== undefined && (
        <View accessible aria-label={t('home:stats.coins', { amount: coins })} style={styles.counter}>
          <ClaySurface tone="navy" transparent radius={radius.lg} />
          <HeaderJewel name="coins" size={36} />
          <Text style={styles.value}>{coins}</Text>
        </View>
      )}

      {onSettings !== undefined && (
        <Pressable
          onPress={onSettings}
          role="button"
          aria-label={t('nav:more')}
          style={styles.chrome}
          hitSlop={8}
        >
          <ClaySurface tone="navy" radius={radius.lg} />
          <Icon name="settings" size={GLYPH} color={colors.chrome.text} />
        </Pressable>
      )}
    </View>
  )
}



const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  bar: {
    ...clayShadow(colors),
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space[1],
    padding: space[3],
    borderRadius: radius['2xl'],
    backgroundColor: colors.chrome.surface,
    borderWidth: 1,
    borderColor: colors.chrome.edge,
  },
  spacer: { flex: 1 },
  brand: { ...text('bodyStrong'), color: colors.chrome.text, flexShrink: 1 },
  counter: {
    ...clayShadow(colors),
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    paddingHorizontal: space[1],
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.chrome.counter,
    borderColor: colors.chrome.counterEdge,
  },
  value: { ...text('h3', { numeric: true }), color: colors.chrome.text },
  pending: { color: colors.chrome.muted },
  // A real target around a 20pt glyph. The bell used to be a bare `View` with a label,
  // which iOS never focuses and no finger can reliably hit.

  chrome: {
    borderRadius: radius.lg,
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
  return { colors, styles }
})
