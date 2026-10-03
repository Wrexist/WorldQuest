import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Button, Card, createThemeStyles, space, text } from '@worldquest/design'
import type { Question } from '@worldquest/engines'
import { CountryMap } from '../../components/CountryMap.js'
import { Flag } from '../../components/Flag.js'
import { WorldMascot } from '../../components/WorldMascot.js'
import { tContent, useT } from '../../lib/i18n.js'

/** Only associations from the exact issued/composed lesson; no parallel quiz data. */
export function LessonIntroduction({ questions, onBegin }: {
  questions: readonly Question[]; onBegin: () => void
}) {
  const { styles } = useStyles()
  const t = useT()
  const seen = new Set<string>()
  const associations = questions.filter(question => {
    if (seen.has(question.item.factId)) return false
    seen.add(question.item.factId)
    return true
  })
  // The lesson route owns safe areas for every state, including optional study.
  return <View style={styles.screen} testID="lesson-introduction">
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <WorldMascot mood="encouraging" style={{ width: 80, height: 88 }} />
        <View style={styles.words}>
          <Text style={styles.title} role="heading">{t('lesson:intro.title')}</Text>
          <Text style={styles.body}>{t('lesson:intro.count', { count: questions.length })}</Text>
        </View>
      </View>
      <Text style={styles.body}>{t('lesson:intro.body')}</Text>
      {associations.map(question => {
        const answer = question.options.find(option => option.isCorrect)
        const flag = question.promptAsset ?? answer?.asset ?? question.revealAsset
        return <Card key={question.item.factId} style={styles.card}>
          <Text style={styles.prompt}>{tContent(question.promptKey, question.promptParams)}</Text>
          {question.locator && <CountryMap path={question.locator.path} contextPath={question.locator.contextPath} width={132} label={tContent(question.promptKey, question.promptParams)} />}
          {flag?.startsWith('flags/') && <Flag path={flag} width={96} label={answer?.label ?? ''} />}
          <Text style={styles.answer}>{answer?.label}</Text>
        </Card>
      })}
    </ScrollView>
    <View style={styles.footer}>
      <Button label={t('lesson:intro.begin')} onPress={onBegin} testID="lesson-begin" />
    </View>
  </View>
}

const useStyles = createThemeStyles(colors => ({ styles: StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.canvas },
  content: { padding: space[4], gap: space[3] },
  heading: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  words: { flex: 1, gap: space[2] },
  title: { ...text('h2'), color: colors.text.primary },
  body: { ...text('body'), color: colors.text.secondary },
  card: { gap: space[2], alignItems: 'flex-start' },
  prompt: { ...text('body'), color: colors.text.secondary },
  answer: { ...text('h3'), color: colors.text.primary },
  footer: { padding: space[4], gap: space[2], borderTopWidth: 1, borderColor: colors.border.subtle },
}) }))
