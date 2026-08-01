/**
 * Home — mockup screen 3.
 *
 * Laid out to match the mockup: avatar and notification bell, a two-tier greeting
 * with the streak stacked to its right, the quest card with art bleeding to the
 * edge, the daily challenge, and a Friends/League pair.
 *
 * The tab bar is NOT here — `app/(tabs)/_layout.tsx` owns it. A screen that draws its
 * own chrome cannot be reused inside a navigator without drawing it twice.
 *
 * Three deliberate deviations from the mockup, each recorded in
 * docs/design/mockup-fidelity.md — none of them is an oversight.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  ArtSlot,
  Avatar,
  Button,
  Card,
  ProgressBar,
  Skeleton,
  StatChip,
  StreakBadge,
  colors,
  palette,
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
  readonly questTitle?: string
  readonly questDone?: number
  readonly questTotal?: number
  readonly challengeIn?: string
  readonly friendsOnline?: number
  readonly leagueTier?: string
  readonly leaguePercentile?: string
}

export type HomeScreenProps = {
  readonly progress: HomeProgress | null
  readonly loading: boolean
  readonly isOffline: boolean
  readonly onStartLesson: () => void
}

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
  const isNewUser = !progress || progress.xpTotal === 0

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {isOffline && (
          <View style={styles.offline} accessibilityRole="alert">
            <Text style={styles.offlineText}>{t('common:offline.banner')}</Text>
          </View>
        )}

        <View style={styles.topRow}>
          <Avatar initials="EX" accessibilityLabel={t('home:avatar.label')} />
          <View style={styles.spacer} />
          <View style={styles.bell} accessible accessibilityLabel={t('home:inbox.label')}>
            <Text style={styles.bellGlyph}>◉</Text>
          </View>
        </View>

        {/* Two-tier greeting: light salutation, bold role. Matches the mockup and
            keeps the header to two lines instead of three. */}
        <View style={styles.greetingRow}>
          <View style={styles.greetingText}>
            <Text style={styles.salutation}>{t(greetingKey(new Date().getHours()))}</Text>
            <Text style={styles.explorer} accessibilityRole="header">
              {t('home:greeting.role')}
            </Text>
          </View>
          {progress && progress.streak > 0 && (
            <StreakBadge
              days={progress.streak}
              label={t('home:streak.label')}
              accessibilityLabel={t('home:streak.days', { count: progress.streak })}
            />
          )}
        </View>

        {/* Today's Quest — the one primary action. */}
        <Card level={2} style={styles.questCard}>
          <View style={styles.questBody}>
            <View style={styles.questText}>
              <Text style={styles.cardLabel}>{t('home:quest.today')}</Text>
              <Text style={styles.questTitle}>
                {progress?.questTitle ?? t('home:quest.empty')}
              </Text>
            </View>
            <ArtSlot tint={palette.continent.EU} glyph="🗺" width={92} height={92} />
          </View>

          {!isNewUser && (
            <ProgressBar
              current={progress?.questDone ?? 0}
              total={progress?.questTotal ?? 10}
              tone="reward"
              label={t('home:quest.progress')}
            />
          )}

          <Button label={t('common:continue')} onPress={onStartLesson} />
        </Card>

        {/* Daily Challenge. */}
        <Card style={styles.challengeCard}>
          <View style={styles.challengeText}>
            <Text style={styles.cardTitle}>{t('home:challenge.title')}</Text>
            <Text style={styles.cardLabel}>{t('home:challenge.next')}</Text>
            <Text style={styles.countdown}>{progress?.challengeIn ?? '—'}</Text>
          </View>
          <ArtSlot tint={palette.gold['500']} glyph="🏆" width={72} height={72} />
        </Card>

        {/* Friends / League pair. */}
        <View style={styles.twoUp}>
          <Card style={styles.tile} accessibilityLabel={t('home:friends.label')}>
            <Text style={styles.cardTitle}>{t('home:friends.title')}</Text>
            <Text style={styles.cardLabel}>
              {t('home:friends.online', { count: progress?.friendsOnline ?? 0 })}
            </Text>
          </Card>
          <Card style={styles.tile} accessibilityLabel={t('home:league.label')}>
            <Text style={styles.cardTitle}>{t('home:league.title')}</Text>
            <Text style={styles.leagueTier}>{progress?.leagueTier ?? '—'}</Text>
            <Text style={styles.cardLabel}>{progress?.leaguePercentile ?? ''}</Text>
          </Card>
        </View>

        {/* Level bar, which the mockup carries on Profile rather than Home. */}
        {progress && !isNewUser && (
          <Card style={styles.levelCard} accessibilityLabel={t('home:stats.label')}>
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
    </View>
  )
}

function HomeSkeleton() {
  return (
    <View style={styles.screen} accessibilityLabel={t('common:loading')}>
      <View style={styles.content}>
        <Skeleton width={40} height={40} borderRadius={20} />
        <Skeleton width="55%" height={26} />
        <Skeleton height={190} borderRadius={radius.lg} />
        <Skeleton height={92} borderRadius={radius.lg} />
        <View style={styles.twoUp}>
          <Skeleton height={80} borderRadius={radius.lg} style={styles.flex} />
          <Skeleton height={80} borderRadius={radius.lg} style={styles.flex} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.canvas },
  content: { padding: space[4], gap: space[3], paddingBottom: space[5] },
  flex: { flex: 1 },

  topRow: { flexDirection: 'row', alignItems: 'center' },
  spacer: { flex: 1 },
  bell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellGlyph: { fontSize: 15, color: colors.text.secondary },

  greetingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space[3] },
  greetingText: { flex: 1 },
  salutation: {
    fontFamily: typography.fontFamily.body,
    fontSize: 15,
    color: colors.text.secondary,
  },
  explorer: {
    fontFamily: typography.fontFamily.display,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    color: colors.text.primary,
  },

  questCard: { gap: space[3] },
  questBody: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  questText: { flex: 1, gap: space[1] },
  questTitle: {
    fontFamily: typography.fontFamily.display,
    fontSize: typography.scale.h2.size,
    fontWeight: '700',
    color: colors.text.primary,
  },

  challengeCard: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  challengeText: { flex: 1, gap: space[1] },
  countdown: {
    fontFamily: typography.fontFamily.numeric,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },

  twoUp: { flexDirection: 'row', gap: space[3] },
  tile: { flex: 1, gap: space[1] },
  leagueTier: {
    fontFamily: typography.fontFamily.display,
    fontSize: typography.scale.h3.size,
    fontWeight: '700',
    color: colors.reward.xp,
  },

  levelCard: { gap: space[3] },
  chips: { flexDirection: 'row', gap: space[2] },

  cardLabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.scale.caption.size,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  cardTitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.scale.h3.size,
    fontWeight: '600',
    color: colors.text.primary,
  },

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
