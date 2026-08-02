/**
 * AnswerOption — the most-tapped component in the product.
 *
 * Drawn as a face on an edge and sinks when pressed, like every other solid control
 * here (`press3d.tsx`). That matters more on this component than on any other: a
 * question is four of these in a column, and if they read as flat list rows the user
 * is reading a form. If they read as buttons, they tap.
 *
 * Every rule below comes from the voice and accessibility specs:
 *
 *  - A wrong answer gets a MUTED surface, never red, and no shake or buzzer. We
 *    state the truth and move on; we do not punish. (voice-and-tone.md)
 *  - Correct is never signalled by colour alone — an icon accompanies it, and the
 *    caller pairs it with a haptic. ~8% of men are red/green colour-blind and a
 *    large share of our core audience is 10-year-old boys. (accessibility.md)
 *  - Options are ≥56pt tall and disabled during feedback, which doubles as
 *    double-tap protection.
 */

import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { colors, depth, radius, space } from '../tokens.js'
import { text } from '../typography.js'
import { press3d, useFacePress } from './press3d.js'

export type AnswerState = 'idle' | 'selected' | 'correct' | 'wrong' | 'disabled'

export type AnswerOptionProps = {
  label: string
  state?: AnswerState
  onPress: () => void
  /** Announced instead of the bare label, e.g. "Japan, correct answer". */
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

type Skin = { face: string; edge: string; label: string }

const SKINS: Record<AnswerState, Skin> = {
  idle: {
    face: colors.option.idle,
    edge: colors.option.idleEdge,
    label: colors.text.primary,
  },
  selected: {
    face: colors.option.selected,
    edge: colors.option.selectedEdge,
    label: colors.text.primary,
  },
  correct: {
    face: colors.option.correct,
    edge: colors.option.correctEdge,
    label: colors.text.primary,
  },
  wrong: {
    face: colors.option.wrong,
    edge: colors.option.wrongEdge,
    label: colors.text.primary,
  },
  disabled: {
    face: colors.bg.surface,
    edge: colors.border.subtle,
    label: colors.text.tertiary,
  },
}

/** The non-colour half of every state signal. */
const GLYPHS: Record<AnswerState, string | null> = {
  idle: null,
  selected: null,
  correct: '✓',
  wrong: '→',
  disabled: null,
}

const FACE_HEIGHT = 56

export function AnswerOption({
  label,
  state = 'idle',
  onPress,
  accessibilityLabel,
  style,
  testID,
}: AnswerOptionProps) {
  const isInert = state === 'disabled' || state === 'correct' || state === 'wrong'
  const { translateY, onPressIn, onPressOut } = useFacePress(depth.card, isInert)
  const skin = SKINS[state]

  return (
    <Pressable
      accessible
      role="button"
      aria-label={accessibilityLabel ?? label}
      aria-selected={state === 'selected'}
      aria-disabled={isInert}
      disabled={isInert}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      testID={testID}
      style={[press3d.socket, styles.socket, style]}
    >
      <View
        style={[press3d.edge, styles.edge, { top: depth.card, backgroundColor: skin.edge }]}
      />

      <Animated.View
        style={[
          press3d.face,
          styles.face,
          { backgroundColor: skin.face, borderColor: skin.edge, transform: [{ translateY }] },
        ]}
      >
        <Text
          style={[styles.label, { color: skin.label }]}
          // Never truncate a country name — let it wrap and grow.
          numberOfLines={2}
        >
          {label}
        </Text>

        {GLYPHS[state] !== null && (
          <View style={styles.glyphWrap} importantForAccessibility="no-hide-descendants">
            <Text style={styles.glyph}>{GLYPHS[state]}</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  socket: { minHeight: FACE_HEIGHT + depth.card, alignSelf: 'stretch' },
  edge: { borderRadius: radius.lg },
  face: {
    minHeight: FACE_HEIGHT,
    borderRadius: radius.lg,
    // Two pixels, all the way round. The ring is what separates one option from the
    // next at a glance; without it four dark rectangles on a dark screen become one
    // shape and the eye has to do the work of finding the boundaries.
    borderWidth: 2,
    paddingHorizontal: space[5],
    paddingVertical: space[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  label: {
    ...text('bodyStrong'),
    flexShrink: 1,
    textAlign: 'center',
  },
  // `end`, not `right`. The whole row mirrors in RTL and the correctness glyph has to
  // travel with the text it belongs to, not stay pinned to a physical edge.
  glyphWrap: { position: 'absolute', end: space[4] },
  // A tick or an arrow, not type — it comes from the system emoji/symbol font, so
  // there is no custom family to pick a weight from.
  glyph: { fontSize: 20, color: colors.text.primary },
})
