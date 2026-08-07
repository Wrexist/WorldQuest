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
 * ## `size` is the SUBJECT, not the frame
 *
 * This is the one thing to know about this component, and it was wrong for a while.
 *
 * Every master is a subject inside a 3:2 frame with a generous transparent margin, and
 * the frame used to be what got sized: `contain` fitted the whole 768×512 file into the
 * box, margin and all. `atlas/thinking` is 274×314 of that file, so `size={84}` on the
 * Home quest card drew Atlas at about 34 points — a thumbnail of a mascot inside a
 * placeholder-shaped panel. Measured across the set, the subject was landing at 38–62 %
 * of what the screen asked for.
 *
 * That is the entire "the mockup is image-led and the app is text-led" diagnosis in one
 * number. Every illustration had been commissioned, delivered, compressed, budgeted and
 * wired up — and then drawn at half scale, everywhere, because `size` meant the empty
 * frame around the picture rather than the picture.
 *
 * So the build measures where the subject is (`ART_GEOMETRY`, from the shipped WebP) and
 * this scales the image until the SUBJECT fits the box, then nudges it so the subject's
 * centre is the box's centre. The frame overflows and is clipped, which costs nothing:
 * what overflows is transparent by definition — it is the margin the box is no longer
 * paying for.
 *
 * A fully opaque asset — the continent cards — measures as its own whole frame, so it
 * behaves exactly as it did before. Nothing was special-cased to make that true.
 *
 * ## A square BOX, holding art that is not square
 *
 * Callers give one size, so the box is square by default and the rhythm of a column of
 * these stays even.
 *
 * `height` is the exception, and it exists for one shape: a banner. Every illustration
 * here is a subject in a 3:2 frame except `celebration/burst-wide`, which is a confetti
 * ribbon at roughly 6:1. A square box for a 6:1 ribbon is 84 % empty, and the emptiness
 * is not free when the box is positioned against something — the ribbon came out
 * centred in 420pt of nothing, directly behind an opaque card, and was invisible. Pass
 * `height` to match the art's own aspect and the box becomes the art.
 */

import { Image, StyleSheet, View } from 'react-native'
import { radius } from '@worldquest/design'
import { ART_BY_NAME, ART_GEOMETRY, type ArtName } from '../lib/art.generated.js'

export type ArtProps = {
  readonly name: ArtName
  /** Width in points, and height too unless `height` says otherwise. */
  readonly size: number
  /**
   * Height in points, for art that is not meant to sit in a square box.
   *
   * Defaults to `size`. Only the banner needs it — see the note above.
   */
  readonly height?: number | undefined
  /**
   * Announce the image, with this text.
   *
   * Omitted — the normal case — hides it from the screen reader as decoration. Pass it
   * only where the picture says something the surrounding text does not.
   */
  readonly label?: string | undefined
}

export function Art({ name, size, height, label }: ArtProps) {
  const asset = ART_BY_NAME[name]
  // Metro gives a number, Vite a URL string — see types/assets.d.ts.
  const source = typeof asset === 'string' ? { uri: asset } : asset
  const box = { width: size, height: height ?? size }
  const geometry = ART_GEOMETRY[name]

  // How wide the whole image has to be drawn for its subject to just fit the box —
  // `contain`, but measured against the subject instead of the frame. Whichever of the
  // two constraints binds first wins, so the subject touches one pair of edges and stays
  // inside the other.
  const imageWidth = Math.min(box.width / geometry.w, (box.height * geometry.aspect) / geometry.h)
  const imageHeight = imageWidth / geometry.aspect

  // The image is centred by the frame; this is the leftover — how far the subject's own
  // centre sits from the image's. A transform rather than an offset, because a transform
  // is not mirrored in RTL and the subject's place in its frame has nothing to do with
  // reading direction.
  const shift = [
    { translateX: imageWidth * (0.5 - (geometry.x + geometry.w / 2)) },
    { translateY: imageHeight * (0.5 - (geometry.y + geometry.h / 2)) },
  ]

  return (
    <View
      style={[styles.frame, box]}
      {...(label === undefined
        ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, 'aria-hidden': true }
        : {})}
    >
      <Image
        source={source}
        // Hidden at THIS level too, not only on the frame above. `aria-hidden` is
        // inherited by a subtree, so the frame's is enough for a real screen reader —
        // but "decorative" should be true of everything this component renders rather
        // than true by inheritance, and `LessonSummary.test.tsx` asserts the strict
        // version: every node inside the XP card, individually. A promise that holds
        // only because of an ancestor is a promise that breaks when someone reparents it.
        {...(label === undefined
          ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, 'aria-hidden': true }
          : {})}
        style={{ width: imageWidth, height: imageHeight, transform: shift }}
        // The box already matches the image's aspect exactly, so this only guards
        // against a rounding disagreement. Never `cover`: the build deliberately does
        // not crop these, and cropping them now would undo that.
        resizeMode="contain"
        accessibilityLabel={label}
        alt={label ?? ''}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  // Clipped, because the delivery is mixed: some masters are clean cutouts on
  // transparency (`atlas/broken-compass`) and some carry a baked vignette
  // (`atlas/welcome`). A rounded frame makes the second kind read as a deliberate
  // illustration panel rather than a rectangle that missed its cutout, and costs the
  // first kind nothing — there is nothing there to clip.
  // `center` on both axes is what the shift above is measured against, and `hidden` is
  // what lets the image be drawn larger than the box it is being fitted into.
  frame: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
