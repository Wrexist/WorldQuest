/**
 * `/country/SE` — one country.
 *
 * Deep-linkable, so a notification or a shared link can open a country directly.
 * A code the shipped packs do not carry renders the "not yet" state rather than an
 * empty page.
 */

import { useEffect, useMemo } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { entityProgress, isQuizzable, masteryOf, type ContentIndex, type Mastery, type MemoryState } from '@worldquest/engines'
import type { RegionCode } from '../../src/features/explore/ExploreScreen.js'
import { REGIONS } from '../../src/features/explore/ExploreScreen.js'
import {
  CountryScreen,
  type CountryFact,
} from '../../src/features/explore/CountryScreen.js'
import { collapseRelations } from '../../src/features/explore/collapseRelations.js'
import { ContentGate } from '../../src/components/ContentGate.js'
import { useReferenceContent } from '../../src/lib/referenceContent.js'
import { useFavourites } from '../../src/features/favourites/useFavourites.js'
import { currentLocale, type TranslationKey } from '../../src/lib/i18n.js'
import { useContent } from '../../src/lib/content.js'
import { isD1 } from '../../src/lib/backendConfig.js'
import { track } from '../../src/lib/analytics.js'

/** What the parts of a country are called, by country. A country not listed has none shown. */
const PARTS: Readonly<Record<string, { title: TranslationKey; practise: TranslationKey }>> = {
  US: { title: 'country:parts.us.title', practise: 'country:parts.us.practise' },
  SE: { title: 'country:parts.se.title', practise: 'country:parts.se.practise' },
}
/** Attributes that name a part's seat of government, shown under its name. */
const SEAT_ATTRIBUTES = new Set(['state-capital', 'county-seat'])

/** The states or counties inside a country (`Entity.within`), one row each, alphabetically. */
function partsOf(index: ContentIndex, parent: string, memory: ReadonlyMap<string, MemoryState>, now: number, locale: string) {
  const words = PARTS[parent]
  if (words === undefined) return undefined
  const rows = [...index.entities.values()]
    .filter((entity) => entity.within === parent)
    .map((entity) => {
      const facts = (index.factsByEntity.get(entity.id) ?? []).filter((fact) => isQuizzable(fact))
      const seat = facts.find((fact) => SEAT_ATTRIBUTES.has(fact.attribute))
      const states = facts.map((fact) => memory.get(fact.id)).filter((s) => s !== undefined)
      return {
        id: entity.id,
        name: entity.names[locale] ?? entity.names['en'] ?? entity.id,
        detail: seat === undefined ? undefined : seat.value.names?.[locale] ?? seat.value.names?.['en'],
        mastery: (states.length === 0 ? 'unseen' : masteryOf(states[0]!, now)) as Mastery,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale))
  return rows.length === 0 ? undefined : { ...words, rows, ids: rows.map((row) => row.id) }
}

const isRegion = (value: string | undefined): value is RegionCode =>
  value !== undefined && (REGIONS as readonly string[]).includes(value)

export default function CountryRoute() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const { index, memory, status, reload, isOffline } = useReferenceContent()
  const { isFavourite, toggle } = useFavourites()
  // What a lesson can be composed from here. The Worker composes from everything; a build
  // without it composes from the bundled packs, which do not carry the famous-people facts.
  const local = useContent().index
  const practisableAttributes = useMemo(
    () => (isD1() || local === null ? undefined : new Set([...local.index.facts.values()].filter((f) => f.entity === code).map((f) => f.attribute))),
    [local, code],
  )

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

    const facts: CountryFact[] = collapseRelations([...index.index.facts.values()]
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
          quizzable: isQuizzable(fact),
          ...(fact.source ? { source: fact.source } : {}),
        }
      }))

    return {
      name: entity.names[locale] ?? entity.names['en'] ?? entity.id,
      region: isRegion(entity.region) ? entity.region : null,
      // From the pack, never built from `code` — see the note in collection/[kind].
      assetPath: entity.assets?.['flag']?.path,
      mapPath: entity.assets?.['map']?.path,
      mapContextPath: entity.assets?.['mapContext']?.path,
      facts,
      progress: entityProgress(index.index, entity.id, memory, now),
      parts: partsOf(index.index, entity.id, memory, now, locale),
    }
  }, [index, memory, code])

  // No star on the "we do not have this one yet" state — starring a country the packs
  // do not carry stores an id nothing can ever render.
  const starrable = view.name !== null && code !== undefined

  useEffect(() => {
    if (view.name === null || code === undefined) return
    track('country_viewed', { country: code, source: 'deeplink' })
  }, [code, view.name])

  const parts = 'parts' in view ? view.parts : undefined

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
        {...(parts !== undefined
          // Every one of them: the lesson introduces states only when its focus names them.
          ? { parts: { ...parts, onPractise: () => router.push(`/lesson?entity=${parts.ids.join(',')}`) } }
          : {})}
        // The country. This button has said "Practise this country" since it was built
        // and pushed a plain `/lesson` — a generic mixed lesson about all sixty-five,
        // with no relationship to the page it was on. The engine could always narrow
        // (`topicFilter`); nothing had ever asked it to.
        onPractise={() => router.push(`/lesson?entity=${encodeURIComponent(code ?? '')}`)}
        // One shelf of it: the same focus, narrowed to that category's attributes.
        practisableAttributes={practisableAttributes}
        onPractiseCategory={(attributes) =>
          router.push(`/lesson?entity=${encodeURIComponent(code ?? '')}&attr=${attributes.map(encodeURIComponent).join(',')}`)}
        {...(starrable
          ? { favourite: isFavourite(code), onToggleFavourite: () => toggle(code) }
          : {})}
      />
    </ContentGate>
  )
}
