/** A no-stakes first discovery, entirely from the bundled country pack. */
import { useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { AnswerOption, Button, Card, Spacer, createThemeStyles, space, text } from '@worldquest/design'
import countries from '../../../../../packages/content/packs/geography/entities.countries.v1.json'
import { Art } from '../../components/Art.js'
import { Flag } from '../../components/Flag.js'
import { currentLocale, useT } from '../../lib/i18n.js'
import { hapticCorrect, hapticWrong } from '../../lib/haptics.js'
import { soundCorrect, soundWrong } from '../../lib/sound.js'

// This is a teaching demonstration, not an issued lesson: nothing is persisted,
// scheduled, sent to analytics or rewarded before the age/preferences setup.
const choices = countries.items.slice(0, 2)
const subject = choices[0]!

export function OnboardingDemo({ onContinue, onBack }: { onContinue: () => void; onBack: () => void }) {
  const { styles } = useThemeValues()
  const t = useT()
  const locale = currentLocale() === 'sv' ? 'sv' : 'en'
  const [practising, setPractising] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const scroll = useRef<ScrollView>(null)
  const answered = chosen !== null
  const correct = chosen === subject.id
  const country = subject.names[locale]
  const choose = (id: string) => {
    if (answered) return
    setChosen(id)
    if (id === subject.id) { hapticCorrect(); soundCorrect() }
    else { hapticWrong(); soundWrong() }
  }
  return <View style={styles.screen} testID="onboarding-demo">
    <ScrollView ref={scroll} contentContainerStyle={styles.content}
      onContentSizeChange={() => { if (answered) scroll.current?.scrollToEnd({ animated: false }) }}>
      <Spacer />
      <View style={styles.guide}>
        <Art name={answered ? correct ? 'atlas/celebrate' : 'atlas/encouraging' : 'atlas/welcome'} size={space[9] + space[6]} />
      </View>
      <Text role="heading" style={styles.title}>{t(practising ? 'onboarding:demo.question' : 'onboarding:demo.title')}</Text>
      <Card style={styles.fact}>
        <Flag path={subject.assets.flag.path} width={space[9] * 2}
          label={t('onboarding:demo.flagLabel', { country })} />
        {!practising && <Text style={styles.title}>{country}</Text>}
      </Card>
      {!practising && <Text style={styles.body}>{t('onboarding:demo.teach')}</Text>}
      {practising && choices.map(option => <AnswerOption key={option.id}
        label={option.names[locale]} onPress={() => choose(option.id)}
        state={!answered ? 'idle' : option.id === subject.id ? 'correct' : option.id === chosen ? 'wrong' : 'disabled'} />)}
      {answered && <View role="status" aria-live="polite">
        <Text style={styles.title}>{t(correct ? 'onboarding:demo.correct' : 'onboarding:demo.answer', { country })}</Text>
        <Text style={styles.body}>{t('onboarding:demo.noScore')}</Text>
      </View>}
      <Spacer />
    </ScrollView>
    <View style={styles.footer}>
      <Button label={t(!practising ? 'onboarding:demo.try' : 'common:continue')}
        onPress={!practising ? () => setPractising(true) : onContinue} />
      <Button variant="ghost" label={t('onboarding:back')} onPress={onBack} />
    </View>
  </View>
}

const useThemeValues = createThemeStyles(colors => ({ styles: StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.canvas },
  content: { flexGrow: 1, padding: space[4], gap: space[3], alignItems: 'stretch' },
  guide: { alignItems: 'center' },
  title: { ...text('h2'), color: colors.text.primary, textAlign: 'center' },
  body: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },
  fact: { alignItems: 'center', gap: space[3] },
  footer: { padding: space[4], gap: space[2] },
}) }))
