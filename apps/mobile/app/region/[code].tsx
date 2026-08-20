/**
 * `/region/EU` — one continent's countries.
 *
 * Outside the tabs, so it pushes over the Explore tab with a back gesture rather than
 * replacing it. Deep-linkable: `worldquest://region/AF` is a legitimate destination
 * for a quest notification, and routes that can only be reached by tapping are routes
 * a notification cannot open.
 */

import { useMemo } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { entityProgress, regionProgress } from '@worldquest/engines'
import { REGIONS, type RegionCode } from '../../src/features/explore/ExploreScreen.js'
import { RegionScreen, type CountryRow } from '../../src/features/explore/RegionScreen.js'
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
   * Opening a continent used to emit `region_started`, and no longer does.
   *
   * `ach.explorer.continents` had no producer at all, so its gold tier sat at zero, and
   * firing on a page visit was the cheapest way to give it one. That was harmless while
   * the tier paid nothing. It stopped being harmless the moment achievements started
   * paying: six taps through the continent list for 100 XP and 50 coins, having learned
   * nothing — and a server cannot see a navigation, so it could not have checked it.
   *
   * `submit-lesson` emits it now, for a region the user answered something correctly in.
   * That is what the copy has always said — "Start learning on every continent" — and it
   * cannot be farmed by navigating.
   */

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
        // The same lookup the collection grid does. Optional in the pack, optional here.
        flagPath: entity.assets?.['flag']?.path,
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
        // The continent. "Start" on the Europe page starting a lesson about all
        // sixty-five countries is the same defect the country page's Practise button
        // had: the CTA belongs to the page it is on. `region=` is expanded to entity
        // ids by the lesson route, which is where the index lives.
        // `region`, not `code`: the screen has already fallen back to EU for a code it
        // does not recognise, so sending the raw param would start a lesson about a
        // continent the page is not showing. The lesson route omits an unknown region
        // rather than failing closed, so the result was a lesson about the whole world
        // under a heading saying Europe — the widening `focusFilter` exists to prevent.
        // `canGoBack()` first, and a replace when there is nothing to go back to.
        // Every one of these routes is deep-linkable — a notification, a shared link,
        // a cold start straight onto it — and `router.back()` on an empty stack is a
        // no-op, so the only control on the screen did nothing at all.
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        onStartLesson={() => router.push(`/lesson?region=${encodeURIComponent(region)}`)}
      />
    </ContentGate>
  )
}
