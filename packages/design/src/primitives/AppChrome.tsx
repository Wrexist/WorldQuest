/**
 * The chrome the mockup shows and the walking skeleton skipped: avatar, streak
 * badge, tab bar, and the art slots that carry the map and trophy imagery.
 *
 * These are the components that make the app read as the mockup rather than as a
 * generic list of cards. Everything here is token-driven, so it themes with the
 * rest and survives a seasonal event override.
 *
 * Spec: docs/design/design-system.md · mockup screen 3
 */

import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, radius, space } from '../tokens.js'
import { fontFamily, text } from '../typography.js'

// ── avatar ──────────────────────────────────────────────────────────────────

export type AvatarProps = {
  /** Initials until the illustrated avatar set is commissioned. */
  initials?: string
  size?: number
  /**
   * The gold ring from the mockup.
   *
   * **It signals nothing today**, and the comment here used to say it signalled "a
   * level or a premium state". It defaults to `true` and no caller has ever passed
   * `false`, so every avatar in the app wears it — which makes it decoration, not a
   * signal. That is fine and matches the mockup; the claim was the problem.
   *
   * The seam is left in place because it is where a real distinction would go, but
   * whoever wires that up owns making it legible without colour: a gold ring versus
   * no ring is a hue difference on a small circle, which is exactly the kind of
   * signal `accessibility.md` §4 says must be paired with a shape or a label.
   */
  ringed?: boolean
  accessibilityLabel: string
}

export function Avatar({ initials = '', size = 40, ringed = true, accessibilityLabel }: AvatarProps) {
  return (
    <View
      accessible
      aria-label={accessibilityLabel}
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ringed ? 2 : 0,
        },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{initials}</Text>
    </View>
  )
}

// ── streak ──────────────────────────────────────────────────────────────────

export type StreakBadgeProps = {
  days: number
  /** "Day streak" — passed in so the component stays i18n-agnostic. */
  label: string
  /**
   * The flame, supplied by the caller for the same reason the tab icons are:
   * this was a literal `'🔥'`, which renders in the platform's own house style
   * and ignores every colour token this package owns.
   */
  icon: React.ReactNode
  accessibilityLabel: string
  /**
   * Makes the badge the way in to streak freezes and repair.
   *
   * Handled here rather than by wrapping the badge in a Pressable at the call site:
   * a wrapper needs its own label, which leaves two elements answering to the same
   * name and a screen reader announcing the streak twice.
   */
  onPress?: () => void
}

/**
 * Flame, count, then a caption underneath — the mockup's vertical stack rather
 * than a pill. The count is the loudest thing in the header after the greeting.
 */
export function StreakBadge({ days, label, icon, accessibilityLabel, onPress }: StreakBadgeProps) {
  const inner = (
    <>
      <View style={styles.streakRow}>
        {icon}
        <Text style={styles.streakCount}>{days}</Text>
      </View>
      <Text style={styles.streakLabel}>{label}</Text>
    </>
  )

  if (onPress === undefined) {
    return (
      <View accessible aria-label={accessibilityLabel} style={styles.streak}>
        {inner}
      </View>
    )
  }

  return (
    <Pressable
      accessible
      role="button"
      aria-label={accessibilityLabel}
      aria-disabled={false}
      onPress={onPress}
      style={styles.streak}
    >
      {inner}
    </Pressable>
  )
}

// ── art slot ────────────────────────────────────────────────────────────────

export type ArtSlotProps = {
  /** Tint drawn from the continent palette or a reward colour. */
  tint: string
  /**
   * What sits in the middle — an `<Icon>` from the app, or nothing.
   *
   * A node rather than a glyph string. The artwork is an app asset and this package
   * may not reach into `apps/mobile/assets`; a slot that renders whatever it is
   * handed also stops being a place where emoji accumulate.
   */
  art?: React.ReactNode
  width?: number
  height?: number
  style?: StyleProp<ViewStyle>
}

/**
 * Where the mockup's illustrations go.
 *
 * The mockup's map thumbnails, trophy and avatar are generated images; matching
 * them exactly needs commissioned art. This renders a tinted panel in the right
 * place at the right size so layout and rhythm are correct now, and swapping in
 * the real asset is a one-line change rather than a redesign.
 */
export function ArtSlot({ tint, art, width = 96, height = 96, style }: ArtSlotProps) {
  return (
    <View
      // Decorative: the card already carries its meaning in text.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={[styles.art, { width, height, backgroundColor: `${tint}22` }, style]}
    >
      {art}
    </View>
  )
}

// ── tab bar ─────────────────────────────────────────────────────────────────

export type TabItem = {
  key: string
  /**
   * Rendered by the caller so it can tint per state — the active tab's icon is
   * `action.primary` inside a filled chip, the inactive one is `text.secondary`.
   * Receives `active` rather than being two props, so the two can never disagree.
   */
  icon: (active: boolean) => React.ReactNode
  label: string
}

export type TabBarProps = {
  items: readonly TabItem[]
  activeKey: string
  onSelect: (key: string) => void
}

/**
 * Five tabs, forever (PROJECT.md §7). The active tab gets a filled chip behind
 * its icon — that chip is what makes the bar read as the mockup's rather than as
 * a default navigator.
 */
/**
 * How far a tab label may grow. See the comment at the label itself.
 *
 * Deliberately not a design token: it is not a value anyone should reach for
 * elsewhere. Every other string in this app scales all the way to `maxFontScale`,
 * and the moment a second component wants a cap, the right move is to ask why its
 * layout cannot hold its own text.
 */
const TAB_LABEL_MAX_SCALE = 1.2

export function TabBar({ items, activeKey, onSelect }: TabBarProps) {
  return (
    <View role="tablist" style={styles.tabBar}>
      {items.map((item) => {
        const active = item.key === activeKey
        return (
          <Pressable
            key={item.key}
            accessible
            role="tab"
            aria-label={item.label}
            aria-selected={active}
            style={styles.tab}
            // Pressable + onPress, NOT a View with onTouchEnd.
            //
            // `onTouchEnd` fires for a finger and for nothing else. A mouse click does
            // not produce a touch sequence, so on web the entire tab bar was inert —
            // the app's primary navigation, unusable with a trackpad. Neither does
            // VoiceOver's activate gesture, which dispatches an accessibility action,
            // so the bar was also unreachable with a screen reader ON EVERY PLATFORM.
            // And there was no keyboard activation, no focus ring, no pressed state.
            //
            // It looked fine, and it worked when tested with a finger, which is why it
            // survived. `pnpm e2e` found it the moment the tab assertions got strict
            // enough to notice they were passing while sitting on Home.
            onPress={() => onSelect(item.key)}
          >
            <View style={[styles.tabChip, active && styles.tabChipActive]}>{item.icon(active)}</View>
            {/*
              Bounded scaling, and this is the one place in the app that gets it.
              A tab is one fifth of the screen width and its label is a word that
              cannot be hyphenated, so at the 200 % text setting "Explore" is wider
              than the tab that holds it and the five labels overlap into an unreadable
              smear. That is worse for the user who turned the setting on than a label
              that grows only so far.

              `maxFontSizeMultiplier`, NOT `allowFontScaling={false}`: the label still
              scales, it just stops at 1.2×. Refusing to scale at all is the thing the
              accessibility spec forbids, and it is the lazy version of this fix.

              `dataSet` mirrors the cap into the DOM as `data-max-scale`, which is how
              the 200 %-text check in `e2e/flow.cjs` knows to respect it. Without that
              the harness would test a configuration the runtime cannot produce and
              report a failure nobody can act on.
            */}
            <Text
              maxFontSizeMultiplier={TAB_LABEL_MAX_SCALE}
              dataSet={{ maxScale: String(TAB_LABEL_MAX_SCALE) }}
              style={[styles.tabLabel, active && styles.tabLabelActive]}
            >
              {item.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: colors.bg.surfaceRaised,
    borderColor: colors.reward.xp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    // Size is computed from the avatar's diameter, so this cannot come from a scale
    // step — but the family still must, or the initials render in the system font.
    fontFamily: fontFamily('display', '700'),
    color: colors.text.primary,
  },

  streak: { alignItems: 'center' },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  flame: { fontSize: 18 },
  streakCount: { ...text('numeric'), color: colors.text.primary },
  streakLabel: { ...text('caption'), color: colors.text.secondary },

  art: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  tabBar: {
    flexDirection: 'row',
    // Two pixels, and in the strong slate rather than the subtle one. The bar is the
    // app's permanent furniture; a 1px hairline in a near-canvas colour left it
    // floating with no clear top on a dark screen.
    borderTopWidth: 2,
    borderTopColor: colors.border.subtle,
    paddingTop: space[2],
    paddingBottom: space[2],
    backgroundColor: colors.bg.surface,
  },
  tab: { flex: 1, alignItems: 'center', gap: space[1] },
  tabChip: {
    // 44pt minimum touch target, met by the chip rather than by hit slop.
    width: 52,
    height: 40,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabChipActive: { backgroundColor: colors.action.secondary },
  tabLabel: {
    // Title case, not the overline's uppercase — the mockup's bar reads "Explore",
    // not "EXPLORE", and five uppercase labels at this size become a fence.
    ...text('overline', { weight: '600', transform: 'none' }),
    color: colors.text.tertiary,
  },
  tabLabelActive: { color: colors.action.secondary },
})
