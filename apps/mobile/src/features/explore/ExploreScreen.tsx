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

import { useState } from 'react'
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import {
  ArtScrim,
  Card,
  ProgressBar,
  Skeleton,
  colors,
  palette,
  radius,
  space,
  staggerStyle,
  text,
  useStagger,
} from '@worldquest/design'
import type { WorldProgress } from '@worldquest/engines'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import { Art } from '../../components/Art.js'
import type { ArtName } from '../../lib/art.generated.js'
import { Icon } from '../../components/Icon.js'

/**
 * Every continent, in the order the grid shows them — most-populated first rather
 * than alphabetically, because a user opening this screen wants somewhere to start
 * and Antarctica is not it.
 */
export const REGIONS = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC', 'AN'] as const
export type RegionCode = (typeof REGIONS)[number]

/**
 * The atmospheric background behind each continent card.
 *
 * Keyed by region code so the map cannot drift from `REGIONS` — a continent added to
 * that list without art here is a type error rather than a blank tile.
 */
export const CONTINENT_ART: Record<RegionCode, ArtName> = {
  EU: 'continents/EU',
  AS: 'continents/AS',
  AF: 'continents/AF',
  NA: 'continents/NA',
  SA: 'continents/SA',
  OC: 'continents/OC',
  AN: 'continents/AN',
}

/**
 * Drawn larger than the tile it fills, and MEASURED from the tile rather than fixed.
 *
 * These are 3:2 and the tile is roughly square, so sizing the art to the tile's width
 * would leave bands above and below. Over-sizing lets the middle of the sky fill the
 * card and the card's own `overflow: hidden` crops the rest.
 *
 * It was a constant 260 until a tablet shot showed why that cannot work: at 768 the
 * tiles are ~355 wide, so the sky stopped 95 points short of the right edge and each
 * card had a navy stripe down its side. 200 % text has the same effect on the other
 * axis — a taller tile outgrows a fixed square just as a wider one does.
 *
 * `Art` draws a 3:2 image `size` wide and `size / 1.5` tall, so covering a `w × h` tile
 * needs `size ≥ w` and `size ≥ 1.5 h`, whichever binds.
 */
export const continentArtSize = (width: number, height: number) => Math.ceil(Math.max(width, height * 1.5))

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
  /**
   * Opens a collection. Optional so the screenshot renderer and the component tests
   * can mount Explore without a router — the same reason every other callback here is.
   */
  readonly onOpenCollection?: ((kind: 'flags' | 'countries') => void) | undefined
  readonly loading: boolean
  readonly onSelectRegion: (region: RegionCode) => void
}

/**
 * Atlas beside the Explore heading.
 *
 * 84, against the 132 he gets on Home's quest card. That card is the one primary action
 * and he is half its subject; this is a heading he stands next to, and a mascot that
 * out-weighs the title of the screen he is decorating has stopped decorating it.
 */
const HEADER_ART = 84

type TileSize = { readonly width: number; readonly height: number }

/** `width: '48%'` of the grid, which is the screen inside its own padding. */
const estimateTileWidth = (windowWidth: number) => (windowWidth - space[4] * 2) * 0.48

export function ExploreScreen({ world, loading, onSelectRegion, onOpenCollection }: ExploreScreenProps) {
  const t = useT()

  // All seven tiles are the same size, so one measurement serves them all. Seeded from
  // the window rather than from zero, so the first frame already has its sky instead of
  // flashing seven navy rectangles and then filling them in.
  const { width: windowWidth } = useWindowDimensions()
  const [tile, setTile] = useState({ width: estimateTileWidth(windowWidth), height: 0 })

  if (loading || world === null) return <ExploreSkeleton />

  const byRegion = new Map(world.regions.map((r) => [r.region, r]))

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Atlas at screen level, beside the title.
   
          The reference puts its mascot in the Explore header holding a magnifying
          glass, and that placement answers a note `HomeScreen` has carried for a while:
          the character appeared on onboarding, welcome-back, five empty states, an
          error, a pause and an out-of-hearts card — every one of them a moment where
          something is missing or has gone wrong — which taught the user that seeing him
          is bad news. He now stands in two ordinary screens as well.
   
          `thinking` rather than `celebrate`: this is the browse tab, and the pose the
          brief calls "curious, not confused" is what a screen about where to go next
          wants. Decorative — the heading and its subtitle already say what the screen
          is, and a reader announcing a robot before them is length without meaning. */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} role="heading">
            {t('explore:title')}
          </Text>
          <Text style={styles.subtitle}>{t('explore:subtitle')}</Text>
        </View>
        <Art name="atlas/thinking" size={HEADER_ART} />
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

      {/* Collections sit ABOVE the continent grid deliberately. The grid is
          navigation — where do I go next — while these two answer "what do I have",
          which is the question that brings someone back on day nine. */}
      {onOpenCollection !== undefined && (
        <View style={styles.collections}>
          <Card
            level={2}
            role="button"
            accessibilityLabel={t('collection:flags.title')}
            onPress={() => onOpenCollection('flags')}
            style={styles.collection}
          >
            <Icon name="flag" size={26} color={colors.action.primary} />
            <Text style={styles.collectionName}>{t('collection:flags.title')}</Text>
          </Card>
          <Card
            level={2}
            role="button"
            accessibilityLabel={t('collection:countries.title')}
            onPress={() => onOpenCollection('countries')}
            style={styles.collection}
          >
            <Icon name="explore" size={26} color={colors.action.primary} />
            <Text style={styles.collectionName}>{t('collection:countries.title')}</Text>
          </Card>
        </View>
      )}

      <View style={styles.grid}>
        {REGIONS.map((region, index) => (
          <ContinentTile
            key={region}
            region={region}
            index={index}
            progress={byRegion.get(region)}
            art={continentArtSize(tile.width, tile.height)}
            onSelect={onSelectRegion}
            onMeasure={setTile}
          />
        ))}
      </View>
    </ScrollView>
  )
}

/**
 * One continent, as its own component so it can hold a hook.
 *
 * It was inline in the grid's `.map` until the tiles needed a staggered entrance, and a
 * hook cannot be called from a loop body. Extracting it is the fix React asks for rather
 * than a workaround: seven tiles is seven components, and the one that animates is the
 * one that knows its own index.
 */
function ContinentTile({
  region,
  index,
  progress,
  art,
  onSelect,
  onMeasure,
}: {
  readonly region: RegionCode
  readonly index: number
  readonly progress: WorldProgress['regions'][number] | undefined
  readonly art: number
  readonly onSelect: (region: RegionCode) => void
  readonly onMeasure: (next: (current: TileSize) => TileSize) => void
}) {
  const t = useT()
  const entrance = useStagger(index)
  const tint = palette.continent[region]
  const empty = progress === undefined || progress.factsTotal === 0
  const percent = `${Math.round((progress?.fraction ?? 0) * 100)}%`

  return (
    <Animated.View style={[styles.tileCell, staggerStyle(entrance)]}>
      <Pressable
        role="button"
        aria-label={t('explore:region.label', { region: t(REGION_NAME[region]), percent })}
        aria-disabled={empty}
        disabled={empty}
        onPress={() => onSelect(region)}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout
          // Guarded, because setting state from a layout that the state itself feeds is
          // how a render loop starts. Sub-point changes are noise.
          onMeasure((current) =>
            Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1
              ? current
              : { width, height },
          )
        }}
        // A continent with no content yet is dimmed rather than hidden. Hiding it would
        // read as a smaller world; dimming says "not yet".
        style={[styles.tile, { borderColor: tint }, empty && styles.tileEmpty]}
      >
        {/* The continent's own sky, behind its card.
            This screen is the second tab of a geography app and had no picture on it at
            all — seven navy rectangles told apart by a 4pt coloured bar. The art is
            briefed per continent in asset-prompts.md §8 as atmosphere only: no landmass,
            no coastline, no borders, because a generated coastline is a wrong fact and a
            generated border is a political claim. Real Natural Earth geometry composites
            on top of this later.

            Decorative — the tile already announces the continent and its progress
            through `aria-label`, and a screen reader naming the weather over Asia is
            noise. */}
        <View style={styles.tileArt} pointerEvents="none">
          <Art name={CONTINENT_ART[region]} size={art} frame="bleed" />
          {/* A scrim, and it is not decoration. Four of these skies are bright —
              Africa's gold, South America's yellow-green, Oceania's turquoise — and text
              over them was unreadable, which is a WCAG AA failure the contrast gate
              cannot catch because it checks token PAIRS and this is text over a picture.

              It was a flat wash at 0.55 and that was measured, on the rendered tiles, as
              not enough: 1.5:1 on Oceania against a 4.5:1 floor. Raising the flat wash
              far enough for the worst sky would have flattened all seven back to navy.
              `ArtScrim` weights it downward instead, towards the small text, and leaves
              the top of the sky alone. */}
          <ArtScrim />
        </View>
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
              // Reward tone where there is something to review — the same gold the streak
              // uses, so "come back to this" reads consistently.
              tone={progress.factsDue > 0 ? 'reward' : 'progress'}
            />
            <Text style={styles.regionDue}>
              {/* Zero due means "nothing is waiting for you", which is only true once
                  something has been learned. On a continent at 0 of 56 the same branch
                  rendered "Up to date" — an invitation turned into a claim that the user
                  had finished it. */}
              {progress.factsLearned === 0
                ? t('explore:region.notStarted')
                : t('explore:region.due', { count: progress.factsDue })}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
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
  collections: { flexDirection: 'row', gap: space[2], paddingHorizontal: space[4], marginBottom: space[3] },
  collection: { flex: 1, padding: space[3], alignItems: 'center', gap: space[1] },
  collectionGlyph: { ...text('h1'), color: colors.text.primary },
  collectionName: { ...text('caption', { weight: '700' }), color: colors.text.secondary },
  screen: { flex: 1 },
  content: { padding: space[4], gap: space[4] },
  // A row now, with the mascot on the end. `space[1]` still separates the two lines of
  // text, which is why the gap moved inward rather than staying here.
  header: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  headerText: { flex: 1, gap: space[1] },
  title: { ...text('h1'), color: colors.text.primary },
  subtitle: { ...text('body'), color: colors.text.secondary },

  worldCard: { gap: space[2] },
  worldCount: { ...text('caption'), color: colors.text.secondary },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  // Clipped, so the oversized background stops at the card edge, and positioned so
  // the swatch, name and progress stack on top of it.
  tileArt: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  // The cell owns the grid width; the tile fills the cell. Split when the tiles gained a
  // staggered entrance — the transform has to sit on a wrapper, because animating the
  // Pressable itself would fight `press3d` for the same transform property.
  tileCell: { width: '48%' },
  tile: {
    width: '100%',
    minHeight: 132,
    gap: space[2],
    padding: space[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    // Clips the oversized continent background to the card.
    overflow: 'hidden',
    backgroundColor: colors.bg.surface,
  },
  tileEmpty: { opacity: 0.45 },
  swatch: { width: 28, height: 6, borderRadius: radius.full },
  regionName: { ...text('h3'), color: colors.text.primary },
  regionMeta: { ...text('caption'), color: colors.text.secondary },
  // `secondary`, not `tertiary`. The contrast matrix records tertiary as large-text
  // only — it clears 3:1 and not 4.5:1 — and this is a 13pt caption. It was wrong on a
  // plain surface before it was ever put over a picture; the artwork only made it
  // visible.
  regionDue: { ...text('caption'), color: colors.text.secondary },
})
