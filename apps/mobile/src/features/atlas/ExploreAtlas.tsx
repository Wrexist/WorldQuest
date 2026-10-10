/**
 * Explore's globe: the same atlas as the lessons, with a filter, a card and a list.
 *
 * Selection has three doors and one state: a tap on the globe, a search result, or a
 * row in the region list all set `selected`, and the globe, the card and the list all
 * read it — so they cannot disagree. The card shows only what the pack and the atlas
 * registry actually hold (flag, name, a verified capital) and leads to the existing
 * country page, which is where Learn and Review already live. No favourites, no
 * population, no decorations without data behind them.
 *
 * The list is the accessible way in: someone who cannot use the map by touch reaches
 * every country the map does, by name.
 */

import { useEffect, useMemo, useState, type Ref } from 'react'
import { I18nManager, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ViewProps } from 'react-native'
import { Button, ClaySurface, clayShadow, createThemeStyles, layout, radius, space, text, useTheme } from '@worldquest/design'
import { LinearGradient } from 'expo-linear-gradient'
import { ramp } from '../../components/ScrollEdges.js'
import { Flag } from '../../components/Flag.js'
import { ClayMap } from '../../components/ClayMap.js'
import { Icon } from '../../components/Icon.js'
import { SceneEntrance } from '../../components/SceneEntrance.js'
import { useT } from '../../lib/i18n.js'
import { WorldAtlasView } from './WorldAtlasView.js'
import { buildExploreScene } from './scene/exploreScene.js'
import { ATLAS_COUNTRIES, ATLAS_PLACES } from './data/atlas.generated.js'
import type { AtlasNames } from './useAtlasNames.js'

import { ATLAS_REGIONS, isAtlasRegion, REGION_KEY } from './regions.js'

export { ATLAS_REGIONS }

export type ExploreAtlasCountry = { readonly id: string; readonly name: string; readonly region: string; readonly flagPath?: string | undefined }

export type ExploreAtlasProps = {
  readonly countries: readonly ExploreAtlasCountry[]
  readonly names: AtlasNames
  readonly selected: string | null
  readonly onSelect: (id: string | null) => void
  readonly onGestureActiveChange?: ((active: boolean) => void) | undefined
  readonly region: string | null
  readonly onRegion: (region: string | null) => void
  /** Search matches, to highlight on the globe. Empty when there is no query. */
  readonly matches: readonly string[]
  /** Search results provide the same accessible selection while a query is active. */
  readonly showBrowse?: boolean
  readonly onLayout?: ViewProps['onLayout']
  readonly openRef?: Ref<View>
  /** The existing country page — Learn and Review live there. */
  readonly onOpenCountry: (id: string) => void
  /** Start a map drill over a region: find its countries by tapping them. */
  readonly onDrill?: ((region: string) => void) | undefined
}

export function ExploreAtlas({ countries, names, selected, onSelect, region, onRegion, matches, onOpenCountry, showBrowse = true, onLayout, openRef, onGestureActiveChange, onDrill }: ExploreAtlasProps) {
  const { styles, colors } = useThemeValues()
  const t = useT()
  const { width, height, fontScale } = useWindowDimensions()
  const largeText = fontScale >= 1.5
  const [browseExpanded, setBrowseExpanded] = useState(false)
  const [globeFailed, setGlobeFailed] = useState(false)
  useEffect(() => { if (!showBrowse) setBrowseExpanded(false) }, [showBrowse])
  const globeHeight = Math.round(Math.min(width * 0.95, height * 0.46, 420))

  const spec = useMemo(
    () => buildExploreScene({ selected, region, matches, ...names, t: t as never }),
    [selected, region, matches, names, t],
  )
  const country = selected === null ? undefined : countries.find((c) => c.id === selected)
  const place = selected === null ? undefined : Object.values(ATLAS_PLACES).find((p) => p.countryId === selected)
  const capital = place === undefined ? undefined : names.factValueName(place.factId)
  const regionCountries = useMemo(
    () => countries.filter((c) => (region === null || c.region === region) && ATLAS_COUNTRIES[c.id] !== undefined),
    [countries, region],
  )
  return (
    <View style={styles.column} testID="explore-atlas" onLayout={onLayout}>
      {/* The row runs off the screen's end, so it fades there rather than being chopped
          through a chip ("No" for North America): softer, and it says "there is more"
          (owner review, 2026-10-10: "no hard lines"). The padding at the end lets the last
          chip scroll clear of the fade. */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <RegionChip label={t('atlas:explore.all')} active={region === null} onPress={() => onRegion(null)} />
          {ATLAS_REGIONS.map((r) => (
            <RegionChip key={r} label={t(REGION_KEY[r])} active={region === r} onPress={() => onRegion(r)} />
          ))}
        </ScrollView>
        <ChipRowFade />
      </View>

      {globeFailed ? <View testID="explore-map-fallback">
        <ClayMap name={selected ?? (region ? `region-${region}` : 'world')} style={{ width: '100%', height: globeHeight }} />
      </View> : <WorldAtlasView
        spec={spec}
        onGestureActiveChange={onGestureActiveChange}
        onStatusChange={status => { if (status === 'error') setGlobeFailed(true) }}
        controls
        style={{ height: globeHeight }}
        testID="explore-globe"
        onEvent={(event) => {
          // Only events for the scene on screen: a tap that lands after the selection
          // has moved on must not select something else.
          if (event.sceneKey !== spec.sceneKey) return
          if (event.type === 'countrySelected') onSelect(event.countryId)
        }}
      />}

      {/* The map drill, offered where the region is on screen: "Europe" chosen, Europe
          shown, and one tap from being asked to find its countries on it. Hidden while a
          country card is open (one thing at a time) and on a globe that failed: the drill
          is played on it. */}
      {onDrill !== undefined && region !== null && isAtlasRegion(region) && country === undefined && !globeFailed && (
        <SceneEntrance replayKey={region} testID="explore-drill">
          <Button
            variant="adventure"
            label={t('atlas:drill.start', { region: t(REGION_KEY[region]) })}
            accessibilityHint={t('atlas:drill.hint')}
            onPress={() => onDrill(region)}
            testID="explore-drill-start"
          />
        </SceneEntrance>
      )}

      {country !== undefined && (
        <SceneEntrance replayKey={country.id} style={styles.card} testID="explore-atlas-card" accessibilityLiveRegion="polite">
          <ClaySurface radius={radius.lg} />
          <Pressable ref={openRef} role="button" aria-label={t('atlas:explore.open', { country: country.name })}
            accessibilityHint={capital === undefined ? undefined : t('atlas:fallback.capital', { capital })}
            onPress={() => onOpenCountry(country.id)} testID="explore-atlas-open"
            style={({ pressed }) => [styles.cardOpen, pressed && styles.pressed]}>
            <View style={[styles.cardBody, largeText && styles.cardBodyStacked]}>
              {country.flagPath !== undefined && <Flag path={country.flagPath} width={space[7]} />}
              <View style={styles.cardText}>
                <Text style={styles.cardTitle} role="heading">{country.name}</Text>
                {capital !== undefined && <Text style={styles.cardMeta}>{t('atlas:fallback.capital', { capital })}</Text>}
              </View>
            </View>
            <View style={styles.forward}><Icon name="chevron" size={20} color={colors.action.secondary} /></View>
          </Pressable>
          <Pressable role="button" aria-label={t('atlas:explore.close')} onPress={() => onSelect(null)}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Icon name="close" size={20} color={colors.text.secondary} />
          </Pressable>
        </SceneEntrance>
      )}

      {showBrowse && regionCountries.length > 0 && (
        <View style={styles.browse}>
          <ClaySurface radius={radius.lg} />
          <Pressable role="button" aria-expanded={browseExpanded} onPress={() => setBrowseExpanded(!browseExpanded)}
            style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]} testID="explore-atlas-browse">
            <Text style={styles.browseTitle}>{t('atlas:explore.browse', { count: regionCountries.length })}</Text>
            <View style={{ transform: [{ rotate: browseExpanded ? '270deg' : '90deg' }] }}>
              <Icon name="chevron" size={20} color={colors.text.secondary} />
            </View>
          </Pressable>
          {browseExpanded && <View style={styles.list} role="list" aria-label={t('atlas:explore.listLabel')}>
          {regionCountries.map((c) => (
            <Pressable
              key={c.id}
              role="button"
              aria-label={c.name}
              aria-selected={c.id === selected}
              onPress={() => { setBrowseExpanded(false); onSelect(c.id) }}
              style={({ pressed }) => [styles.listItem, (width < layout.baseWidth || largeText) && styles.listItemWide, c.id === selected && styles.listItemActive, pressed && styles.pressed]}
            >
              {c.flagPath !== undefined && <Flag path={c.flagPath} width={space[5]} />}
              <Text style={styles.listText}>{c.name}</Text>
              {c.id === selected && <Icon name="check" size={16} color={colors.action.secondary} />}
            </Pressable>
          ))}
          </View>}
        </View>
      )}
    </View>
  )
}

function RegionChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { styles } = useThemeValues()
  return (
    <Pressable role="button" aria-label={label} aria-selected={active} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <ClaySurface transparent={active} radius={radius.full} />
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  )
}

/** The chip row's soft end: clear to the canvas, toward the screen's end edge (left in RTL). */
function ChipRowFade() {
  const { colors } = useTheme()
  const { styles } = useThemeValues()
  const across = I18nManager.isRTL ? { start: { x: 1, y: 0.5 }, end: { x: 0, y: 0.5 } } : { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } }
  return <LinearGradient pointerEvents="none" aria-hidden {...ramp(colors.bg.canvas, 'bottom')} {...across} style={styles.chipFade} />
}

const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
    column: { gap: space[3] },
    chips: { gap: space[2], paddingVertical: space[1], paddingEnd: space[7] },
    chipFade: { position: 'absolute', top: 0, bottom: 0, end: 0, width: space[7] },
    chip: {
      minHeight: 48,
      paddingHorizontal: space[4],
      justifyContent: 'center',
      borderRadius: radius.full,
      backgroundColor: colors.bg.surface,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    // The app's action blue, not the map's gold: white text needs the contrast.
    chipActive: { backgroundColor: colors.action.secondary, borderColor: colors.action.secondaryEdge },
    chipText: { ...text('body', { weight: '700' }), color: colors.text.primary },
    chipTextActive: { color: colors.text.onAccent },
    card: {
      ...clayShadow(colors),
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      padding: space[3],
      borderRadius: radius.lg,
      backgroundColor: colors.bg.surface,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    cardOpen: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space[2] },
    cardBody: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space[3] },
    cardBodyStacked: { flexDirection: 'column', alignItems: 'stretch' },
    cardText: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
    cardTitle: { ...text('h3'), color: colors.text.primary },
    cardMeta: { ...text('caption'), color: colors.text.secondary },
    forward: { transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] },
    close: { width: 44, height: 44, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center' },
    pressed: { opacity: 0.7 },
    browse: { ...clayShadow(colors), borderRadius: radius.lg, backgroundColor: colors.bg.surface, borderWidth: 1, borderColor: colors.clay.ice.rim, paddingHorizontal: space[3] },
    disclosure: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[2] },
    browseTitle: { flex: 1, ...text('bodyStrong'), color: colors.text.primary },
    list: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: space[2], paddingBottom: space[3] },
    listItem: {
      width: '48%',
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      padding: space[2],
      borderRadius: radius.sm,
    },
    listItemWide: { width: '100%' },
    listItemActive: { backgroundColor: colors.bg.surfaceRaised },
    listText: { flex: 1, minWidth: 0, ...text('body'), color: colors.text.primary },
  })
  return { styles, colors }
})
