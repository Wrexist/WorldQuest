/**
 * `/country/SE` — one country.
 *
 * Deep-linkable, so a notification or a shared link can open a country directly.
 * A code the shipped packs do not carry renders the "not yet" state rather than an
 * empty page.
 */

import { useEffect, useMemo } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { entityProgress, masteryOf, type Mastery } from '@worldquest/engines'
import type { RegionCode } from '../../src/features/explore/ExploreScreen.js'
import { REGIONS } from '../../src/features/explore/ExploreScreen.js'
import {
  CountryScreen,
  type CountryFact,
} from '../../src/features/explore/CountryScreen.js'
import { ContentGate } from '../../src/components/ContentGate.js'
import { useContent } from '../../src/lib/content.js'
import { useFavourites } from '../../src/features/favourites/useFavourites.js'
import { currentLocale } from '../../src/lib/i18n.js'
import { track } from '../../src/lib/analytics.js'

const isRegion = (value: string | undefined): value is RegionCode =>
  value !== undefined && (REGIONS as readonly string[]).includes(value)

export default function CountryRoute() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const { index, memory, status, reload, isOffline } = useContent()
  const { isFavourite, toggle } = useFavourites()

  const view = useMemo(() => {
    const entity = index === null || code === undefined ? undefined : index.index.entities.get(code)
    if (index === null || entity === undefined) {
      return {
        name: null,
        region: null,
        assetPath: undefined,
        mapPath: undefined,
        mapContextPath: undefined,
        facts: [] as CountryFact[],
        progress: null,
      }
    }

    const locale = currentLocale()
    const now = Date.now()

    const facts: CountryFact[] = [...index.index.facts.values()]
      .filter((fact) => fact.entity === entity.id)
      .map((fact) => {
        const state = memory.get(fact.id)
        return {
          id: fact.id,
          attribute: fact.attribute,
          // Fact values are content, translated at the data layer. English is the
          // fallback — never a machine translation.
          value: fact.value.names?.[locale] ?? fact.value.names?.['en'] ?? '',
          mastery: (state ? masteryOf(state, now) : 'unseen') as Mastery,
          due: state !== undefined && state.dueAt <= now,
          ...(fact.source ? { source: fact.source } : {}),
        }
      })

    return {
      name: entity.names[locale] ?? entity.names['en'] ?? entity.id,
      region: isRegion(entity.region) ? entity.region : null,
      // From the pack, never built from `code` — see the note in collection/[kind].
      assetPath: entity.assets?.['flag']?.path,
      mapPath: entity.assets?.['map']?.path,
      mapContextPath: entity.assets?.['mapContext']?.path,
      facts,
      progress: entityProgress(index.index, entity.id, memory, now),
    }
  }, [index, memory, code])

  // No star on the "we do not have this one yet" state — starring a country the packs
  // do not carry stores an id nothing can ever render.
  const starrable = view.name !== null && code !== undefined

  useEffect(() => {
    if (view.name === null || code === undefined) return
    track('country_viewed', { country: code, source: 'deeplink' })
  }, [code, view.name])

  return (
    <ContentGate status={status} onRetry={reload} isOffline={isOffline} showLoading>
      <CountryScreen
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/explore'))}
        name={view.name}
        region={view.region}
        assetPath={view.assetPath}
        mapPath={view.mapPath}
        mapContextPath={view.mapContextPath}
        facts={view.facts}
        progress={view.progress}
        // The country. This button has said "Practise this country" since it was built
        // and pushed a plain `/lesson` — a generic mixed lesson about all sixty-five,
        // with no relationship to the page it was on. The engine could always narrow
        // (`topicFilter`); nothing had ever asked it to.
        onPractise={() => router.push(`/lesson?entity=${encodeURIComponent(code ?? '')}`)}
        {...(starrable
          ? { favourite: isFavourite(code), onToggleFavourite: () => toggle(code) }
          : {})}
      />
    </ContentGate>
  )
}
