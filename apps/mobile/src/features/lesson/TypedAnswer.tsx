/**
 * The field a typed answer goes in.
 *
 * Recall rather than recognition — the learner produces "Reykjavík" instead of picking it out
 * of four. It is the one place in a lesson with a keyboard, which is why most of this file is
 * about getting out of the keyboard's way and never about the field's looks.
 *
 * Presentational: the machine owns what is typed (`TYPE`) and when it is graded (`CHECK`);
 * this draws the text and the verdict on it.
 *
 * ## Calm on every verdict
 *
 * The same rule as the answer options: a wrong answer gets the muted surface and a lit edge,
 * never red, never a shake. A near miss — right with a typo — is drawn as RIGHT, because it is
 * right, and the sheet below says how it is spelled. Colour is never the only signal: the
 * sheet's words and the cue haptic carry the same verdict, and the field is read out as what it
 * is ("Type your answer", then the verdict) rather than as an unlabelled box.
 *
 * ## What it does NOT do
 *
 * No autocorrect, no autocapitalise, no spell-check, no suggestions: any of them would answer
 * the question for the learner, and a country's name is a proper noun the keyboard's dictionary
 * will "fix" into the wrong word. `autoComplete="off"` for the same reason, and because a
 * child's keyboard should not offer to remember what they typed.
 */

import { useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import { createThemeStyles } from '@worldquest/design'
import { radius, space, text } from '@worldquest/design'
import { useT } from '../../lib/i18n.js'

export type TypedState = 'idle' | 'correct' | 'wrong'

export function TypedAnswer({
  value,
  onChange,
  onSubmit,
  state,
  maxLength,
}: {
  readonly value: string
  readonly onChange: (text: string) => void
  /** The keyboard's return key: the same as pressing Check. */
  readonly onSubmit: () => void
  readonly state: TypedState
  readonly maxLength: number
}) {
  const { colors, styles } = useThemeValues()
  const t = useT()
  const settled = state !== 'idle'
  // Focus is drawn, in the blue the options use for "selected": a field you are typing into
  // and one you are not were the same box, and on a phone with the keyboard up the learner
  // could not tell which of the two the cursor was in.
  const [focused, setFocused] = useState(false)

  return (
    <View style={styles.wrap}>
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        editable={!settled}
        maxLength={maxLength}
        placeholder={t('lesson:typed.placeholder')}
        // The platform's default placeholder inherited the field's full-contrast bold type, so
        // an EMPTY field read as one already holding "Type your answer". Quieter, so the two
        // states are different at a glance.
        placeholderTextColor={colors.text.tertiary}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // The label carries the verdict once the answer is in: a separate hint is not announced
        // everywhere, and colour alone is not a signal.
        accessibilityLabel={
          state === 'correct' ? t('lesson:typed.labelCorrect') : state === 'wrong' ? t('lesson:typed.labelWrong') : t('lesson:typed.label')
        }
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        returnKeyType="done"
        enterKeyHint="done"
        // The keyboard closes only when the answer is checked, not when the learner is
        // reading: a field that dismisses its own keyboard on a mis-tap loses the thing typed.
        blurOnSubmit={false}
        style={[
          styles.field,
          focused && state === 'idle' && styles.focused,
          state === 'correct' && styles.correct,
          state === 'wrong' && styles.wrong,
        ]}
        testID="typed-answer"
      />
    </View>
  )
}

const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
    wrap: { alignSelf: 'stretch' },
    field: {
      // Positioned, so it paints above any gradient behind it on the web, where an input is static.
      position: 'relative',
      ...text('h2'),
      color: colors.text.primary,
      backgroundColor: colors.option.idle,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: colors.option.idleEdge,
      paddingVertical: space[4],
      paddingHorizontal: space[4],
      textAlign: 'center',
    },
    focused: { borderColor: colors.option.selectedEdge },
    correct: { backgroundColor: colors.option.correct, borderColor: colors.option.correctEdge },
    wrong: { backgroundColor: colors.option.wrong, borderColor: colors.option.wrongEdge },
  })
  return { colors, styles }
})
