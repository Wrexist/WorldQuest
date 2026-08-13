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
 * ## The gem chip is real, and hidden at zero
 *
 * `Progress` deliberately does not carry gems today, and the reason is written down in
 * `packages/api/src/client.ts`: the column has been 0 on every row this product has ever
 * created, and fetching a currency nothing grants and nothing spends "made the app look
 * like it had a gem economy to anyone reading this type".
 *
 * The redesign draws a gem balance next to the coins. So the chip is built, wired, and
 * rendered only when there is a balance to render — which is the same rule the streak
 * badge already follows one prop over, and for the same reason: a wallet reading 0 is a
 * fact about a balance, a currency reading 0 that can never be anything else is set
 * dressing. When gems are granted by something, they appear here with no further change.
 *
 * ## The bell and the gear are optional, and absent means absent
 *
 * A control with no handler is not rendered rather than rendered dead. The mockup puts a
 * gear on Profile and nowhere else, which is what `onSettings` is: the way to Settings
 * now that it is not a tab.
 */

import { StyleSheet, View, Pressable } from 'react-native'
import { Avatar, colors, layout, space } from '@worldquest/design'
import { Icon } from './Icon.js'
import { Stat } from './Stat.js'
import { useT } from '../lib/i18n.js'

export type TopBarProps = {
  /** Initials, when the user has not chosen a portrait. */
  readonly initials?: string | undefined
  /** The chosen portrait, clipped to the avatar circle. */
  readonly avatar?: React.ReactNode | undefined
  /** Spendable coins. Rendered at zero — a balance is a fact, not a verdict. */
  readonly coins?: number | undefined
  /** Premium currency. Rendered only when there is one — see the note above. */
  readonly gems?: number | undefined
  readonly onAvatar?: (() => void) | undefined
  readonly onInbox?: (() => void) | undefined
  /** Profile only. The way into Settings now that More is not a tab. */
  readonly onSettings?: (() => void) | undefined
}

/** The chips' own optical size, matching `Stat`. */
const GLYPH = 20

export function TopBar({
  initials,
  avatar,
  coins,
  gems,
  onAvatar,
  onInbox,
  onSettings,
}: TopBarProps) {
  const t = useT()
  // Spread rather than passed: `exactOptionalPropertyTypes` is on, so an explicit
  // `image={undefined}` is a different thing from an absent `image`, and `Avatar`'s
  // fallback-to-initials path is the absent one.
  const face = {
    ...(initials !== undefined ? { initials } : {}),
    ...(avatar !== undefined ? { image: avatar } : {}),
  }

  return (
    <View style={styles.bar}>
      {/* Pressable ONLY when it goes somewhere. `Avatar` is already an accessibility
          element with its own name, so wrapping it in a button that does nothing would
          add a second focus stop announcing the same thing. */}
      {onAvatar === undefined ? (
        <Avatar {...face} accessibilityLabel={t('home:avatar.label')} />
      ) : (
        <Pressable onPress={onAvatar} role="button" aria-label={t('home:avatar.label')}>
          {/* Named by the Pressable, so the picture inside it is silent. Two nested
              elements with the same name is the same word twice to a screen reader. */}
          <Avatar {...face} accessibilityLabel="" />
        </Pressable>
      )}

      <View style={styles.spacer} />

      {gems !== undefined && gems > 0 && (
        <Stat kind="gem" value={gems} accessibilityLabel={t('home:stats.gems', { amount: gems })} />
      )}
      {coins !== undefined && (
        <Stat
          kind="coin"
          value={coins}
          accessibilityLabel={t('home:stats.coins', { amount: coins })}
        />
      )}

      {onInbox !== undefined && (
        <Pressable
          onPress={onInbox}
          role="button"
          aria-label={t('home:inbox.label')}
          style={styles.chrome}
          hitSlop={8}
        >
          <Icon name="bell" size={GLYPH} color={colors.text.secondary} />
        </Pressable>
      )}

      {onSettings !== undefined && (
        <Pressable
          onPress={onSettings}
          role="button"
          aria-label={t('nav:more')}
          style={styles.chrome}
          hitSlop={8}
        >
          <Icon name="settings" size={GLYPH} color={colors.text.secondary} />
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingBottom: space[3],
  },
  spacer: { flex: 1 },
  // A real target around a 20pt glyph. The bell used to be a bare `View` with a label,
  // which iOS never focuses and no finger can reliably hit.
  chrome: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
