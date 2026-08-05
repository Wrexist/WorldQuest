/**
 * `/region/EU` — one continent's countries.
 *
 * Outside the tabs, so it pushes over the Explore tab with a back gesture rather than
 * replacing it. Deep-linkable: `worldquest://region/AF` is a legitimate destination
 * for a quest notification, and routes that can only be reached by tapping are routes
 * a notification cannot open.
 */

import { useEffect, useMemo } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { entityProgress, regionProgress } from '@worldquest/engines'
import { REGIONS, type RegionCode } from '../../src/features/explore/ExploreScreen.js'
import { RegionScreen, type CountryRow } from '../../src/features/explore/RegionScreen.js'
import { recordRegionStarted } from '../../src/features/achievements/progress.js'
import { ContentGate } from '../../src/components/ContentGate.js'
import { useContent } from '../../src/lib/content.js'
import { currentLocale, type TranslationKey } from '../../src/lib/i18n.js'

const REGION_NAME: Record<RegionCode, TranslationKey> = {
  EU: 'explore:region.EU',
  AS: 'explore:region.AS',
  AF: 'explore:region.AF',
  NA: 'explore:region.NA',
  SA: 'explore:region.SA',
  OC: 'explore:region.OC',
  AN: 'explore:region.AN',
}

const isRegion = (value: string): value is RegionCode =>
  (REGIONS as readonly string[]).includes(value)

export default function RegionRoute() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const { index, memory, status, reload, isOffline } = useContent()

  // A deep link can carry anything. An unknown code goes home rather than rendering
  // an empty continent that looks like a bug.
  const region: RegionCode = isRegion(code ?? '') ? (code as RegionCode) : 'EU'

  /**
   * Opening a continent is what `region_started` means, and nothing emitted it.
   *
   * `ach.explorer.continents` is a set-completion rule over the six regions and had no
   * producer at all, so its single gold tier was permanently at zero — a visible,
   * progress-barred goal that could not move. The engine deduplicates by member, so
   * firing on every visit costs nothing and needs no "have I been here" bookkeeping.
   *
   * Only for a code the app recognises: a deep link can carry anything, and `region` has
   * already fallen back to EU by this point, so an unknown code would credit a continent
   * the user never opened.
   */
  useEffect(() => {
    if (!isRegion(code ?? '')) return
    recordRegionStarted(region, Date.now())
  }, [code, region])

  const countries = useMemo<readonly CountryRow[]>(() => {
    if (index === null) return []
    const locale = currentLocale()
    const now = Date.now()

    return [...index.index.entities.values()]
      .filter((entity) => entity.region === region)
      .map((entity) => ({
        id: entity.id,
        // Country names are content, not copy — they live in the pack, translated at
        // the data layer. English is the fallback, never a machine translation.
        name: entity.names[locale] ?? entity.names['en'] ?? entity.id,
        progress: entityProgress(index.index, entity.id, memory, now),
      }))
  }, [index, memory, region])

  /**
   * The region's totals from the engine, not added up again in the screen.
   *
   * `regionProgress` decides what counts — non-quizzable facts are excluded, so a
   * disputed capital cannot make a country permanently incompletable — and it is the
   * only thing that should.
   */
  const progress = useMemo(
    () =>
      index === null
        ? null
        : regionProgress(index.index, region, memory, Date.now()),
    [index, memory, region],
  )

  return (
    <ContentGate status={status} onRetry={reload} isOffline={isOffline} showLoading>
      <RegionScreen
        region={region}
        regionNameKey={REGION_NAME[region]}
        countries={countries}
        progress={progress}
        onSelectCountry={(id) => router.push(`/country/${id}`)}
        onStartLesson={() => router.push('/lesson')}
      />
    </ContentGate>
  )
}
