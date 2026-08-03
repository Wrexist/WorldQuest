/**
 * `/collection/flags` and `/collection/countries`.
 *
 * One route for both, because they differ only in what the tile's second line says
 * and which fact decides "collected". Two files would be two places to fix the same
 * bug.
 *
 * Deep-linkable on purpose: "you are 3 flags from a badge" is a notification that has
 * to be able to open something.
 */

import { useMemo } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { entityProgress } from '@worldquest/engines'
import {
  CollectionScreen,
  type CollectionTile,
} from '../../src/features/collection/CollectionScreen.js'
import { ContentGate } from '../../src/components/ContentGate.js'
import { useContent } from '../../src/lib/content.js'
import { useFavourites } from '../../src/features/favourites/useFavourites.js'
import { currentLocale, useT } from '../../src/lib/i18n.js'

const KINDS = ['flags', 'countries'] as const
type Kind = (typeof KINDS)[number]

const isKind = (value: string): value is Kind => (KINDS as readonly string[]).includes(value)

export default function CollectionRoute() {
  const { kind } = useLocalSearchParams<{ kind: string }>()
  const { index, memory, status, reload, isOffline } = useContent()
  const { favourites } = useFavourites()
  const t = useT()

  // A deep link can carry anything. Flags is the safer default — it is the screen the
  // notification copy talks about most.
  const which: Kind = isKind(kind ?? '') ? (kind as Kind) : 'flags'

  const tiles = useMemo<readonly CollectionTile[]>(() => {
    if (index === null) return []
    const locale = currentLocale()
    const now = Date.now()
    const attribute = which === 'flags' ? 'flag' : 'capital'

    return [...index.index.entities.values()]
      .map((entity) => {
        const fact = [...index.index.facts.values()].find(
          (candidate) => candidate.entity === entity.id && candidate.attribute === attribute,
        )
        const progress = entityProgress(index.index, entity.id, memory, now)
        const name = entity.names[locale] ?? entity.names['en'] ?? entity.id

        return {
          id: entity.id,
          name,
          subtitle: fact?.value.names?.[locale] ?? fact?.value.names?.['en'],
          // Mastery, not exposure. A country you saw once and got wrong is not
          // collected, and pretending otherwise makes the whole number meaningless.
          // `mastered` is the bar rather than `burnished`: burnished is the very top
          // of the scale, and a collection you can only complete by overlearning
          // every entry is a collection nobody completes.
          collected: progress.mastery === 'mastered' || progress.mastery === 'burnished',
          favourite: favourites.has(entity.id),
        }
      })
      // Alphabetical in the user's locale — `localeCompare` so Swedish files Å after Z
      // rather than next to A, which is where a byte sort puts it.
      .sort((a, b) => a.name.localeCompare(b.name, locale))
  }, [index, memory, which, favourites])

  return (
    <ContentGate status={status} onRetry={reload} isOffline={isOffline}>
      <CollectionScreen
        title={t(which === 'flags' ? 'collection:flags.title' : 'collection:countries.title')}
        tiles={tiles}
        art={which === 'flags'}
        loading={status === 'loading'}
        onOpen={(id) => router.push(`/country/${id}`)}
        onStartLesson={() => router.push('/lesson')}
      />
    </ContentGate>
  )
}
