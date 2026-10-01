/**
 * How well a learner still knows a set of facts — a course step, a country, a continent.
 *
 * Spaced repetition says WHEN each fact is due. What it does not say, and a learner wants to
 * know, is the shape of it: "I finished the Nordic step in March; is it still mine?" Duolingo
 * draws a finished skill as gold and then, as time passes, as cracked, and the cracked ones are
 * where it sends you to refresh. This is that signal, derived from what the scheduler already
 * knows (FSRS retrievability, the probability of recalling each fact right now) rather than from
 * a second model that could disagree with it.
 *
 * ## Calm by construction
 *
 * The result is a fact about the facts, never a verdict on the learner, and the one boolean it
 * carries — `fading` — is deliberately hard to trip. It needs at least three facts the learner
 * has actually met (a step they barely touched is not "rusty", it is unfinished), a mean recall
 * well under the scheduler's own target, and it ignores facts resting as leeches, which the
 * scheduler has already decided to stop showing. What the app does with it is offer a refresh,
 * never a warning.
 *
 * Pure: `now` is a parameter.
 */

import { retrievability } from '../learning/fsrs.js'
import type { FactId, MemoryState } from '../learning/types.js'
import type { ContentIndex } from '../content/types.js'
import { focusFilter, type LessonFocus } from './focus.js'

export type Strength = {
  /** Facts the focus covers that a learner can be asked about. */
  readonly total: number
  /** Of those, how many they have met and are not resting from. */
  readonly known: number
  /** Mean probability of recalling the known ones right now, 0–1; null when none are known. */
  readonly retention: number | null
  /** Known well enough to say, and recalled well under target: worth offering a refresh. */
  readonly fading: boolean
}

/** Below this the learner is, on average, more likely than not to have lost a good share of them. */
export const FADING_BELOW = 0.75
/** Fewer than this and the sample says nothing about a step. */
export const FADING_MIN_KNOWN = 3

export function strengthOf(
  index: ContentIndex,
  memory: ReadonlyMap<FactId, MemoryState>,
  focus: LessonFocus,
  now: number,
): Strength {
  const inFocus = focusFilter(index, focus)
  let total = 0
  let known = 0
  let sum = 0
  for (const factId of index.itemsByFact.keys()) {
    if (inFocus !== undefined && !inFocus(factId)) continue
    total++
    const state = memory.get(factId)
    if (state === undefined || state.reps <= 0 || state.suspended) continue
    known++
    sum += Math.min(1, Math.max(0, retrievability(state, now)))
  }
  const retention = known === 0 ? null : sum / known
  return { total, known, retention, fading: known >= FADING_MIN_KNOWN && retention !== null && retention < FADING_BELOW }
}
