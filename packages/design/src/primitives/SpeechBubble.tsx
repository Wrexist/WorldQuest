/**
 * SpeechBubble — the surface Atlas talks out of.
 *
 * The whole point is grammatical rather than decorative: a heading on a screen is the
 * app *labelling* a form, and the same words in a bubble beside a character are
 * somebody *asking you a question*. Onboarding is a series of questions, and which of
 * those two it feels like is the difference between filling in a signup and being
 * shown around.
 *
 * `docs/design/voice-and-tone.md` already says Atlas appears at first launch. Until
 * now he appeared there as a picture sitting above a heading, which is a mascot in the
 * room rather than a mascot talking — the art was doing none of the work its own spec
 * assigned it.
 *
 * ## The tail is a rotated square, not a triangle
 *
 * A bordered triangle cannot be drawn in React Native without an SVG or three
 * overlapping views, and both spellings fight the border. A square rotated 45° and
 * pushed halfway out from the edge, carrying the same fill and the same two borders,
 * gives a tail whose stroke matches the body exactly — and then the body is drawn over
 * the half of it that would show through.
 *
 * Because the tail is a real element and not a border trick, it moves with `from`: a
 * bubble beside a mascot on the left points left, and the same component points down
 * when the mascot is beneath it.
 *
 * ## Accessibility
 *
 * The bubble is ONE element with the sentence as its name, so a reader hears the
 * question in one breath rather than hearing a graphic and then a fragment. The tail is
 * decoration and is hidden — announcing "image" between the mascot and his own words
 * would be a third voice in a two-voice exchange.
 */

import type { ReactNode } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, radius, space } from '../tokens.js'
import { squircle } from '../shape.js'
import { text } from '../typography.js'

export type SpeechBubbleProps = {
  /** The line Atlas says. A whole sentence — never assembled from fragments. */
  children: ReactNode
  /**
   * Which edge the tail hangs off, i.e. where the speaker is.
   *
   * `start` points at a mascot beside the bubble, `top` at one above it, `bottom` at one
   * underneath. Named for the SPEAKER rather than for a direction so RTL needs no second
   * thought — `start` is left in English and right in Arabic, which is where the mascot
   * will be.
   *
   * `top` is what onboarding uses, and the reason is width: a mascot BESIDE the bubble
   * splits a 320 pt screen between them and neither gets enough, so the speaker was
   * capped at 72 pt to leave the question a readable measure. Stacked, both get the full
   * width — which is what lets Atlas be twice the size and the question still break
   * where a sentence should.
   */
  from?: 'start' | 'top' | 'bottom'
  style?: StyleProp<ViewStyle>
}

const TAIL = 14

export function SpeechBubble({ children, from = 'start', style }: SpeechBubbleProps) {
  return (
    <View style={[styles.wrap, style]}>
      <View
        style={[styles.tail, TAIL_AT[from]]}
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      />
      {/* `accessible` so the sentence lands as one node. Without it a reader walks the
          Text and the tail separately, and the question arrives in pieces. */}
      <View style={styles.body} accessible>
        <Text style={styles.line}>{children}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', position: 'relative' },
  body: {
    backgroundColor: colors.bg.surface,
    borderWidth: 2,
    borderColor: colors.border.strong,
    borderRadius: radius.xl,
    ...squircle,
    paddingVertical: space[4],
    paddingHorizontal: space[4],
  },
  /**
   * Centred rather than large. This carries a question the user is about to answer, so
   * it is the loudest text on the step — but `h2` at two lines on a 320 pt screen would
   * push the answers below the fold, and the answers are the point.
   */
  line: { ...text('h3'), color: colors.text.primary, textAlign: 'center' },
  tail: {
    position: 'absolute',
    width: TAIL,
    height: TAIL,
    backgroundColor: colors.bg.surface,
    borderWidth: 2,
    borderColor: colors.border.strong,
    transform: [{ rotate: '45deg' }],
  },
  // Half the square sits outside the body; the body's own fill hides the inner half,
  // which is why the two borders never show a seam across the mouth of the tail.
  tailStart: { start: -TAIL / 2, top: space[5] },
  tailTop: { top: -TAIL / 2, alignSelf: 'center' },
  tailBottom: { bottom: -TAIL / 2, alignSelf: 'center' },
})

/**
 * Looked up rather than nested ternaries, so a fourth direction is one line here and
 * one line in the union above — and neither is a place a reader has to unpick.
 */
const TAIL_AT = {
  start: styles.tailStart,
  top: styles.tailTop,
  bottom: styles.tailBottom,
} as const
