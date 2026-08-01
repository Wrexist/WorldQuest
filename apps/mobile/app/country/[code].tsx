/**
 * `/country/SE` — one country.
 *
 * Deep-linkable, so a notification or a shared link can open a country directly.
 * A code the shipped packs do not carry renders the "not yet" state rather than an
 * empty page.
 */

import { useMemo } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { entityProgress, masteryOf, type Mastery } from '@worldquest/engines'
import type { RegionCode } from '../../src/features/explore/ExploreScreen.js'
import { REGIONS } from '../../src/features/explore/ExploreScreen.js'
import {
  CountryScreen,
  type CountryFact,
} from '../../src/features/explore/CountryScreen.js'
import { useContent } from '../../src/lib/content.js'
import { currentLocale } from '../../src/lib/i18n.js'

const isRegion = (value: string | undefined): value is RegionCode =>
  value !== undefined && (REGIONS as readonly string[]).includes(value)

export default function CountryRoute() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const { index, memory } = useContent()

  const view = useMemo(() => {
    const entity = index === null || code === undefined ? undefined : index.index.entities.get(code)
    if (index === null || entity === undefined) {
      return { name: null, region: null, facts: [] as CountryFact[], progress: null }
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
      facts,
      progress: entityProgress(index.index, entity.id, memory, now),
    }
  }, [index, memory, code])

  return (
    <CountryScreen
      name={view.name}
      region={view.region}
      facts={view.facts}
      progress={view.progress}
      onPractise={() => router.push('/lesson')}
    />
  )
}
