import { createThemeStyles } from '@worldquest/design'


import { useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import {
  Button,
  Card,
  ClaySurface,
  clayShadow,
  depth,
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
import { ClayMap } from '../../components/ClayMap.js'
import { AtlasCompanion } from '../../components/AtlasCompanion.js'
import { SceneEntrance } from '../../components/SceneEntrance.js'
import { TopBar } from '../../components/TopBar.js'
import { ScrollEdges, useScrollEdges } from '../../components/ScrollEdges.js'
import { DaylightIllustration } from '../../components/DaylightIllustration.js'
import { Flag } from '../../components/Flag.js'
import type { CountryRow } from './RegionScreen.js'
import { Icon } from '../../components/Icon.js'
import { ExploreAtlas } from '../atlas/ExploreAtlas.js'
import type { AtlasNames } from '../atlas/useAtlasNames.js'

export const REGIONS = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC', 'AN'] as const
export type RegionCode = (typeof REGIONS)[number]

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
  /**
   * The 3D atlas, when this build may show it (features/atlas/atlasAvailability.ts).
   * Present: search results precede the globe, and a result SELECTS its country on
   * the globe rather than leaving the screen — the card then opens the country page.
   * Absent: Explore is exactly what it was.
   */
  readonly atlas?: { readonly names: AtlasNames } | undefined
  /** The streak, for the flame chip in the top bar, and where tapping it goes. */
  readonly streak?: number | undefined
  readonly onOpenStreak?: (() => void) | undefined
}



const STACK_COLLECTIONS_BELOW = 360
const EMPTY_COUNTRIES: NonNullable<ExploreScreenProps['countries']> = []

type TileSize = { readonly width: number; readonly height: number }

const estimateTileWidth = (windowWidth: number) => (windowWidth - space[4] * 2) * 0.48

export function ExploreScreen({
  world,
  countries = EMPTY_COUNTRIES,
  onSelectCountry,
  loading,
  onSelectRegion,
  onOpenCollection,
  coins,
  streak,
  onOpenStreak,
  atlas,
}: ExploreScreenProps) {
  const { colors, styles } = useThemeValues()
  const t = useT()
  const [query, setQuery] = useState('')
  const [allResults, setAllResults] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [atlasRegion, setAtlasRegion] = useState<string | null>(null)
  const [globeGestureActive, setGlobeGestureActive] = useState(false)
  const scroll = useRef<ScrollView>(null)
  // Soft top and bottom edges, lighter while the page moves (`ScrollEdges`).
  const edges = useScrollEdges()
  const atlasTop = useRef(0)
  const revealSelection = useRef(false)
  const countryOpen = useRef<View>(null)
  const selectionFrame = useRef<number | undefined>(undefined)
  useEffect(() => () => { if (selectionFrame.current !== undefined) cancelAnimationFrame(selectionFrame.current) }, [])
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()
  const needle = normalize(query)
  const matches = useMemo(() => countries.filter(country => normalize(country.name).includes(needle) || (REGIONS.includes(country.region as RegionCode) && normalize(t(REGION_NAME[country.region as RegionCode])).includes(needle))), [countries, needle, t])
  // Locking the scroller must not create a new highlight scene and redraw the old
  // camera immediately before the first drag movement reaches the renderer.
  const atlasMatches = useMemo(() => needle.length > 0 ? matches.map(country => country.id) : [], [matches, needle])
  const selectCountry = (id: string | null) => {
    if (selectionFrame.current !== undefined) cancelAnimationFrame(selectionFrame.current)
    revealSelection.current = id !== null && (needle.length > 0 || selected === null)
    setSelected(id)
    if (id === null) return
    setQuery('')
    setAllResults(false)
    Keyboard.dismiss()
    if (atlasRegion !== null && countries.find(country => country.id === id)?.region !== atlasRegion) setAtlasRegion(null)
    // A search/list pick can be far below the map. Reveal it again after the query
    // collapses and the atlas reports its new position.
    scroll.current?.scrollTo({ y: atlasTop.current, animated: false })
    // The picked result unmounts. Hand its focus to the revealed action, only for
    // user selections; refreshed country data must not steal Close's focus.
    selectionFrame.current = requestAnimationFrame(() => {
      selectionFrame.current = undefined
      if (countryOpen.current === null) return
      if (Platform.OS === 'web') countryOpen.current.focus()
      else AccessibilityInfo.sendAccessibilityEvent(countryOpen.current, 'focus')
    })
  }

  // All seven tiles are the same size, so one measurement serves them all. Seeded from
  // the window rather than from zero, so the first frame already has its sky instead of
  // flashing seven navy rectangles and then filling them in.
  const { width: windowWidth, fontScale } = useWindowDimensions()

  const [tile, setTile] = useState({ width: estimateTileWidth(windowWidth), height: 0 })

  if (loading || world === null) return <ExploreSkeleton />

  const byRegion = new Map(world.regions.map((r) => [r.region, r]))

  return (
    <View style={styles.screen}>
    <ScrollView ref={scroll} {...edges.handlers} testID="explore-scroll" scrollEnabled={!globeGestureActive} style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <TopBar
        initials="EX"
        {...(coins !== undefined ? { coins } : {})}
        {...(onOpenStreak !== undefined && streak !== undefined ? { onStreak: onOpenStreak, streak } : {})}
      />

      <View style={styles.header}>
        <Text style={styles.title} role="heading">
          {t('explore:title')}
        </Text>
        {needle.length === 0 && selected === null && <AtlasCompanion compact message={t('explore:subtitle')} />}
      </View>

      <View style={styles.searchField}>
      <ClaySurface radius={radius.full} />
      <View style={styles.searchIcon}><Icon name="globe" size={space[5]} color={colors.text.secondary} /></View>
      <TextInput accessibilityLabel={t('explore:search.label')}
        placeholder={t('explore:search.label')} placeholderTextColor={colors.text.tertiary}
        value={query} onChangeText={value => { setQuery(value); setAllResults(false) }} autoCorrect={false} returnKeyType="search"
        style={styles.search} testID="explore-search" />
      {query.length > 0 && <Pressable role="button" aria-label={t('explore:search.reset')} onPress={() => setQuery('')} style={styles.searchClear}>
        <Icon name="close" size={18} color={colors.text.secondary} />
      </Pressable>}
      </View>
      {needle.length > 0 && <View style={styles.searchResults}>
        <Text style={styles.subtitle} accessibilityLiveRegion="polite">{t('explore:search.count', { count: matches.length })}</Text>
        {matches.length === 0 && <>
          <AtlasCompanion compact mood="thinking" message={t('explore:search.empty')} />
          <Button variant="secondary" label={t('explore:search.clear')} onPress={() => setQuery('')} />
        </>}
        {(allResults ? matches : matches.slice(0, 6)).map(country => <Pressable key={country.id} role="button" aria-label={country.name}
          onPress={() => (atlas !== undefined ? selectCountry(country.id) : onSelectCountry?.(country.id))}
          style={({ pressed }) => [styles.searchRow, pressed && styles.searchPressed]}>
          <ClaySurface radius={radius.lg} />
          {country.flagPath && <Flag path={country.flagPath} width={32} label="" />}
          <View style={styles.headerText}>
            <Text style={styles.collectionName}>{country.name}</Text>
            <Text style={styles.resultMeta}>{t(`explore:mastery.${country.progress.mastery}`)}</Text>
          </View>
          <Icon name="chevron" size={18} />
        </Pressable>)}
        {matches.length > 6 && <Pressable role="button" aria-expanded={allResults} onPress={() => setAllResults(!allResults)} style={styles.moreResults}>
          <Text style={styles.moreLabel}>{allResults ? t('explore:search.fewer') : t('explore:search.more', { count: matches.length })}</Text>
        </Pressable>}
      </View>}
      {atlas !== undefined && (
        <ExploreAtlas
          onGestureActiveChange={setGlobeGestureActive}
          countries={countries}
          names={atlas.names}
          selected={selected}
          onSelect={selectCountry}
          openRef={countryOpen}
          showBrowse={needle.length === 0}
          onLayout={event => {
            atlasTop.current = event.nativeEvent.layout.y
            if (revealSelection.current) {
              scroll.current?.scrollTo({ y: atlasTop.current, animated: false })
              revealSelection.current = false
            }
          }}
          region={atlasRegion}
          onRegion={(region) => {
            setAtlasRegion(region)
            // A selection outside the new filter would be a card for a country the
            // globe is no longer showing.
            if (region !== null && selected !== null && countries.find((c) => c.id === selected)?.region !== region) selectCountry(null)
          }}
          matches={atlasMatches}
          onOpenCountry={(id) => onSelectCountry?.(id)}
        />
      )}
      {needle.length === 0 && (atlas === undefined || selected === null) && <>
      <SceneEntrance>
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
      </SceneEntrance>


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
    <ScrollEdges moving={edges.moving} />
    </View>
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
        style={({ pressed }) => [
          styles.tile,
          { borderColor: colors.border.subtle, backgroundColor: colors.bg.surface },
          // The measured maximum, applied as a floor. `styles.tile` carries the seed for
          // the frame before anything has reported.
          minHeight > 0 && { minHeight },
          empty && styles.tileEmpty,
          !empty && styles.tileInteractive,
          pressed && !empty && styles.tilePressed,
        ]}
      >
        <ClaySurface radius={radius.lg} />
        <View style={styles.tileShape} pointerEvents="none" aria-hidden>
          <ClayMap name={`region-${region}`} style={{ width: '100%', height: 116 }} cover />
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
  searchField: { ...clayShadow(colors), flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.clay.ice.rim, borderRadius: radius.full, backgroundColor: colors.bg.surface },
  searchIcon: { paddingStart: space[4] },
  search: { position: 'relative', flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: space[3], ...text('body'), color: colors.text.primary },
  searchClear: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  searchResults: { gap: space[1] },
  searchRow: { minHeight: 56, padding: space[3], flexDirection: 'row', alignItems: 'center', gap: space[3], borderBottomWidth: 1, borderColor: colors.border.subtle, backgroundColor: colors.bg.surface, borderRadius: radius.md },
  searchPressed: { backgroundColor: colors.bg.surfacePressed },
  resultMeta: { ...text('caption'), color: colors.text.secondary },
  moreResults: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space[3] },
  moreLabel: { ...text('bodyStrong'), color: colors.action.secondary },
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
  header: { gap: space[2] },
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
  tileInteractive: { borderBottomWidth: depth.button },
  tilePressed: { transform: [{ translateY: depth.chip }], backgroundColor: colors.bg.surfacePressed },
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
