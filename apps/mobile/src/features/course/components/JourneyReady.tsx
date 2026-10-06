import { createThemeStyles } from '@worldquest/design'
import { Animated, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Button, Card, layout, radius, space, staggerStyle, text, useStagger } from '@worldquest/design'
import { AdventureArt } from '../../../components/AdventureArt.js'
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
  const compact = useWindowDimensions().height < 700
  const reveal = useStagger(2, 'expressive')
  const unit = path.status === 'ready' ? path.units.find(u => u.nodes.some(n => n.state === 'current')) : undefined
  const next = unit?.nodes.find(n => n.state === 'current')
  return <View style={styles.root} testID="journey-ready">
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
    <View style={styles.art}>
      <AdventureArt name="explorer" mood="welcome" style={{ width: compact ? 88 : 128, height: compact ? 96 : 140 }} />
    </View>
    <Text role="heading" style={styles.title}>{t(path.status === 'ready' && path.complete ? 'lesson:journey.complete' : 'lesson:journey.title')}</Text>
    {path.status === 'ready' && next !== undefined && unit !== undefined && <>
      {!compact && <Text style={styles.body}>{t('lesson:journey.body')}</Text>}
      <Animated.View style={staggerStyle(reveal)}>
        <Card style={styles.card}>
          <Text style={styles.unit}>{t('home:path.unit', { number: unit.number })} · {tContent(unit.titleKey)}</Text>
          {!compact && <View style={styles.platform}>
            <PathNode node={next} total={path.total} column={80} swing={0} expanded={false} onPress={() => onStart(next.id)} compact />
          </View>}
          <Text style={styles.objective}>{tContent(next.objectiveKey, { count: next.count })}</Text>
          <Text style={styles.body}>{t('home:path.lesson', { lesson: next.finished + 1, lessons: next.lessons })}</Text>
        </Card>
      </Animated.View>
    </>}
    {path.status === 'ready' && path.complete && <Card style={styles.card}>
      <Text style={styles.body}>{t('home:path.complete.body')}</Text>
    </Card>}
    {path.status === 'error' && <Text style={styles.body}>{t('home:path.error.body')}</Text>}
    </ScrollView>
    <View style={styles.actions}>
      {next && <Button variant="discovery" label={t('lesson:journey.start')} onPress={() => onStart(next.id)} testID="journey-start" />}
      {path.status === 'ready' && path.complete && <Button variant="discovery" label={t('home:path.review')} onPress={() => onReview(path.courseId)} />}
      <Button variant="ghost" label={t('lesson:journey.home')} onPress={onHome} />
    </View>
  </View>
}


const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' },
  scroll: { flex: 1, minHeight: 0 },
  screen: { flexGrow: 1, padding: space[4], gap: space[3] },
  actions: { padding: space[4], gap: space[2], backgroundColor: colors.bg.canvas },
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
