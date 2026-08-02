/**
 * Content loading for Phase 1.
 *
 * Core packs ship IN THE BINARY, which is why this is a static import rather than a
 * fetch: a first launch on a plane has to work. Extended packs download and cache
 * from week 9.
 */

import { useCallback, useMemo, useState } from 'react'
import {
  buildIndex,
  composeLesson,
  seededRng,
  type ContentIndex,
  type Entity,
  type Fact,
  type MemoryState,
  type Question,
  type Template,
} from '@worldquest/engines'

import entitiesPack from '../../../../packages/content/packs/geography/entities.countries.v1.json'
import capitalsPack from '../../../../packages/content/packs/geography/facts.capitals.v1.json'
import currenciesPack from '../../../../packages/content/packs/geography/facts.currencies.v1.json'
import flagsPack from '../../../../packages/content/packs/geography/facts.flags.v1.json'
import templatesPack from '../../../../packages/content/packs/geography/templates.v1.json'

export type LoadedContent = {
  index: ContentIndex
  compose: (opts: { count?: number }) => readonly Question[]
}

export function useContent() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('ready')
  const [nonce, setNonce] = useState(0)

  // Real memory state arrives from Supabase in week 3. Empty here means every fact
  // reads as new, which is the correct cold-start behaviour anyway.
  const memory = useMemo(() => new Map<string, MemoryState>(), [])

  const index = useMemo<LoadedContent | null>(() => {
    try {
      const built = buildIndex({
        entities: entitiesPack.items as unknown as Entity[],
        facts: [
          ...(capitalsPack.items as unknown as Fact[]),
          ...(flagsPack.items as unknown as Fact[]),
          ...(currenciesPack.items as unknown as Fact[]),
        ],
        templates: templatesPack.items as unknown as Template[],
      })
      return {
        index: built,
        compose: ({ count = 10 }) =>
          composeLesson({
            index: built,
            memory: [...memory.values()],
            now: Date.now(),
            // Seeded per session so a reload does not reshuffle mid-lesson.
            rng: seededRng(nonce + 1),
            locale: 'en',
            count,
          }),
      }
    } catch {
      setStatus('error')
      return null
    }
  }, [memory, nonce])

  const reload = useCallback(() => {
    setStatus('ready')
    setNonce((n) => n + 1)
  }, [])

  return { index, memory, status, reload, isOffline: false }
}
