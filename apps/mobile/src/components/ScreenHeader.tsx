/**
 * The header for a full-screen route: a back control and a title.
 *
 * ## Why this exists
 *
 * The root `Stack` sets `headerShown: false` so the app owns its own chrome rather
 * than inheriting a platform header that fights the design. That was a deliberate
 * choice and it had a consequence nobody followed up on: **every full-screen route
 * outside the tabs shipped with no way back.**
 *
 * `pnpm a11y:tree` found it by reading the tree Chromium computes — `/achievements`
 * reported zero interactive nodes. Not one. The content rendered, the progress bars
 * were there, and there was nothing a keyboard or a screen reader could focus, which
 * means a reader user could enter that screen and never leave it. `/streak`,
 * `/country/[code]` and `/collection/[kind]` were the same: their only controls were
 * content, never navigation.
 *
 * On Android the hardware back key covers it and on iOS the edge-swipe usually does,
 * so this was invisible to anyone testing by hand with a working pair of eyes and a
 * gesture. On web it is a dead end with no escape at all, and for a screen-reader
 * user on any platform there is no announced way out.
 *
 * The mockup had it right the whole time — screens 7, 10, 11 and 14 all open with a
 * back arrow beside the title. This is that row.
 *
 * ## The label is the action, never the icon
 *
 * `common:back` is "Back", and its translator note has said "Describes the ACTION,
 * not the icon" since the day the key was written. The key existed and nothing used
 * it. The glyph is `aria-hidden` so a reader announces "Back, button" rather than
 * "Back, left arrow, button".
 */

import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, layout, space, text } from '@worldquest/design'
import { t } from '../lib/i18n.js'
import { Icon } from './Icon.js'

export type ScreenHeaderProps = {
  /**
   * Omitted where the screen already carries its own title.
   *
   * The streak screen's title is its flame and day count; the country page's is the
   * name beside the flag. Repeating either here would have a reader say it twice,
   * and moving them would be a redesign in the middle of a bug fix. Those screens
   * take a back control and nothing else.
   */
  readonly title?: string | undefined
  readonly onBack: () => void
  /** Optional trailing control — the favourite toggle on a country page. */
  readonly trailing?: React.ReactNode
}

export function ScreenHeader({ title, onBack, trailing }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable
        role="button"
        aria-label={t('common:back')}
        onPress={onBack}
        // The visual glyph is small; the target must not be. `hitSlop` grows the
        // target without growing the arrow — the rule from the a11y skill.
        hitSlop={space[2]}
        style={styles.back}
      >
        {/* Decorative: the button already announces its purpose. Without this the
            reader says "Back, left arrow" — the icon read out after the action.
            The icon also MIRRORS for RTL, which the `←` character never did. */}
        <Icon name="back" size={22} color={colors.text.primary} />
      </Pressable>

      {title === undefined ? (
        <View style={styles.title} />
      ) : (
        <Text style={styles.title} role="heading" aria-level={1} numberOfLines={1}>
          {title}
        </Text>
      )}

      {/* Always rendered, so the title stays optically centred whether or not a
          trailing control exists. */}
      <View style={styles.trailing}>{trailing}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  back: {
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    // `start`, not `left` — this mirrors under RTL, and the arrow with it.
    marginStart: -space[2],
  },
  glyph: { ...text('h2'), color: colors.text.primary },
  title: { ...text('h2'), color: colors.text.primary, flex: 1 },
  trailing: { minWidth: layout.minTouchTarget, alignItems: 'flex-end' },
})
