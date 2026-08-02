/**
 * AnswerOption — the most-tapped component in the product.
 *
 * Every rule here comes from the voice and accessibility specs:
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
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { colors, radius, space } from '../tokens.js'
import { text } from '../typography.js'

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

const SURFACES: Record<AnswerState, string> = {
  idle: colors.bg.surfaceRaised,
  selected: colors.bg.surfacePressed,
  correct: colors.feedback.correct,
  wrong: colors.feedback.wrong,
  disabled: colors.bg.surface,
}

/** The non-colour half of every state signal. */
const GLYPHS: Record<AnswerState, string | null> = {
  idle: null,
  selected: null,
  correct: '✓',
  wrong: '→',
  disabled: null,
}

export function AnswerOption({
  label,
  state = 'idle',
  onPress,
  accessibilityLabel,
  style,
  testID,
}: AnswerOptionProps) {
  const isInert = state === 'disabled' || state === 'correct' || state === 'wrong'

  return (
    <Pressable
      accessible
      role="button"
      aria-label={accessibilityLabel ?? label}
      aria-selected={state === 'selected'}
      aria-disabled={isInert}
      disabled={isInert}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: SURFACES[state] },
        state === 'idle' && styles.idleBorder,
        state === 'correct' && styles.correctBorder,
        pressed && state === 'idle' && { backgroundColor: colors.bg.surfacePressed },
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          state === 'disabled' && { color: colors.text.tertiary },
        ]}
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
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  idleBorder: { borderWidth: 1, borderColor: colors.border.subtle },
  correctBorder: { borderWidth: 1, borderColor: colors.feedback.correct },
  label: {
    ...text('bodyStrong'),
    flexShrink: 1,
    color: colors.text.primary,
    textAlign: 'center',
  },
  // `end`, not `right`. The whole row mirrors in RTL and the correctness glyph has to
  // travel with the text it belongs to, not stay pinned to a physical edge.
  glyphWrap: { position: 'absolute', end: space[4] },
  // A tick or a cross, not type — it comes from the system emoji/symbol font, so
  // there is no custom family to pick a weight from.
  glyph: { fontSize: 18, color: colors.text.onAccent },
})
