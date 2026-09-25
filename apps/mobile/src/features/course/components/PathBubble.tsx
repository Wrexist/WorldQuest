/**
 * A card that points at a step on the path.
 *
 * Two jobs, one shape. Above the current step it is the callout — "Start", the step's
 * objective and which lesson is next — pointing down at the step it starts. Under a done
 * or closed step it is what a tap on that step opens: what the step is, and either a way
 * to practise it or how it opens. That second use is the donor's popover (Duolingo's
 * iOS path opens a card under any circle you tap), drawn in the flow rather than floated
 * over it, so a screen reader meets it right after the step it belongs to and nothing
 * has to trap focus.
 *
 * Full column width, with only the tail following the step's swing. A card centred on a
 * swung step would leave the column at 320 pt as soon as the text doubled; the tail is
 * what says which step it belongs to, so it is the part that moves.
 *
 * Tokens only. Not the white bubble the donor uses: white on this navy canvas is a glare
 * spot, which the owner has already rejected once for the celebration rays.
 */

import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { colors, radius, space, squircle } from '@worldquest/design'
import { TAIL } from './pathGeometry.js'

export type PathBubbleProps = {
  readonly children: ReactNode
  /** `down` at the step below it (the callout), `up` at the step above it (the card). */
  readonly pointing: 'up' | 'down'
  /** Where the tail's point sits, from the bubble's start edge, in points. */
  readonly tailAt: number
  /** The bubble's own width — the path column — so the tail cannot leave its corners. */
  readonly width: number
  /** `current` carries the primary action's green edge; `quiet` is the neutral card. */
  readonly tone: 'current' | 'quiet'
  readonly testID?: string | undefined
}

export function PathBubble({ children, pointing, tailAt, width, tone, testID }: PathBubbleProps) {
  // Kept clear of the rounded corners, where a tail would poke out of the curve.
  const inset = radius.lg + TAIL
  const start = Math.min(Math.max(tailAt, inset), Math.max(inset, width - inset)) - TAIL / 2
  const skin = tone === 'current' ? styles.current : styles.quiet

  return (
    <View style={styles.wrap} testID={testID}>
      {/* Decoration: the tail says which step this is about, and the step itself says
          so to a screen reader. */}
      <View
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[styles.tail, skin, pointing === 'down' ? styles.tailDown : styles.tailUp, { start }]}
      />
      <View style={[styles.body, skin]}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', position: 'relative' },
  body: {
    borderWidth: 2,
    borderRadius: radius.lg,
    ...squircle,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    gap: space[1],
  },
  // The edge colour is the whole difference between the two tones: the callout belongs to
  // the one primary action and is edged in its green; the card is neutral slate, the
  // colour `border.strong` exists to be because it means nothing.
  current: { backgroundColor: colors.bg.surfaceRaised, borderColor: colors.action.primary },
  quiet: { backgroundColor: colors.bg.surface, borderColor: colors.border.strong },
  tail: {
    position: 'absolute',
    width: TAIL,
    height: TAIL,
    borderWidth: 2,
    transform: [{ rotate: '45deg' }],
  },
  // Half the square outside the body; the body's own fill hides the inner half, so the two
  // borders never show a seam across the mouth of the tail.
  tailDown: { bottom: -TAIL / 2 },
  tailUp: { top: -TAIL / 2 },
})
