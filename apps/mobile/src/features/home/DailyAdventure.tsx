import { createThemeStyles } from '@worldquest/design'
/** One achievable daily target, and seven honest days of activity. */
import { StyleSheet, Text, View } from 'react-native'
import { Card, ProgressBar, radius, space, text } from '@worldquest/design'
import { useT } from '../../lib/i18n.js'
import { Icon } from '../../components/Icon.js'

import type { WeekActivity } from '../../components/WeekStrip.js'
import type { DailyGoal } from './useDailyGoal.js'

export type DailyAdventureProps = { goal: DailyGoal; week: WeekActivity; streak?: number | undefined; onPress?: (() => void) | undefined; compact?: boolean }
export function DailyAdventure({ goal, week, streak = 0, onPress, compact = false }: DailyAdventureProps) {
  const { colors, styles } = useThemeValues()
  const t = useT()
  const complete = goal.done >= goal.target
  const label = t('home:daily.count', { done: Math.min(goal.done, goal.target), target: goal.target })
  const days = week.filter(day => day.count > 0).length
  return <Card level={1} style={styles.card} testID="daily-adventure" {...(onPress !== undefined ? {
    onPress, role: 'button' as const, accessibilityLabel: t('home:daily.open', { done: Math.min(goal.done, goal.target), target: goal.target, days }),
  } : {})}>
    <View style={styles.top}>
      <Icon name={complete ? 'check' : 'quests'} size={22} color={colors.action.primary} />
      <Text style={styles.heading}>{t(complete ? 'home:daily.complete' : 'home:daily.title')}</Text>
      <Text style={styles.caption}>{label}</Text>
      <Icon name="chevron" size={space[4]} color={colors.text.secondary} />
    </View>
    {!compact && <ProgressBar current={Math.min(goal.done, goal.target)} total={goal.target} tone="progress" showCount={false} accessibilityLabel={t('home:daily.title')} valueText={label} />}
    {!compact && <View style={styles.week} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {streak > 0 && <View style={styles.streak}><Icon name="streak" size={space[4]} color={colors.status.streak} /><Text style={styles.caption}>{streak}</Text></View>}
      {week.map((day, i) => <View key={i} style={styles.day}>
        <Text style={styles.dayLabel}>{day.day}</Text>
        <View style={[styles.stamp, i === week.length - 1 && styles.stampToday, day.count > 0 && styles.stampDone]}>
          {day.count > 0 && <Icon name="check" size={space[3]} color={colors.text.onStatus} />}
        </View>
      </View>)}
    </View>}
  </Card>
}


const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  // The card's own clay with a gold rim. It was filled with `journey.sand`, which is a
  // pale cream by day and, like any dark yellow, a muddy brown by night (owner
  // screenshot, 2026-10-09). The rim keeps the warmth and the "today's reward" read.
  card: { borderColor: colors.league.gold.edge, gap: space[2], padding: space[3], flexShrink: 0 },
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  heading: { ...text('bodyStrong'), color: colors.text.primary, flexGrow: 1 },
  caption: { ...text('caption'), color: colors.text.secondary },
  week: { flexDirection: 'row', gap: space[1] },
  day: { flex: 1, flexDirection: 'row', gap: space[1], alignItems: 'center', justifyContent: 'center' },
  stamp: { width: space[4], height: space[4], borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.surfacePressed },
  stampToday: { borderWidth: 2, borderColor: colors.action.secondary },
  stampDone: { backgroundColor: colors.action.primary },
  dayLabel: { ...text('overline'), color: colors.text.secondary },
  streak: { flexDirection: 'row', alignItems: 'center', gap: space[1], marginEnd: space[2] },
})
  return { colors, styles }
})
