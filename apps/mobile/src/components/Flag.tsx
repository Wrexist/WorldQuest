/**
 * A country's flag.
 *
 * One component for all three places a flag appears — the collection tile, the country
 * header, and the lesson prompt — because the two things that are easy to get wrong
 * here are the aspect ratio and what happens when the file is missing, and both should
 * be decided once.
 *
 * ## Decorative by default
 *
 * In the collection and on a country page the flag is illustration: the tile already
 * announces "Sweden, a blue field with a yellow cross, collected", and an image that
 * announces itself again just makes a screen reader say everything twice. So `alt` is
 * empty and the element is hidden from the tree unless a caller passes `label`.
 *
 * The lesson prompt is the exception and passes one — there the flag IS the question.
 *
 * ## Missing renders a placeholder, never a substitute
 *
 * `flagSource` returns nothing for a path the bundle does not have, and that draws the
 * reserved art slot. The tempting alternative — fall back to a similar flag, or to the
 * region's colour with a code on it — eventually shows a child the wrong country's
 * flag, and a wrong fact is the one bug this repo will not ship.
 */

import { Image, StyleSheet, View } from 'react-native'
import { ArtSlot, colors, radius } from '@worldquest/design'
import { Icon } from './Icon.js'
import { flagHeight, flagSource } from '../lib/flags.js'

export type FlagProps = {
  /** The content pack's `assets.flag.path`, e.g. `flags/SE.png`. */
  readonly path: string | undefined
  /** Width in points; the height follows from the 4:3 ratio. */
  readonly width: number
  /**
   * Tints the placeholder when the flag is missing. Callers pass the continent colour
   * where they have one, so an absent flag still reads as "a country in Europe".
   */
  readonly tint?: string | undefined
  /**
   * Announce the image, with this text. Omitted — the normal case — hides it from the
   * screen reader as decoration. Pass it only where the picture carries information
   * nothing else on screen does.
   */
  readonly label?: string | undefined
}

export function Flag({ path, width, tint, label }: FlagProps) {
  const source = flagSource(path)
  const height = flagHeight(width)

  if (source === undefined) {
    return <ArtSlot
        tint={tint ?? colors.bg.surfaceRaised}
        art={<Icon name="flag" size={Math.round(width * 0.4)} color={colors.text.tertiary} />}
        width={width}
        height={height}
      />
  }

  return (
    <View style={[styles.frame, { width, height }]}>
      <Image
        source={source}
        style={{ width, height }}
        // `contain`, not `cover`. Every file is already 4:3 so neither should crop
        // today — but `cover` is the one that fails silently and destructively if a
        // future source set is not, by trimming the stripe off the edge of a flag.
        resizeMode="contain"
        {...(label === undefined
          ? {
              // Three props for one idea, because the three renderers disagree.
              // react-native-web honours `aria-hidden` and ignores the two RN
              // platform props; iOS reads `accessibilityElementsHidden` and Android
              // `importantForAccessibility`. Measured, not assumed — `alt` on this
              // component does nothing at all on web, which is what the first
              // version of this file used.
              'aria-hidden': true,
              accessibilityElementsHidden: true,
              importantForAccessibility: 'no-hide-descendants' as const,
            }
          : {
              // `accessibilityLabel`, not `alt`: react-native-web puts this on the
              // wrapper as `aria-label` AND on the inner `<img>` as `alt`, which is
              // both halves of what a reader needs. `alt` alone reaches neither.
              accessibilityLabel: label,
              // `img`, the ARIA role name — not `image`, the RN one. React Native's
              // `Role` union takes the ARIA spelling and the compiler is the only
              // thing that catches the difference.
              role: 'img' as const,
            })}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  // The border matters more than it looks. It is what makes a flag read as an object
  // sitting on the card rather than as ink printed on it — and it is doing the most
  // work for the flags with a pale edge, where the artwork and the surface would
  // otherwise meet with nothing between them.
  frame: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.subtle,
  },
})
