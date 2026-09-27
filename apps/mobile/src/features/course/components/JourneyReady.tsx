import { createThemeStyles } from '@worldquest/design'
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Button, Card, radius, space, staggerStyle, text, useStagger } from '@worldquest/design'
import { AdventureArt } from '../../../components/AdventureArt.js'
import { AnswerReward } from '../../../components/AnswerReward.js'
import { useT, tContent } from '../../../lib/i18n.js'
import type { CoursePathView } from '../pathView.js'
import { PathNode } from './PathNode.js'

/** Reads the current saved standing; never manufactures the next node or awards XP. */
export function JourneyReady({ path, onStart, onReview, onHome }: {
  path: CoursePathView
  onStart: (id: string) => void
  onReview: (id: string) => void
  onHome: () => void
}) {
  const { styles } = useThemeValues()
  const t = useT()
  const reveal = useStagger(2, 'expressive')
  const unit = path.status === 'ready' ? path.units.find(u => u.nodes.some(n => n.state === 'current')) : undefined
  const next = unit?.nodes.find(n => n.state === 'current')
  return <ScrollView contentContainerStyle={styles.screen} testID="journey-ready">
    <View style={styles.art}>
      <AdventureArt name="explorer" mood="welcome" style={{ width: 144, height: 160 }} />
    </View>
    <Text role="heading" style={styles.title}>{t(path.status === 'ready' && path.complete ? 'lesson:journey.complete' : 'lesson:journey.title')}</Text>
    {path.status === 'ready' && next !== undefined && unit !== undefined && <>
      <Text style={styles.body}>{t('lesson:journey.body')}</Text>
      <Animated.View style={staggerStyle(reveal)}>
        <Card style={styles.card}>
          <Text style={styles.unit}>{t('home:path.unit', { number: unit.number })} · {tContent(unit.titleKey)}</Text>
          <View style={styles.platform}>
            <PathNode node={next} total={path.total} column={80} swing={0} expanded={false} onPress={() => onStart(next.id)} compact />
          </View>
          <Text style={styles.objective}>{tContent(next.objectiveKey, { count: next.count })}</Text>
          <Text style={styles.body}>{t('home:path.lesson', { lesson: next.finished + 1, lessons: next.lessons })}</Text>
          <AnswerReward />
          <Button variant="discovery" label={t('lesson:journey.start')} onPress={() => onStart(next.id)} testID="journey-start" />
        </Card>
      </Animated.View>
    </>}
    {path.status === 'ready' && path.complete && <Card style={styles.card}>
      <Text style={styles.body}>{t('home:path.complete.body')}</Text>
      <Button variant="discovery" label={t('home:path.review')} onPress={() => onReview(path.courseId)} />
    </Card>}
    {path.status === 'error' && <Text style={styles.body}>{t('home:path.error.body')}</Text>}
    <Button variant="ghost" label={t('lesson:journey.home')} onPress={onHome} />
  </ScrollView>
}


const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: space[4], gap: space[3], justifyContent: 'center' },
  art: { alignItems: 'center' },
  title: { ...text('h1'), color: colors.text.primary, textAlign: 'center' },
  body: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },
  card: { backgroundColor: colors.journey.sky, borderRadius: radius.xl, gap: space[3] },
  unit: { ...text('overline'), color: colors.text.secondary, textAlign: 'center' },
  platform: { alignItems: 'center', minHeight: 110 },
  objective: { ...text('h2'), color: colors.text.primary, textAlign: 'center' },
})
  return { colors, styles }
})
