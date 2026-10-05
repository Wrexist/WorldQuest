import { useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Button, Card, createThemeStyles, space, text } from '@worldquest/design'
import type { Question } from '@worldquest/engines'
import { CountryMap } from '../../components/CountryMap.js'
import { Flag } from '../../components/Flag.js'
import { WorldMascot } from '../../components/WorldMascot.js'
import { SceneEntrance } from '../../components/SceneEntrance.js'
import { tContent, useT } from '../../lib/i18n.js'

/** Only associations from the exact issued/composed lesson; no parallel quiz data. */
export function LessonIntroduction({ questions, onBegin }: {
  questions: readonly Question[]; onBegin: () => void
}) {
  const { styles } = useStyles()
  const t = useT()
  const [page, setPage] = useState(0)
  const scroll = useRef<ScrollView>(null)
  const seen = new Set<string>()
  const associations = questions.filter(question => {
    if (seen.has(question.item.factId)) return false
    seen.add(question.item.factId)
    return true
  })
  const index = Math.min(page, Math.max(0, associations.length - 1))
  const question = associations[index]
  const answer = question?.options.find(option => option.isCorrect)
  const flag = question?.promptAsset ?? answer?.asset ?? question?.revealAsset
  const move = (offset: number) => {
    setPage(Math.max(0, Math.min(associations.length - 1, index + offset)))
    scroll.current?.scrollTo({ y: 0, animated: false })
  }
  // The lesson route owns safe areas for every state, including optional study.
  return <View style={styles.screen} testID="lesson-introduction">
    <ScrollView ref={scroll} contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <WorldMascot mood="encouraging" style={{ width: 80, height: 88 }} />
        <View style={styles.words}>
          <Text style={styles.title} role="heading">{t('lesson:intro.title')}</Text>
          <Text style={styles.body}>{t('lesson:intro.count', { count: questions.length })}</Text>
        </View>
      </View>
      {question && <SceneEntrance replayKey={question.item.factId}>
        <Card style={styles.card} testID="study-card">
          <Text style={styles.position} accessibilityLiveRegion="polite">{t('lesson:intro.position', { current: index + 1, total: associations.length })}</Text>
          <Text style={styles.prompt}>{tContent(question.promptKey, question.promptParams)}</Text>
          {question.locator && <CountryMap path={question.locator.path} contextPath={question.locator.contextPath} width={192} label={tContent(question.promptKey, question.promptParams)} />}
          {flag?.startsWith('flags/') && <Flag path={flag} width={96} label={answer?.label ?? ''} />}
          <Text style={styles.answer}>{answer?.label}</Text>
        </Card>
      </SceneEntrance>}
    </ScrollView>
    <View style={styles.footer}>
      {associations.length > 1 && <View style={styles.navigation}>
        <Button variant="ghost" size="sm" style={styles.navigationButton} label={t('lesson:intro.previous')} disabled={index === 0} onPress={() => move(-1)} />
        <Button variant="secondary" size="sm" style={styles.navigationButton} label={t('lesson:intro.next')} disabled={index === associations.length - 1} onPress={() => move(1)} />
      </View>}
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
  card: { gap: space[4], alignItems: 'center' },
  position: { ...text('caption'), color: colors.text.secondary },
  navigation: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  navigationButton: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto', width: undefined },
  prompt: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },
  answer: { ...text('h2'), color: colors.text.primary, textAlign: 'center' },
  footer: { padding: space[4], gap: space[2], flexShrink: 0 },
}) }))
