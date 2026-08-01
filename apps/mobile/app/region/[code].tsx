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
import { entityProgress } from '@worldquest/engines'
import { REGIONS, type RegionCode } from '../../src/features/explore/ExploreScreen.js'
import { RegionScreen, type CountryRow } from '../../src/features/explore/RegionScreen.js'
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
  const { index, memory } = useContent()

  // A deep link can carry anything. An unknown code goes home rather than rendering
  // an empty continent that looks like a bug.
  const region: RegionCode = isRegion(code ?? '') ? (code as RegionCode) : 'EU'

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

  return (
    <RegionScreen
      region={region}
      regionNameKey={REGION_NAME[region]}
      countries={countries}
      onStartLesson={() => router.push('/lesson')}
    />
  )
}
