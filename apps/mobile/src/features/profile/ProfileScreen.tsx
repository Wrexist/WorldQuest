/**
 * Profile — mockup screen 13.
 *
 * The screen that answers "what have I actually done?". Every number on it is real:
 * XP, coins and streaks come from the server (authoritative), and the per-continent
 * bars come from the progression engine over the user's local memory.
 *
 * The mockup shows `12,850 / 15,000 XP` on this screen. Those numbers do not
 * correspond to any coherent curve, so this uses the real one (`50·n^1.9`) and shows
 * the actual distance to the next level — recorded in mockup-fidelity.md.
 *
 * Presentational: data comes in, actions go out. The illustrated avatar is not
 * commissioned yet, so `Avatar` falls back to initials — which is not a placeholder,
 * it is the accessible default the component was built around.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  Avatar,
  Button,
  Card,
  ProgressBar,
  Skeleton,
  colors,
  palette,
  radius,
  space,
  text,
} from '@worldquest/design'
import { levelProgress, type WorldProgress } from '@worldquest/engines'
import { formatCompact, useT, currentLocale, type TranslationKey } from '../../lib/i18n.js'
import { REGIONS, type RegionCode } from '../explore/ExploreScreen.js'
import { Icon } from '../../components/Icon.js'

const REGION_NAME: Record<RegionCode, TranslationKey> = {
  EU: 'explore:region.EU',
  AS: 'explore:region.AS',
  AF: 'explore:region.AF',
  NA: 'explore:region.NA',
  SA: 'explore:region.SA',
  OC: 'explore:region.OC',
  AN: 'explore:region.AN',
}

export type ProfileStats = {
  readonly xpTotal: number
  readonly coins: number
  readonly streak: number
  readonly longestStreak: number
  readonly factsMastered: number
}

/**
 * Lessons completed per day, oldest first, always seven entries.
 *
 * Seven fixed slots rather than "days with activity": a week with two active days
 * should read as two bars among five empty ones, not as a full-looking chart of two.
 */
export type WeekActivity = readonly { readonly day: string; readonly count: number }[]

export type ProfileScreenProps = {
  readonly stats: ProfileStats | null
  /** Absent while it is still loading; an all-zero week is a real, renderable answer. */
  readonly week?: WeekActivity | undefined
  readonly world: WorldProgress | null
  readonly loading: boolean
  /** Absent once the user has an account — the prompt disappears with the reason. */
  readonly onCreateAccount?: (() => void) | undefined
  /**
   * The title actually being worn — a bought one, or the level's own.
   *
   * Resolved by the route through `equippedTitleKey`, so this screen never has to
   * know that a stale local row can name something no longer owned. Absent means
   * nothing is equipped and the level title stands, which is also the answer for
   * every user who has never opened the shop.
   */
  readonly wornTitleKey?: string | undefined
  /** Opens the shop. Absent hides the row rather than showing a dead control. */
  readonly onOpenShop?: (() => void) | undefined
}

export function ProfileScreen({
  stats,
  week,
  world,
  loading,
  onCreateAccount,
  wornTitleKey,
  onOpenShop,
}: ProfileScreenProps) {
  const t = useT()
  const locale = currentLocale()

  if (loading) return <ProfileSkeleton />

  if (stats === null || stats.xpTotal === 0) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Avatar initials="EX" size={72} accessibilityLabel={t('profile:anonymous')} />
        <Text style={styles.title} role="heading">
          {t('profile:empty.title')}
        </Text>
        <Text style={styles.subtitle}>{t('profile:empty.body')}</Text>
      </View>
    )
  }

  // One call, in the engine, tested there. The curve is exponential, so "progress to
  // the next level" is the position INSIDE the band — computing it in a component is
  // how a bar ends up disagreeing with the number printed beside it.
  const progress = levelProgress(stats.xpTotal)

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.identity}>
        <Avatar initials="EX" size={72} accessibilityLabel={t('profile:anonymous')} />
        <Text style={styles.name} role="heading">
          {t('profile:anonymous')}
        </Text>
      </View>

      <Card style={styles.levelCard}>
        {/* The title is the reward here, not the number. Levels are a ladder; a title
            is something a user says out loud, and it is the cheapest status reward
            that exists (xp-economy.md). */}
        <Text style={styles.levelTitle}>
          {t('profile:levelTitle', {
            level: progress.level,
            // The worn title when there is one, the earned one otherwise. The level
            // number stays either way: a bought title is a different hat, not a
            // shortcut up the ladder.
            title: t((wornTitleKey ?? progress.titleKey) as TranslationKey),
          })}
        </Text>
        <ProgressBar
          current={progress.earnedInLevel}
          total={Math.max(1, progress.levelSpan)}
          showCount={false}
          label={t('profile:level', { level: progress.level })}
        />
        <Text style={styles.levelNext}>
          {progress.remaining === null
            ? t('profile:level.max')
            : t('profile:level.next', {
                remaining: progress.remaining,
                level: progress.level + 1,
              })}
        </Text>
      </Card>

      {week !== undefined && <WeeklyActivity week={week} />}

      <Section title={t('profile:stats.title')}>
        <View style={styles.statGrid}>
          <Stat label={t('profile:stats.xp')} value={formatCompact(stats.xpTotal, locale)} />
          <Stat label={t('profile:stats.coins')} value={formatCompact(stats.coins, locale)} />
          <Stat label={t('profile:stats.streak')} value={String(stats.streak)} />
          <Stat label={t('profile:stats.longest')} value={String(stats.longestStreak)} />
          <Stat label={t('profile:stats.mastered')} value={String(stats.factsMastered)} />
          <Stat
            label={t('profile:stats.countries')}
            value={String(world?.entitiesComplete ?? 0)}
          />
        </View>
      </Section>

      {world !== null && (
        <Section title={t('profile:world.title')}>
          <Card style={styles.worldCard}>
            <Text style={styles.subtitle}>
              {t('profile:world.summary', {
                learned: world.factsLearned,
                total: world.factsTotal,
              })}
            </Text>
            {REGIONS.map((region) => {
              const progress = world.regions.find((r) => r.region === region)
              // Continents with no content yet are omitted here rather than dimmed:
              // Explore is the map of what exists, Profile is the record of what the
              // user has done, and an empty bar is not a record of anything.
              if (progress === undefined || progress.factsTotal === 0) return null
              return (
                <View key={region} style={styles.regionRow}>
                  <View style={[styles.swatch, { backgroundColor: palette.continent[region] }]} />
                  <View style={styles.regionBar}>
                    <ProgressBar
                      current={progress.factsLearned}
                      total={Math.max(1, progress.factsTotal)}
                      label={t(REGION_NAME[region])}
                    />
                  </View>
                </View>
              )
            })}
          </Card>
        </Section>
      )}

      {onOpenShop !== undefined && (
        // Right under the title it changes, and nowhere else. A shop entry on Home
        // would put a purchase in front of somebody who opened the app to learn.
        <Card level={1} onPress={onOpenShop} role="button" accessibilityLabel={t('profile:shop.cta')} style={styles.shopRow}>
          <Icon name="shop" size={20} color={colors.reward.coin} />
          <Text style={styles.shopLabel}>{t('profile:shop.cta')}</Text>
          <View style={styles.spacer} />
          <Icon name="chevron" size={18} color={colors.text.tertiary} />
        </Card>
      )}

      {onCreateAccount !== undefined && (
        <Card style={styles.accountCard}>
          <Text style={styles.cardTitle}>{t('profile:account.title')}</Text>
          {/* States what an account is FOR. "Sign up to continue" is the version that
              treats the user's progress as leverage; this one treats it as theirs. */}
          <Text style={styles.subtitle}>{t('profile:account.body')}</Text>
          <Button label={t('profile:account.cta')} onPress={onCreateAccount} />
        </Card>
      )}
    </ScrollView>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} role="heading">
        {title}
      </Text>
      {children}
    </View>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    // One element: a reader says "Total XP, 12.9K" rather than two disconnected nodes.
    <View accessible aria-label={`${label}, ${value}`} style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function ProfileSkeleton() {
  const t = useT()
  return (
    <View style={styles.screen} aria-label={t('common:loading')}>
      <View style={styles.content}>
        <Skeleton width={72} height={72} borderRadius={36} />
        <Skeleton width="40%" height={28} />
        <Skeleton height={88} borderRadius={radius.lg} />
        <Skeleton height={160} borderRadius={radius.lg} />
      </View>
    </View>
  )
}

/**
 * Seven bars, one per day.
 *
 * Heights are relative to the user's own best day, not to a fixed target. A chart
 * scaled to a goal makes a five-lesson day look like a failure next to a ten-lesson
 * one; scaled to the week, it shows the shape of the week, which is the only thing
 * seven bars can honestly say.
 */
function WeeklyActivity({ week }: { readonly week: WeekActivity }) {
  const t = useT()
  const peak = Math.max(...week.map((d) => d.count))

  return (
    <Section title={t('profile:week.title')}>
      {peak === 0 ? (
        <Text style={styles.weekEmpty}>{t('profile:week.none')}</Text>
      ) : (
        <View style={styles.week}>
          {week.map((day) => (
            <View
              key={day.day}
              accessible
              accessibilityLabel={t('profile:week.day', { day: day.day, count: day.count })}
              style={styles.weekDay}
            >
              <View style={styles.weekTrack}>
                <View
                  style={[
                    styles.weekBar,
                    // A day with activity always shows something. A 1-lesson day next
                    // to a 12-lesson one would otherwise round to an invisible sliver,
                    // which reads as "you did nothing" — the opposite of the truth.
                    { height: `${day.count === 0 ? 0 : Math.max(12, (day.count / peak) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.weekLabel}>{day.day}</Text>
            </View>
          ))}
        </View>
      )}
    </Section>
  )
}

const styles = StyleSheet.create({
  levelTitle: { ...text('h3'), color: colors.text.primary, marginBottom: space[2] },
  week: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2], height: 96 },
  weekDay: { flex: 1, alignItems: 'center', gap: space[1] },
  weekTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  weekBar: { width: '100%', borderRadius: radius.sm, backgroundColor: colors.status.progress },
  weekLabel: { ...text('overline'), color: colors.text.tertiary },
  weekEmpty: { ...text('body'), color: colors.text.secondary },
  screen: { flex: 1, backgroundColor: colors.bg.canvas },
  content: { padding: space[4], gap: space[4] },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space[5], gap: space[3] },

  identity: { alignItems: 'center', gap: space[2] },
  name: { ...text('h1'), color: colors.text.primary },
  title: { ...text('h2'), color: colors.text.primary, textAlign: 'center' },
  subtitle: { ...text('caption'), color: colors.text.secondary },

  levelCard: { gap: space[2] },
  levelNext: { ...text('caption'), color: colors.text.secondary },

  section: { gap: space[2] },
  sectionTitle: { ...text('overline'), color: colors.text.tertiary },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  stat: {
    // Three per row at phone width, with the grid's gap between them.
    width: '31%',
    gap: space[1],
    padding: space[3],
    borderRadius: radius.lg,
    backgroundColor: colors.bg.surface,
  },
  statValue: { ...text('numeric'), color: colors.text.primary },
  statLabel: { ...text('caption'), color: colors.text.secondary },

  worldCard: { gap: space[3] },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  swatch: { width: 6, height: 28, borderRadius: radius.full },
  regionBar: { flex: 1 },

  shopRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  shopLabel: { ...text('bodyStrong'), color: colors.text.primary },
  spacer: { flex: 1 },
  accountCard: { gap: space[3] },
  cardTitle: { ...text('h3'), color: colors.text.primary },
})
