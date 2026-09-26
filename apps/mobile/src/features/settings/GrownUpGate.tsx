/**
 * A question for a grown-up, in front of anything on a child's device that leaves the
 * app or cannot be undone: the privacy policy, terms, licences and support pages, and
 * deleting the child's progress (App Review 1.3 and 5.1.4 ask for a parental gate before
 * links, purchases and anything else a young child should not do alone).
 *
 * Multiplication, the classic gate: easy for an adult at a glance, beyond most children
 * under nine, and nothing to read but digits. A wrong answer brings a new question, so it
 * cannot be passed by trying numbers in turn. Nothing is recorded either way; a gate that
 * remembered a child's failures would be the opposite of the point.
 */

import { useState } from 'react'
import { AccessibilityInfo, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Button, Card, colors, radius, space, text } from '@worldquest/design'
import { Art } from '../../components/Art.js'
import { ScreenHeader } from '../../components/ScreenHeader.js'
import { useT } from '../../lib/i18n.js'

export type GateQuestion = { readonly a: number; readonly b: number }

/** Two factors from six to nine: products from 36 to 81. */
export const newQuestion = (random: () => number = Math.random): GateQuestion => ({
  a: 6 + Math.floor(random() * 4),
  b: 6 + Math.floor(random() * 4),
})

export function GrownUpGate({
  onPass,
  onCancel,
  question: first,
}: {
  onPass: () => void
  onCancel: () => void
  /** A seam for tests; the app asks a random one. */
  question?: GateQuestion
}) {
  const t = useT()
  const [question, setQuestion] = useState<GateQuestion>(() => first ?? newQuestion())
  const [answer, setAnswer] = useState('')
  const [wrong, setWrong] = useState(false)

  const check = () => {
    if (Number(answer) === question.a * question.b) {
      onPass()
      return
    }
    const next = newQuestion()
    setWrong(true)
    setAnswer('')
    setQuestion(next)
    // Said out loud, with the new question in it. `role="alert"` below is a live region
    // on the web only: in React Native it sets a role description and nothing speaks, so
    // a blind parent heard nothing while the field emptied and the question changed.
    AccessibilityInfo.announceForAccessibility(t('settings:gate.wrongSpoken', { a: next.a, b: next.b }))
  }

  return (
    // `automaticallyAdjustKeyboardInsets`: the number pad has no return key on iOS, so
    // Continue is the only way on, and at 568 pt the pad covered it.
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <ScreenHeader title={t('settings:gate.title')} onBack={onCancel} />
      <View style={styles.art}>
        <Art name="atlas/thinking" size={space[9]} />
      </View>
      <Card level={1} style={styles.card} testID="grown-up-gate">
        <Text style={styles.body}>{t('settings:gate.body')}</Text>
        <Text style={styles.question} role="heading" aria-level={2}>
          {t('settings:gate.question', { a: question.a, b: question.b })}
        </Text>
        <TextInput
          value={answer}
          onChangeText={(value) => {
            setAnswer(value.replace(/\D/g, '').slice(0, 3))
            setWrong(false)
          }}
          // Named by the question it answers, so a screen reader landing on the field
          // hears what to type rather than "Answer".
          accessibilityLabel={t('settings:gate.question', { a: question.a, b: question.b })}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={3}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (answer.length > 0) check()
          }}
          style={styles.field}
        />
        {wrong && (
          <Text role="alert" style={styles.body}>
            {t('settings:gate.wrong')}
          </Text>
        )}
        <Button label={t('common:continue')} onPress={check} disabled={answer.length === 0} testID="grown-up-continue" />
        <Button label={t('common:cancel')} variant="ghost" onPress={onCancel} />
      </Card>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space[4], gap: space[4] },
  art: { alignItems: 'center' },
  card: { gap: space[3] },
  body: { ...text('body'), color: colors.text.secondary },
  question: { ...text('h2', { numeric: true }), color: colors.text.primary, textAlign: 'center' },
  field: {
    // Positioned, so it paints above the card's gradient on the web, where an input is
    // static and an absolutely placed backdrop covers it (native stacks by order).
    position: 'relative',
    ...text('h2', { numeric: true }),
    color: colors.text.primary,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.strong,
    padding: space[3],
    textAlign: 'center',
  },
})
