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

import { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Button, createThemeStyles, radius, space, text } from '@worldquest/design'
import { Flag } from '../../components/Flag.js'
import { Icon } from '../../components/Icon.js'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import { WorldAtlasView } from './WorldAtlasView.js'
import { buildExploreScene } from './scene/exploreScene.js'
import { ATLAS_COUNTRIES, ATLAS_PLACES } from './data/atlas.generated.js'
import type { AtlasNames } from './useAtlasNames.js'

export const ATLAS_REGIONS = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC'] as const

const REGION_KEY: Record<(typeof ATLAS_REGIONS)[number], TranslationKey> = {
  EU: 'explore:region.EU',
  AS: 'explore:region.AS',
  AF: 'explore:region.AF',
  NA: 'explore:region.NA',
  SA: 'explore:region.SA',
  OC: 'explore:region.OC',
}

export type ExploreAtlasCountry = { readonly id: string; readonly name: string; readonly region: string; readonly flagPath?: string | undefined }

export type ExploreAtlasProps = {
  readonly countries: readonly ExploreAtlasCountry[]
  readonly names: AtlasNames
  readonly selected: string | null
  readonly onSelect: (id: string | null) => void
  readonly region: string | null
  readonly onRegion: (region: string | null) => void
  /** Search matches, to highlight on the globe. Empty when there is no query. */
  readonly matches: readonly string[]
  /** The existing country page — Learn and Review live there. */
  readonly onOpenCountry: (id: string) => void
}

export function ExploreAtlas({ countries, names, selected, onSelect, region, onRegion, matches, onOpenCountry }: ExploreAtlasProps) {
  const { styles, colors } = useThemeValues()
  const t = useT()
  const { width, height } = useWindowDimensions()
  const globeHeight = Math.round(Math.min(width * 0.95, height * 0.46, 420))

  const spec = useMemo(
    () => buildExploreScene({ selected, region, matches, ...names, t: t as never }),
    [selected, region, matches, names, t],
  )
  const country = selected === null ? undefined : countries.find((c) => c.id === selected)
  const place = selected === null ? undefined : Object.values(ATLAS_PLACES).find((p) => p.countryId === selected)
  const capital = place === undefined ? undefined : names.factValueName(place.factId)
  const regionCountries = useMemo(
    () => (region === null ? [] : countries.filter((c) => c.region === region && ATLAS_COUNTRIES[c.id] !== undefined)),
    [countries, region],
  )

  return (
    <View style={styles.column} testID="explore-atlas">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <RegionChip label={t('atlas:explore.all')} active={region === null} onPress={() => onRegion(null)} />
        {ATLAS_REGIONS.map((r) => (
          <RegionChip key={r} label={t(REGION_KEY[r])} active={region === r} onPress={() => onRegion(r)} />
        ))}
      </ScrollView>

      <WorldAtlasView
        spec={spec}
        controls
        style={{ height: globeHeight }}
        testID="explore-globe"
        onEvent={(event) => {
          // Only events for the scene on screen: a tap that lands after the selection
          // has moved on must not select something else.
          if (event.sceneKey !== spec.sceneKey) return
          if (event.type === 'countrySelected') onSelect(event.countryId)
        }}
      />

      {country !== undefined && (
        <View style={styles.card} testID="explore-atlas-card" accessibilityLiveRegion="polite">
          <View style={styles.cardRow}>
            {country.flagPath !== undefined && <Flag path={country.flagPath} width={64} />}
            <View style={styles.cardText}>
              <Text style={styles.cardTitle} role="heading">
                {country.name}
              </Text>
              {capital !== undefined && (
                <View>
                  <Text style={styles.cardMeta}>{t('atlas:explore.capital')}</Text>
                  <Text style={styles.cardMetaStrong}>{capital}</Text>
                </View>
              )}
            </View>
            <Pressable role="button" aria-label={t('atlas:explore.close')} onPress={() => onSelect(null)} style={styles.close} hitSlop={space[1]}>
              <Icon name="close" size={20} color={colors.text.secondary} />
            </Pressable>
          </View>
          <Button label={t('atlas:explore.open', { country: country.name })} variant="discovery" onPress={() => onOpenCountry(country.id)} testID="explore-atlas-open" />
        </View>
      )}

      {regionCountries.length > 0 && (
        <View style={styles.list} role="list" aria-label={t('atlas:explore.listLabel')}>
          {regionCountries.map((c) => (
            <Pressable
              key={c.id}
              role="button"
              aria-label={c.name}
              aria-selected={c.id === selected}
              onPress={() => onSelect(c.id)}
              style={[styles.listItem, c.id === selected && styles.listItemActive]}
            >
              <Text style={styles.listText}>{c.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

function RegionChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { styles } = useThemeValues()
  return (
    <Pressable role="button" aria-label={label} aria-selected={active} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  )
}

const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
    column: { gap: space[3] },
    chips: { gap: space[2], paddingVertical: space[1] },
    chip: {
      minHeight: 48,
      paddingHorizontal: space[4],
      justifyContent: 'center',
      borderRadius: radius.full,
      backgroundColor: colors.bg.surface,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    chipActive: { backgroundColor: colors.map.atlasSelected, borderColor: colors.map.atlasSelected },
    chipText: { ...text('body', { weight: '700' }), color: colors.text.primary },
    chipTextActive: { color: colors.text.onAccent },
    card: {
      gap: space[3],
      padding: space[4],
      borderRadius: radius.xl,
      backgroundColor: colors.bg.surface,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    cardText: { flex: 1, gap: space[1] },
    cardTitle: { ...text('h2'), color: colors.text.primary },
    cardMeta: { ...text('body'), color: colors.text.secondary },
    cardMetaStrong: { ...text('body', { weight: '700' }), color: colors.text.primary },
    close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    list: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    listItem: {
      minHeight: 48,
      paddingHorizontal: space[3],
      justifyContent: 'center',
      borderRadius: radius.md,
      backgroundColor: colors.bg.surface,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    listItemActive: { borderColor: colors.map.atlasSelected, borderWidth: 2 },
    listText: { ...text('body'), color: colors.text.primary },
  })
  return { styles, colors }
})
