/**
 * Home — mockup screen 3, in its Phase 1 form.
 *
 * Step 8 of the walking skeleton: "an ugly Home screen showing real progress".
 * The numbers here come from the same ledger the server writes, so when the loop
 * closes it closes on real data rather than a placeholder.
 *
 * One primary action (the green button). Progress is always visible. Design lands
 * in weeks 3–6.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  Button,
  Card,
  ProgressBar,
  Skeleton,
  StatChip,
  colors,
  radius,
  space,
  typography,
} from '@worldquest/design'
import { levelForXp, xpForLevel } from '@worldquest/engines'
import { t } from '../../lib/i18n.js'

export type HomeProgress = {
  readonly xpTotal: number
  readonly coins: number
  readonly streak: number
  readonly factsMastered: number
  readonly factsTotal: number
}

export type HomeScreenProps = {
  readonly progress: HomeProgress | null
  readonly loading: boolean
  readonly isOffline: boolean
  readonly onStartLesson: () => void
}

/** Time-aware greeting. The key is localised; the branch is not a string choice. */
function greetingKey(hour: number): string {
  if (hour < 12) return 'home:greeting.morning'
  if (hour < 18) return 'home:greeting.afternoon'
  return 'home:greeting.evening'
}

export function HomeScreen({ progress, loading, isOffline, onStartLesson }: HomeScreenProps) {
  if (loading) return <HomeSkeleton />

  const level = progress ? levelForXp(progress.xpTotal) : 1
  const levelFloor = xpForLevel(level)
  const levelCeiling = xpForLevel(level + 1)

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {isOffline && (
        <View style={styles.offline} accessibilityRole="alert">
          <Text style={styles.offlineText}>{t('common:offline.banner')}</Text>
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.greeting} accessibilityRole="header">
          {t(greetingKey(new Date().getHours()))}
        </Text>
        {progress && progress.streak > 0 && (
          <StatChip
            kind="streak"
            value={progress.streak}
            accessibilityLabel={t('home:streak.days', { count: progress.streak })}
          />
        )}
      </View>

      {/* The one primary action. */}
      <Card level={2} style={styles.questCard}>
        <Text style={styles.cardLabel}>{t('home:quest.today')}</Text>
        {progress && progress.factsMastered > 0 ? (
          <ProgressBar
            current={progress.factsMastered}
            total={progress.factsTotal}
            label={t('home:progress.mastered')}
          />
        ) : (
          <Text style={styles.cardBody}>{t('home:quest.empty')}</Text>
        )}
        <Button label={t('common:continue')} onPress={onStartLesson} />
      </Card>

      {progress && (
        <Card style={styles.statsCard} accessibilityLabel={t('home:stats.label')}>
          <ProgressBar
            current={progress.xpTotal - levelFloor}
            total={Math.max(1, levelCeiling - levelFloor)}
            label={t('home:level', { level })}
          />
          <View style={styles.chips}>
            <StatChip
              kind="xp"
              value={progress.xpTotal}
              accessibilityLabel={t('home:stats.xp', { amount: progress.xpTotal })}
            />
            <StatChip
              kind="coin"
              value={progress.coins}
              accessibilityLabel={t('home:stats.coins', { amount: progress.coins })}
            />
          </View>
        </Card>
      )}
    </ScrollView>
  )
}

function HomeSkeleton() {
  return (
    <View style={[styles.screen, styles.content]} accessibilityLabel={t('common:loading')}>
      <Skeleton width="60%" height={28} />
      <Skeleton height={140} borderRadius={radius.lg} />
      <Skeleton height={100} borderRadius={radius.lg} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.canvas },
  content: { padding: space[4], gap: space[4] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: {
    flex: 1,
    fontFamily: typography.fontFamily.display,
    fontSize: typography.scale.h1.size,
    lineHeight: typography.scale.h1.lineHeight,
    fontWeight: '700',
    color: colors.text.primary,
  },
  questCard: { gap: space[3] },
  statsCard: { gap: space[3] },
  cardLabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.scale.caption.size,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  cardBody: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.scale.body.size,
    color: colors.text.primary,
  },
  chips: { flexDirection: 'row', gap: space[2] },
  offline: {
    backgroundColor: colors.bg.surfaceRaised,
    padding: space[3],
    borderRadius: radius.md,
  },
  offlineText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.scale.caption.size,
    color: colors.text.secondary,
    textAlign: 'center',
  },
})
