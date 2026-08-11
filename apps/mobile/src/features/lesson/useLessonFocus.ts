/**
 * What this lesson is allowed to ask about — the URL first, onboarding's answers second.
 *
 * A hook rather than forty lines inside `app/lesson.tsx`, because `apps/mobile/CLAUDE.md`
 * is explicit that routes fetch, compose and delegate and that logic lives in engines or
 * in hooks. This is policy: it decides when a preference is allowed to narrow a lesson,
 * and the rule it encodes — "the URL always wins" — has to hold the same way for every
 * caller. Inside the route it was reachable only by mounting the router; here it is a
 * function of its inputs.
 *
 * It stays in the app rather than in `packages/engines` for one reason: it reads the
 * content index to turn a region code into entity ids, and the engines deliberately do
 * not know what a continent is.
 */

import { useMemo } from 'react'
import { entitiesInGroup, type LessonFocus } from '@worldquest/engines'
import { useContent } from '../../lib/content.js'
import { parseFocusParams } from './focusParams.js'
import { usePreferences } from '../settings/usePreferences.js'
import { LEVELS } from '../onboarding/levels.js'

/** The raw `useLocalSearchParams` slice this reads — strings, exactly as the URL had them. */
export type FocusSearchParams = {
  readonly facts?: string | undefined
  readonly attr?: string | undefined
  readonly entity?: string | undefined
  readonly region?: string | undefined
  readonly min?: string | undefined
  readonly max?: string | undefined
  readonly len?: string | undefined
}

export function useLessonFocus(params: FocusSearchParams): LessonFocus | undefined {
  const { facts, attr, entity, region, min, max, len } = params
  const { index } = useContent()
  const parsed = parseFocusParams({ facts, attr, entity, region, min, max, len })
  const { preferences } = usePreferences()

  /**
   * What onboarding asked for, used only where the URL asked for nothing.
   *
   * The two content questions in onboarding — which continent, and how well do you know
   * the world — have to change a lesson or they are a survey, and this is the one place
   * every unfocused lesson passes through, including `?taster=1`. The taster is the
   * first lesson anybody ever plays, which is exactly when "just starting" and "bring it
   * on" should mean different things.
   *
   * **The URL always wins.** Tapping Sweden on the country page, or a continent on the
   * region page, is a specific request made just now; a preference set once during
   * onboarding must not quietly narrow it further. So this fills gaps and never
   * overrides — and it drops out entirely for the daily quest, which arrives with exact
   * `factIds` and has already decided what today is about.
   *
   * It fades on its own, which is the point of a STARTING preference. FSRS infers a real
   * per-learner difficulty within a session or two and the scheduler's own ordering takes
   * over; this only has to make the first few lessons feel like they were meant for you.
   */
  return useMemo<LessonFocus | undefined>(() => {
    if (index === null) return undefined
    // A region code becomes entity ids HERE, where the index is. The engine has no idea
    // what a continent is and the params module has none either — both by design.
    const fromRegion =
      parsed.region === undefined ? [] : entitiesInGroup(index.index, 'region', parsed.region)
    const entities = [...new Set([...parsed.entities, ...fromRegion])]

    // Only when the URL named no facts, no entities and no region — see above. A quest
    // lesson carries `factIds` and is left completely alone.
    const unfocused =
      parsed.factIds.length === 0 && entities.length === 0 && parsed.region === undefined
    const startEntities =
      unfocused && preferences.startRegion !== null
        ? entitiesInGroup(index.index, 'region', preferences.startRegion)
        : []
    const startBand = unfocused && parsed.difficulty === undefined
      ? LEVELS[preferences.startLevel]
      : undefined

    const built: LessonFocus = {
      ...(parsed.factIds.length > 0 ? { factIds: parsed.factIds } : {}),
      ...(parsed.attributes.length > 0 ? { attributes: parsed.attributes } : {}),
      // An empty list would mean "these entities, of which there are none" and compose a
      // lesson of nothing — see `focusFilter`. A start region nobody is in fails OPEN,
      // which is the right direction for a preference the user cannot see.
      ...(entities.length > 0
        ? { entities }
        : startEntities.length > 0
          ? { entities: startEntities }
          : {}),
      ...(parsed.difficulty ? { difficulty: parsed.difficulty } : startBand ? { difficulty: startBand } : {}),
    }
    // `undefined` rather than an empty object, so the runner's `focus ? …` spread keeps
    // an unfocused lesson on exactly the path it took before this existed.
    return Object.keys(built).length > 0 ? built : undefined
    // The raw param STRINGS, not `parsed`. `parseFocusParams` returns a fresh object on
    // every render, so depending on it would defeat the memo entirely — and the memo is
    // what stops a new `focus` identity from recomposing the lesson mid-question.
  }, [index, facts, attr, entity, region, min, max, preferences.startRegion, preferences.startLevel])
}
