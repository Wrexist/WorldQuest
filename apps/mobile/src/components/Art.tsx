/**
 * An illustration.
 *
 * `ArtSlot` has held the space for these since the shell was built — a tinted panel at
 * the right size in the right place, so that the layout was correct before the art
 * existed and landing it would be "a one-line change rather than a redesign". This is
 * that one line, for every screen that had a slot.
 *
 * ## Decorative by default, like `Flag`
 *
 * Every one of these sits beside a heading and a body that already say what the screen
 * means. "You're all caught up" with a telescope next to it does not become clearer
 * when a screen reader announces the telescope; it becomes twice as long. So the image
 * is hidden from the tree unless a caller passes `label`, and no caller does yet —
 * there is no screen here where the picture carries information the text does not.
 *
 * ## The name is checked at compile time
 *
 * `ArtName` is a union generated from what `pnpm build:art` actually wrote, so a typo or
 * a deleted asset is a type error rather than a blank rectangle. That is the one thing
 * this cannot do for flags, where the key comes from a content pack and has to be
 * checked at runtime instead.
 *
 * ## Square, because the slots are
 *
 * The masters are 3:2 and the derivation centre-crops them to square (see
 * `scripts/build-art.cjs`). Callers give a size, not a width and a height, so there is
 * no way to letterbox one by accident.
 */

import { Image, StyleSheet, View } from 'react-native'
import { radius } from '@worldquest/design'
import { ART_BY_NAME, type ArtName } from '../lib/art.generated.js'

export type ArtProps = {
  readonly name: ArtName
  /** Width and height in points. */
  readonly size: number
  /**
   * Announce the image, with this text.
   *
   * Omitted — the normal case — hides it from the screen reader as decoration. Pass it
   * only where the picture says something the surrounding text does not.
   */
  readonly label?: string | undefined
}

export function Art({ name, size, label }: ArtProps) {
  const asset = ART_BY_NAME[name]
  // Metro gives a number, Vite a URL string — see types/assets.d.ts.
  const source = typeof asset === 'string' ? { uri: asset } : asset

  return (
    <View
      style={[styles.frame, { width: size, height: size }]}
      {...(label === undefined
        ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, 'aria-hidden': true }
        : {})}
    >
      <Image
        source={source}
        style={{ width: size, height: size }}
        // `contain` rather than `cover`: the crop already happened in the build, and
        // cropping twice would eat the 8% safe-area padding the style block requires.
        resizeMode="contain"
        accessibilityLabel={label}
        alt={label ?? ''}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  // Clipped, because several masters carry a baked background rather than the
  // transparency the delivery spec asks for. A rounded frame makes that read as a
  // deliberate illustration panel instead of a rectangle that missed its cutout.
  frame: { borderRadius: radius.lg, overflow: 'hidden' },
})
