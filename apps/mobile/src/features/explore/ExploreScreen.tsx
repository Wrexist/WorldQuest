/**
 * Explore — mockup screen 9, the continents grid.
 *
 * The screen that answers "how much of the world do I actually know?". It is built
 * entirely from `worldProgress()` in the engines, which means the numbers here and
 * the numbers the scheduler acts on can never disagree — there is only one of them.
 *
 * Every continent is shown, including ones with no content yet. A grid that hides
 * Africa until we have written Africa reads as a smaller world, and a user who never
 * sees the gap never knows there is more coming.
 *
 * The mockup's globe is deliberately not here: it needs map geometry, which is an
 * unresolved licensing decision (docs/plan/phase-0-checklist.md). Colour and type
 * carry the continents until then, and neither is a placeholder.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  Card,
  ProgressBar,
  Skeleton,
  colors,
  palette,
  radius,
  space,
  text,
} from '@worldquest/design'
import type { WorldProgress } from '@worldquest/engines'
import { useT, type TranslationKey } from '../../lib/i18n.js'

/**
 * Every continent, in the order the grid shows them — most-populated first rather
 * than alphabetically, because a user opening this screen wants somewhere to start
 * and Antarctica is not it.
 */
export const REGIONS = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC', 'AN'] as const
export type RegionCode = (typeof REGIONS)[number]

const REGION_NAME: Record<RegionCode, TranslationKey> = {
  EU: 'explore:region.EU',
  AS: 'explore:region.AS',
  AF: 'explore:region.AF',
  NA: 'explore:region.NA',
  SA: 'explore:region.SA',
  OC: 'explore:region.OC',
  AN: 'explore:region.AN',
}

export type ExploreScreenProps = {
  readonly world: WorldProgress | null
  readonly loading: boolean
  readonly onSelectRegion: (region: RegionCode) => void
}

export function ExploreScreen({ world, loading, onSelectRegion }: ExploreScreenProps) {
  const t = useT()

  if (loading || world === null) return <ExploreSkeleton />

  const byRegion = new Map(world.regions.map((r) => [r.region, r]))
  const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title} role="heading">
          {t('explore:title')}
        </Text>
        <Text style={styles.subtitle}>{t('explore:subtitle')}</Text>
      </View>

      <Card style={styles.worldCard} accessibilityLabel={t('explore:world.label')}>
        <ProgressBar
          current={world.factsLearned}
          total={Math.max(1, world.factsTotal)}
          label={t('explore:world.label')}
        />
        <Text style={styles.worldCount}>
          {t('explore:world.countries', {
            complete: world.entitiesComplete,
            total: world.entitiesTotal,
          })}
        </Text>
      </Card>

      <View style={styles.grid}>
        {REGIONS.map((region) => {
          const progress = byRegion.get(region)
          const tint = palette.continent[region]
          const empty = progress === undefined || progress.factsTotal === 0

          return (
            <Pressable
              key={region}
              role="button"
              aria-label={t('explore:region.label', {
                region: t(REGION_NAME[region]),
                percent: percent(progress?.fraction ?? 0),
              })}
              aria-disabled={empty}
              disabled={empty}
              onPress={() => onSelectRegion(region)}
              // A continent with no content yet is dimmed rather than hidden. Hiding
              // it would read as a smaller world; dimming says "not yet".
              style={[styles.tile, { borderColor: tint }, empty && styles.tileEmpty]}
            >
              <View style={[styles.swatch, { backgroundColor: tint }]} />
              <Text style={styles.regionName}>{t(REGION_NAME[region])}</Text>

              {empty ? (
                <Text style={styles.regionMeta}>{t('explore:region.empty')}</Text>
              ) : (
                <>
                  <Text style={styles.regionMeta}>
                    {t('explore:region.progress', {
                      learned: progress.factsLearned,
                      total: progress.factsTotal,
                    })}
                  </Text>
                  <ProgressBar
                    current={progress.factsLearned}
                    total={Math.max(1, progress.factsTotal)}
                    showCount={false}
                    // Reward tone where there is something to review — the same gold
                    // the streak uses, so "come back to this" reads consistently.
                    tone={progress.factsDue > 0 ? 'reward' : 'progress'}
                  />
                  <Text style={styles.regionDue}>
                    {t('explore:region.due', { count: progress.factsDue })}
                  </Text>
                </>
              )}
            </Pressable>
          )
        })}
      </View>
    </ScrollView>
  )
}

function ExploreSkeleton() {
  const t = useT()
  return (
    <View style={styles.screen} aria-label={t('common:loading')}>
      <View style={styles.content}>
        <Skeleton width="45%" height={30} />
        <Skeleton height={88} borderRadius={radius.lg} />
        <View style={styles.grid}>
          {REGIONS.map((region) => (
            <Skeleton key={region} height={132} borderRadius={radius.lg} style={styles.tile} />
          ))}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.canvas },
  content: { padding: space[4], gap: space[4] },
  header: { gap: space[1] },
  title: { ...text('h1'), color: colors.text.primary },
  subtitle: { ...text('body'), color: colors.text.secondary },

  worldCard: { gap: space[2] },
  worldCount: { ...text('caption'), color: colors.text.secondary },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  tile: {
    // Two per row at phone width, with the grid's gap between them. `48%` rather
    // than a computed pixel width so it survives 200 % text and a tablet.
    width: '48%',
    minHeight: 132,
    gap: space[2],
    padding: space[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.bg.surface,
  },
  tileEmpty: { opacity: 0.45 },
  swatch: { width: 28, height: 6, borderRadius: radius.full },
  regionName: { ...text('h3'), color: colors.text.primary },
  regionMeta: { ...text('caption'), color: colors.text.secondary },
  regionDue: { ...text('caption'), color: colors.text.tertiary },
})
