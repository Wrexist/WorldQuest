/**
 * Content loading for Phase 1.
 *
 * Core packs ship IN THE BINARY, which is why this is a static import rather than a
 * fetch: a first launch on a plane has to work. Extended packs download and cache
 * from week 9.
 */

import { useCallback, useMemo, useState } from 'react'
import { useOnline } from './connectivity.js'
import { currentLocale } from './i18n.js'
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

/**
 * What this app can put on screen today.
 *
 * Text only, and that is an asset problem rather than a code one. The geography pack
 * ships `tpl.flag-to-country.mc4` — "Which country's flag is this?", modality `image`
 * — and no flag file exists in this repo, so the question rendered as a prompt about
 * a picture that was not there, above four country names. One in three flag questions
 * in a real lesson was that question, and a wrong answer on it costs a heart.
 *
 * Nothing is lost by narrowing it. The same fact is still asked, through
 * `tpl.flag-describe.mc4`, which describes the flag in words — the sibling template
 * `docs/design/accessibility.md` §8 already relies on for exactly this reason.
 *
 * Add `'image'` here in the same change that lands the flag assets and the renderer,
 * never before: this constant is the one place that claims we can show a picture.
 */
const PRESENTABLE = ['text'] as const

export function useContent() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('ready')
  const [nonce, setNonce] = useState(0)
  // Was a hardcoded `false`, which made Home's offline banner unreachable for its
  // entire life. Content itself is never offline — the packs are in the binary — so
  // this describes the connection, not the load.
  const online = useOnline()

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
            // Was hardcoded `'en'`. A Swedish user got Swedish chrome around English
            // answer options — and the correct answer read as a foreign word in their
            // own language. Fact values are translated in the pack; this is what asks
            // for the translation.
            locale: currentLocale(),
            count,
            modalities: PRESENTABLE,
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

  return { index, memory, status, reload, isOffline: !online }
}
