import { createThemeStyles } from '@worldquest/design'


import { useState } from 'react'
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import {
  Card,
  palette,
  ProgressBar,
  radius,
  Skeleton,
  space,
  squircle,
  staggerStyle,
  Tally,
  text,
  useStagger,
} from '@worldquest/design'
import type { WorldProgress } from '@worldquest/engines'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import { AdventureArt } from '../../components/AdventureArt.js'
import { TopBar } from '../../components/TopBar.js'
import { DaylightIllustration } from '../../components/DaylightIllustration.js'
import type { ArtName } from '../../lib/art.generated.js'
import { Flag } from '../../components/Flag.js'
import type { CountryRow } from './RegionScreen.js'
import { Icon } from '../../components/Icon.js'

export const REGIONS = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC', 'AN'] as const
export type RegionCode = (typeof REGIONS)[number]
const DESTINATION = { EU: 'europe', AS: 'asia', AF: 'africa', NA: 'north-america', SA: 'south-america', OC: 'oceania', AN: 'antarctica' } as const

export const CONTINENT_ART: Record<RegionCode, ArtName> = {
  EU: 'continents/EU',
  AS: 'continents/AS',
  AF: 'continents/AF',
  NA: 'continents/NA',
  SA: 'continents/SA',
  OC: 'continents/OC',
  AN: 'continents/AN',
}


export const CONTINENT_SILHOUETTE: Partial<Record<RegionCode, ArtName>> = {
  EU: 'continents-silhouette/EU',
  AS: 'continents-silhouette/AS',
  AF: 'continents-silhouette/AF',
  NA: 'continents-silhouette/NA',
  SA: 'continents-silhouette/SA',
  OC: 'continents-silhouette/OC',
}

export const continentArtSize = (width: number, height: number) => Math.ceil(Math.max(width, height * 1.5))

export const REGION_NAME: Record<RegionCode, TranslationKey> = {
  EU: 'explore:region.EU',
  AS: 'explore:region.AS',
  AF: 'explore:region.AF',
  NA: 'explore:region.NA',
  SA: 'explore:region.SA',
  OC: 'explore:region.OC',
  AN: 'explore:region.AN',
}

export type ExploreScreenProps = {
  readonly countries?: readonly (CountryRow & { region: string })[]
  readonly onSelectCountry?: (id: string) => void
  readonly world: WorldProgress | null

  readonly onOpenCollection?: ((kind: 'flags' | 'countries') => void) | undefined
  readonly loading: boolean
  readonly onSelectRegion: (region: RegionCode) => void

  readonly coins?: number | undefined
  /** The streak, for the flame chip in the top bar, and where tapping it goes. */
  readonly streak?: number | undefined
  readonly onOpenStreak?: (() => void) | undefined
}



const STACK_COLLECTIONS_BELOW = 360

type TileSize = { readonly width: number; readonly height: number }

const estimateTileWidth = (windowWidth: number) => (windowWidth - space[4] * 2) * 0.48

export function ExploreScreen({
  world,
  countries = [],
  onSelectCountry,
  loading,
  onSelectRegion,
  onOpenCollection,
  coins,
  streak,
  onOpenStreak,
}: ExploreScreenProps) {
  const { colors, styles } = useThemeValues()
  const t = useT()
  const [query, setQuery] = useState('')
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()
  const needle = normalize(query)
  const matches = countries.filter(country => normalize(country.name).includes(needle) || (REGIONS.includes(country.region as RegionCode) && normalize(t(REGION_NAME[country.region as RegionCode])).includes(needle)))

  // All seven tiles are the same size, so one measurement serves them all. Seeded from
  // the window rather than from zero, so the first frame already has its sky instead of
  // flashing seven navy rectangles and then filling them in.
  const { width: windowWidth, fontScale } = useWindowDimensions()

  const [tile, setTile] = useState({ width: estimateTileWidth(windowWidth), height: 0 })

  if (loading || world === null) return <ExploreSkeleton />

  const byRegion = new Map(world.regions.map((r) => [r.region, r]))

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TopBar
        initials="EX"
        {...(coins !== undefined ? { coins } : {})}
        {...(onOpenStreak !== undefined && streak !== undefined ? { onStreak: onOpenStreak, streak } : {})}
      />

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} role="heading">
            {t('explore:title')}
          </Text>
          <Text style={styles.subtitle}>{t('explore:subtitle')}</Text>
        </View>


      </View>

      <TextInput accessibilityLabel={t('explore:search.label')}
        placeholder={t('explore:search.label')} placeholderTextColor={colors.text.tertiary}
        value={query} onChangeText={setQuery} autoCorrect={false} returnKeyType="search"
        style={styles.search} testID="explore-search" />
      {needle.length > 0 && <View style={styles.searchResults}>
        <Text style={styles.subtitle} accessibilityLiveRegion="polite">{t('explore:search.count', { count: matches.length })}</Text>
        {matches.length === 0 && <Text style={styles.subtitle}>{t('explore:search.empty')}</Text>}
        {matches.map(country => <Card key={country.id} onPress={() => onSelectCountry?.(country.id)} style={styles.searchRow}>
          {country.flagPath && <Flag path={country.flagPath} width={36} label="" />}
          <View style={styles.headerText}>
            <Text style={styles.collectionName}>{country.name}</Text>
            <Text style={styles.subtitle}>{t(`explore:mastery.${country.progress.mastery}`)}</Text>
          </View>
          <Icon name="chevron" size={18} />
        </Card>)}
      </View>}
      {needle.length === 0 && <>
      <Card style={styles.worldCard} accessibilityLabel={t('explore:world.label')}>

        <DaylightIllustration name="discovery-island" size={windowWidth < 360 || fontScale > 1.3 ? 80 : 112} active={false} />
        <View style={styles.worldStats}>
          <Text style={styles.worldTitle}>{t('explore:world.label')}</Text>

          <ProgressBar
            current={world.factsLearned}
            total={Math.max(1, world.factsTotal)}
            showCount={false}
            showPercent
            label={t('explore:region.facts', {
              learned: world.factsLearned,
              total: world.factsTotal,
            })}
          />
          <ProgressBar
            current={world.entitiesComplete}
            total={Math.max(1, world.entitiesTotal)}
            showCount={false}
            label={t('explore:world.countries', {
              complete: world.entitiesComplete,
              total: world.entitiesTotal,
            })}
          />
        </View>
      </Card>


      <View style={styles.grid}>
        {REGIONS.map((region, index) => (
          <ContinentTile
            key={region}
            region={region}
            index={index}
            progress={byRegion.get(region)}
            art={continentArtSize(tile.width, tile.height)}
            minHeight={tile.height}
            onSelect={onSelectRegion}
            onMeasure={setTile}
          />
        ))}
      </View>
      {onOpenCollection !== undefined && (
        <View
          style={[
            styles.collections,
            windowWidth < STACK_COLLECTIONS_BELOW && styles.collectionsStacked,
          ]}
        >
          <Card
            level={2}
            role="button"
            accessibilityLabel={t('collection:flags.title')}
            onPress={() => onOpenCollection('flags')}
            style={[styles.collection, { backgroundColor: colors.journey.sky }]}
          >
            <DaylightIllustration name="passport" size={40} active={false} />
            <View style={styles.collectionText}>
              <Text style={styles.collectionName}>{t('collection:flags.title')}</Text>
              <Text style={styles.collectionHint} numberOfLines={2}>
                {t('collection:flags.subtitle')}
              </Text>
            </View>

            <Icon name="chevron" size={14} color={colors.text.tertiary} />
          </Card>
          <Card
            level={2}
            role="button"
            accessibilityLabel={t('collection:countries.title')}
            onPress={() => onOpenCollection('countries')}
            style={[styles.collection, { backgroundColor: colors.journey.lavender }]}
          >
            <DaylightIllustration name="compass" size={40} active={false} />
            <View style={styles.collectionText}>

              <Text style={styles.collectionName}>{t('collection:countries.title')}</Text>
              <Text style={styles.collectionHint} numberOfLines={2}>
                {t('collection:countries.subtitle')}
              </Text>
            </View>
            <Icon name="chevron" size={14} color={colors.text.tertiary} />
          </Card>
        </View>
      )}

      </>}
    </ScrollView>
  )
}

function ContinentTile({
  region,
  index,
  progress,
  minHeight,
  onSelect,
  onMeasure,
}: {
  readonly region: RegionCode
  readonly index: number
  readonly progress: WorldProgress['regions'][number] | undefined
  readonly art: number

  readonly minHeight: number
  readonly onSelect: (region: RegionCode) => void
  readonly onMeasure: (next: (current: TileSize) => TileSize) => void
}) {
  const { colors, styles } = useThemeValues()
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
          // Width from whoever reported last; height only ever upward. A card already
          // held at the maximum reports exactly the maximum, so this settles rather than
          // creeping — and a card that genuinely needs more (a longer translation, 200 %
          // text) raises it for the other five.
          onMeasure((current) =>
            Math.abs(current.width - width) < 1 && height <= current.height + 1
              ? current
              : { width, height: Math.max(current.height, height) },
          )
        }}
        // A continent with no content yet is dimmed rather than hidden. Hiding it would
        // read as a smaller world; dimming says "not yet".
        style={[
          styles.tile,
          { borderColor: colors.border.subtle, backgroundColor: colors.bg.surface },
          // The measured maximum, applied as a floor. `styles.tile` carries the seed for
          // the frame before anything has reported.
          minHeight > 0 && { minHeight },
          empty && styles.tileEmpty,
        ]}
      >

        <View style={styles.tileShape} pointerEvents="none" aria-hidden>
          <AdventureArt name={DESTINATION[region]} style={{ width: '100%', height: 116 }} />
        </View>

        <Text style={styles.regionName}>{t(REGION_NAME[region])}</Text>

        {empty ? (
          <Text style={styles.regionMeta}>{t('explore:region.empty')}</Text>
        ) : (
          <>

            <Tally style={styles.regionMeta} numberStyle={styles.regionMetaNumber}>
              {t('explore:region.progress', {
                learned: progress.factsLearned,
                total: progress.factsTotal,
              })}
            </Tally>

            <View style={styles.regionDueRow}>
              <Icon name="pin" size={14} color={tint} />
              <Tally style={styles.regionDue} numberStyle={styles.regionMetaNumber}>

              {progress.factsLearned === 0
                ? t('explore:region.size', { count: progress.entitiesTotal })
                : t('explore:region.due', { count: progress.factsDue })}
            </Tally>
            </View>
          </>
        )}
      </Pressable>
    </Animated.View>
  )
}

function ExploreSkeleton() {
  const { styles } = useThemeValues()
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



const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  search: { minHeight: 48, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: radius.lg, backgroundColor: colors.bg.surface, paddingHorizontal: space[4], ...text('body'), color: colors.text.primary },
  searchResults: { gap: space[3] },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  collections: { flexDirection: 'row', gap: space[3], marginBottom: space[1] },
  // One per line on a narrow phone. Each card keeps `flex: 1`, which in a column means
  // it takes the full width rather than a half of it — and a full-width row is the shape
  // the icon/text/chevron arrangement was designed for anyway.
  collectionsStacked: { flexDirection: 'column' },
  // A ROW, not a centred stack. The icon leads, the words explain, the chevron points
  // out — which is the shape of every navigation row iOS has ever drawn, and it fits a
  // subtitle without growing the tile.
  collection: {
    flex: 1,
    backgroundColor: colors.bg.surfaceRaised,
    paddingVertical: space[3],
    paddingHorizontal: space[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  collectionText: { flex: 1, gap: space[0] },
  // Up a step from `caption`: it is a destination's name now, with its own line of
  // explanation under it, rather than a label under an icon.
  collectionName: { ...text('bodyStrong'), color: colors.text.primary },
  collectionHint: { ...text('caption'), color: colors.text.tertiary },
  screen: { flex: 1 },
  content: { padding: space[4], gap: space[4], paddingBottom: space[6] },
  // A row now, with the mascot on the end. `space[1]` still separates the two lines of
  // text, which is why the gap moved inward rather than staying here.
  header: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  headerText: { flex: 1, gap: space[1] },
  title: { ...text('h1'), color: colors.text.primary },
  subtitle: { ...text('body'), color: colors.text.secondary },

  // A row now: globe, then the column of counts. `alignItems: 'center'` so the globe
  // sits against the middle of the stats rather than the top of the card.
  worldCard: { padding: space[3], backgroundColor: colors.journey.sky, borderColor: colors.border.subtle, flexDirection: 'row', alignItems: 'center', gap: space[3] },
  worldStats: { flex: 1, gap: space[2] },
  worldTitle: { ...text('h3'), color: colors.text.primary },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  // Clipped, so the oversized background stops at the card edge, and positioned so
  // the swatch, name and progress stack on top of it.
  // `end`, not `right`: the text column is the leading half and it mirrors in RTL, so a
  // shape pinned to a physical edge would sit on the copy in Arabic.

  // `space[1]` is the icon↔label step — the one place the 4pt rung is for.
  regionDueRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  tileShape: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.journey.sky,
    marginTop: -space[3], marginHorizontal: -space[3], marginBottom: space[1],
  },
  // The cell owns the grid width; the tile fills the cell. Split when the tiles gained a
  // staggered entrance — the transform has to sit on a wrapper, because animating the
  // Pressable itself would fight `press3d` for the same transform property.
  // Flexible halves reserve room for the gap even on a 320pt phone.
  tileCell: { flexBasis: '45%', flexGrow: 1, minWidth: 0 },
  tile: {
    width: '100%',
    gap: space[2],
    padding: space[3],

    minHeight: 148,
    borderRadius: radius.lg,
    ...squircle,
    borderWidth: 1,
    borderBottomWidth: 1,
    // Clips the oversized continent background to the card.
    overflow: 'hidden',
    backgroundColor: colors.bg.surface,
  },
  tileEmpty: { opacity: 0.7 },
  regionName: { ...text('h3'), color: colors.text.primary },
  regionMeta: { ...text('caption'), color: colors.text.secondary },
  // Same size, brighter and heavier. `numeric` for tabular figures so a column of
  // tiles does not jitter between "0 of 56" and "12 of 56".
  regionMetaNumber: {
    ...text('caption', { weight: '700', numeric: true }),
    color: colors.text.primary,
  },
  // `secondary`, not `tertiary`. The contrast matrix records tertiary as large-text
  // only — it clears 3:1 and not 4.5:1 — and this is a 13pt caption. It was wrong on a
  // plain surface before it was ever put over a picture; the artwork only made it
  // visible.

  regionDue: { ...text('caption'), color: colors.text.secondary, flex: 1 },
})
  return { colors, styles }
})
