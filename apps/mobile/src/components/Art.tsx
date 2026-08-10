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
 *
 * ## Art with no transparent edge is a PANEL, not a picture floating on the canvas
 *
 * Fifteen of the masters measure as their own whole frame — they were generated on an
 * opaque plate rather than cut out. Drawn flat on `bg.canvas` that plate has a hard
 * visible seam, and the review found it everywhere it happens: Paused was a bright
 * orange square on a blue card, the Profile empty state a near-black block on navy, and
 * onboarding's first slide a globe with the horizon sliced off by a straight edge. All
 * three read as a screenshot pasted into the layout.
 *
 * The square box made it worse rather than better. `states/empty-profile` is 3:2 drawn
 * in a 140pt square, so the image was 140×93 and the frame's rounded corners sat in the
 * 47pt of empty space above and below it — the radius was clipping nothing, and the
 * only corners on screen were the picture's own right-angled ones.
 *
 * So whole-frame art takes its own aspect for a box, which puts the frame's corners on
 * the art's corners where the radius can bite, and rounds hard enough to read as a
 * deliberate illustration panel. A square one becomes a circle: a character on a plate
 * is a portrait, and this app already draws portraits round — the avatar, the medals.
 *
 * The seven continent skies opt out. They are not panels on a canvas; they FILL a tile
 * that owns its own edge, and a second rounded rectangle inside the first is the seam
 * this is trying to remove. That is what `frame="bleed"` is for, and it is the caller's
 * call because it is the caller that knows what the art is sitting in.
 *
 * Default `auto` rather than an allowlist of the seven that need it, deliberately: a
 * whole-frame master delivered next month is then correct on arrival, and the two known
 * exceptions are the ones that had to say so.
 */

import { useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { colors, radius, squircle } from '@worldquest/design'
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
  /**
   * `bleed` for art that fills a container which owns its own edge — the continent
   * tiles. `auto`, the default, gives whole-frame art a panel's shape. See above.
   */
  readonly frame?: 'auto' | 'bleed' | undefined
}

/**
 * Where "the subject fills its own frame" starts, and the same number the build uses to
 * decide it. Measured, the split is not close: a cutout covers 36–73 % of its file and a
 * baked plate 92–100 %, so nothing sits near the line for this to get wrong.
 */
const WHOLE_FRAME = 0.85

export function Art({ name, size, height, label, frame = 'auto' }: ArtProps) {
  /**
   * A decode that fails leaves a HOLE, and a hole is worse than an absence.
   *
   * Onboarding's first slide came back off TestFlight as an empty hairline rectangle
   * where the parachuting Atlas should have been — the frame drew, the picture did not.
   * It renders correctly in the web harness at all three viewports, so the cause is not
   * proven and may not be this component's at all (docs/design/ios-native-audit.md, O1).
   *
   * What IS this component's business is the shape of the failure. An `<Image>` that
   * cannot decode renders nothing and says nothing, so a bordered empty box is exactly
   * what a user sees, and it looks like a deliberate placeholder rather than a fault —
   * which is why nobody found it until a screenshot arrived. Dropping the frame instead
   * costs a picture and reads as a layout that never had one, which is the honest
   * degradation: these illustrations are decorative by definition here (see the note
   * above about `label`), so nothing a user needs is behind them.
   */
  const [failed, setFailed] = useState(false)
  const asset = ART_BY_NAME[name]
  // Metro gives a number, Vite a URL string — see types/assets.d.ts.
  const source = typeof asset === 'string' ? { uri: asset } : asset
  const geometry = ART_GEOMETRY[name]

  const panel =
    frame === 'auto' && geometry.w >= WHOLE_FRAME && geometry.h >= WHOLE_FRAME
  // A panel's box is the art's own shape, so the radius lands on the art's own corners.
  // Everything else keeps the square box: a cutout has transparent margin to spare and a
  // column of square boxes is what keeps a list of illustrations on an even rhythm.
  const box = { width: size, height: height ?? (panel ? size / geometry.aspect : size) }

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

  // Nothing at all, rather than a framed hole. See `failed` above.
  if (failed) return null

  return (
    <View
      style={[
        styles.frame,
        box,
        // Round, not rounded, when the plate is square: a character on a square plate is
        // a portrait, and this app already draws portraits round.
        panel && {
          borderRadius: box.width === box.height ? radius.full : radius['2xl'],
          // A hairline, so the edge is a frame the design put there rather than where
          // the picture happened to stop. Radius alone was not enough on a wide, short
          // block: 28pt of corner on a 93pt-tall panel still meets the canvas along two
          // long straight edges, and a near-black plate on navy shows every one of them.
          borderWidth: 1,
          borderColor: colors.border.subtle,
        },
      ]}
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
        onError={() => setFailed(true)}
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
    ...squircle,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
