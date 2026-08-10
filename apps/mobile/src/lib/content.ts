/**
 * Content loading for Phase 1.
 *
 * Core packs ship IN THE BINARY, which is why this is a static import rather than a
 * fetch: a first launch on a plane has to work. Extended packs download and cache
 * from week 9.
 */

import { useCallback, useMemo, useState } from 'react'
import { useOnline } from './connectivity.js'
import { useScreenReader } from './screenReader.js'
import { currentLocale } from './i18n.js'
import {
  buildIndex,
  composeLesson,
  focusFilter,
  seededRng,
  type ContentIndex,
  type Entity,
  type Fact,
  type MemoryState,
  type LessonFocus,
  type Question,
  type Template,
} from '@worldquest/engines'

import entitiesPack from '../../../../packages/content/packs/geography/entities.countries.v1.json'
import capitalsPack from '../../../../packages/content/packs/geography/facts.capitals.v1.json'
import currenciesPack from '../../../../packages/content/packs/geography/facts.currencies.v1.json'
import flagsPack from '../../../../packages/content/packs/geography/facts.flags.v1.json'
/**
 * The fourth fact per country, and it had never been loaded.
 *
 * 65 location facts, two question templates, `scripts/build-locations.cjs`, the map
 * artwork and the `'map'` entry in PRESENTABLE below all shipped — and this import did
 * not, so `tpl.country-to-map.mc4` and `tpl.location-of.mc4` had no facts to attach to
 * and produced nothing. The comment on PRESENTABLE describes them as "back in the
 * rotation"; they had never been in it.
 *
 * `pnpm content:validate` reads the packs DIRECTORY and reported 260 facts the whole
 * time. This list is hand-written, so the app loaded 193 and no gate compared the two
 * numbers. `content.test.ts` compares them now.
 */
import locationsPack from '../../../../packages/content/packs/geography/facts.locations.v1.json'
import templatesPack from '../../../../packages/content/packs/geography/templates.v1.json'

export type LoadedContent = {
  index: ContentIndex
  /**
   * `focus` narrows what the lesson may ask about — see `LessonFocus` in the engines.
   *
   * Optional, and absent means the mixed lesson this always composed. `focusFilter`
   * returns `undefined` for an empty focus, so an unfiltered lesson takes exactly the
   * path it took before the picker existed rather than running a predicate that always
   * says yes.
   */
  compose: (opts: { count?: number; focus?: LessonFocus }) => readonly Question[]
}

/**
 * What this app can put on screen today.
 *
 * This was `['text']` for most of the project's life, and the note here said to add
 * `'image'` in the same change that landed the flag assets and the renderer, never
 * before — because this constant is the one place that claims we can show a picture.
 * That change is `scripts/build-flags.cjs`, `src/lib/flags.ts` and
 * `src/components/Flag.tsx`, so `'image'` is now true rather than aspirational, and
 * `tpl.flag-to-country.mc4` — "Which country's flag is this?", the mockup's lesson
 * screen — is back in the rotation.
 *
 * `'map'` joined it the same way and under the same rule: `pnpm build:maps` produces
 * the geometry, `CountryMap` draws it, and `tpl.country-to-map.mc4` asks about it, so
 * the claim is now true rather than aspirational. Its screen-reader sibling
 * `tpl.location-of.mc4` shipped in the SAME change — "Where in the world is Sweden?",
 * testing the same fact by ear — because a map question is unanswerable without sight
 * and enabling one without the sibling would move this bug rather than fix it.
 *
 * `audio` stays out. Nothing renders it; the pronunciation pack adds its own entry
 * when it adds its renderer.
 */
const PRESENTABLE = ['text', 'image', 'map'] as const

export function useContent() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('ready')
  const [nonce, setNonce] = useState(0)
  // Was a hardcoded `false`, which made Home's offline banner unreachable for its
  // entire life. Content itself is never offline — the packs are in the binary — so
  // this describes the connection, not the load.
  const online = useOnline()
  // Read here, not in the lesson: it changes which QUESTIONS exist, not how they are
  // drawn. Someone who switches VoiceOver on mid-session has told us they need it now,
  // and the next lesson they start should already describe flags rather than show them.
  const screenReaderOn = useScreenReader()

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
          ...(locationsPack.items as unknown as Fact[]),
        ],
        templates: templatesPack.items as unknown as Template[],
      })
      return {
        index: built,
        compose: ({ count = 10, focus }) => {
          const topicFilter = focus ? focusFilter(built, focus) : undefined
          return composeLesson({
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
            // Swaps `tpl.flag-to-country.mc4` for `tpl.flag-describe.mc4` — same fact,
            // same `user_facts` row, same scheduler, described in words instead of
            // shown. accessibility.md §8. See `PRESENTABLE` above for why the two had
            // to land together.
            screenReaderOnly: screenReaderOn,
            // Spread rather than passed as `undefined`: `exactOptionalPropertyTypes`
            // distinguishes an absent property from one set to undefined, and the
            // composer's own spread of it does the same.
            ...(topicFilter ? { topicFilter } : {}),
          })
        },
      }
    } catch {
      setStatus('error')
      return null
    }
  }, [memory, nonce, screenReaderOn])

  const reload = useCallback(() => {
    setStatus('ready')
    setNonce((n) => n + 1)
  }, [])

  return { index, memory, status, reload, isOffline: !online }
}
