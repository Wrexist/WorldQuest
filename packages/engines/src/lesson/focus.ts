/**
 * "Practise capitals in Europe, ten questions, easy ones."
 *
 * ## What this is, and what it deliberately is not
 *
 * `ComposeInput` has carried `topicFilter?: (factId) => boolean` since lesson composition
 * was written, and `selectItems` has honoured it since the day after — plumbed end to
 * end, tested on both sides, and **passed by nothing**. The capability was complete and
 * unreachable: there was no way for a user to say what they wanted to practise, so the
 * predicate had no author.
 *
 * This is that author. It turns a declarative choice — attributes, entities, a difficulty
 * band — into the predicate the composer already knows how to obey. Nothing about the
 * selection algorithm changes: the same due-first ordering, the same 60/30/10 mix, the
 * same interleaving. It sees a smaller pool.
 *
 * ## Why there is no `region` field here
 *
 * Because this package does not know what a region is, and must not learn. A continent is
 * geography, and geography is content pack #1 — `packages/engines/CLAUDE.md` is blunt
 * about it: "If a geography concept (country, flag, continent) appears in this package,
 * the abstraction has leaked."
 *
 * So a caller wanting "everything in Europe" resolves that to a set of entity ids and
 * passes `entities`. The host already holds the index and already knows which of its
 * entities are European; asking it to say WHICH rather than HOW keeps the astronomy pack
 * working with the same code. `entitiesInGroup` below is the one line that helps with
 * that, and it groups by an opaque field name rather than by a known one.
 *
 * ## Everything is a narrowing, and an empty focus is no filter at all
 *
 * Each field is optional and each one only ever removes facts. `focusFilter({})` returns
 * `undefined` rather than a predicate that always says yes — so "practise everything"
 * costs the composer nothing and takes exactly the path it took before this file existed.
 */

import type { ContentIndex } from '../content/index.js'
import type { EntityId } from '../content/types.js'
import type { FactId } from '../learning/types.js'

export type LessonFocus = {
  /**
   * Fact attributes to keep — `['capital']`, `['flag', 'currency']`.
   *
   * The one dimension a user is most likely to want, and the one the content pack is
   * already organised around: a pack file per attribute, a label per attribute on the
   * country page, and two or three templates per attribute in the templates pack.
   */
  readonly attributes?: readonly string[]
  /**
   * Entities to keep. A single country, or every country on a continent.
   *
   * A set rather than a group name, so this package never has to know that "EU" means
   * Europe — see the note above.
   */
  readonly entities?: readonly EntityId[]
  /**
   * The authored difficulty band to keep, inclusive at both ends.
   *
   * Authored, not learned: `Fact.difficulty` is a 1–5 prior written by a human, and the
   * per-user difficulty the scheduler infers is a different number that lives in memory
   * state. Filtering on the prior is what a user picking "easy" is asking for — show me
   * the ones that are easy in general, not the ones I personally find easy, which would
   * be a strange thing to request and a stranger thing to practise.
   */
  readonly difficulty?: { readonly min?: number; readonly max?: number }
}

/**
 * The predicate, or `undefined` when nothing was asked for.
 *
 * `undefined` matters: `composeLesson` spreads `topicFilter` conditionally, so returning
 * a tautology here would put a function call in the hot path of every unfiltered lesson
 * for no reason, and would make "did the user narrow anything?" unanswerable downstream.
 *
 * ## An EMPTY array is a choice, and an absent one is not
 *
 * `entities: []` means "restrict to these entities, of which there are none" and matches
 * nothing. `entities` absent means "do not restrict by entity" and matches everything.
 * The distinction is the whole difference between a picker that reports zero and one that
 * silently widens: choosing a continent the packs have no countries for produced an empty
 * id list, this function read it as "no filter", and the screen cheerfully offered a
 * lesson about the entire world under a heading saying Antarctica.
 *
 * Callers that want the widening behaviour — a URL carrying a region code nobody is in —
 * omit the key rather than passing an empty array, which is what `app/lesson.tsx` does.
 * That way a bad link fails open and a deliberate choice fails closed, which is the right
 * way round for each.
 */
export function focusFilter(
  index: ContentIndex,
  focus: LessonFocus,
): ((factId: FactId) => boolean) | undefined {
  const attributes = focus.attributes === undefined ? null : new Set(focus.attributes)
  const entities = focus.entities === undefined ? null : new Set(focus.entities)
  const min = focus.difficulty?.min
  const max = focus.difficulty?.max

  if (attributes === null && entities === null && min === undefined && max === undefined) {
    return undefined
  }

  return (factId: FactId): boolean => {
    const fact = index.facts.get(factId)
    // A fact the index cannot resolve is not a fact this lesson should contain. Returning
    // true would let an unknown id through the one gate that exists to narrow the pool.
    if (fact === undefined) return false

    if (attributes !== null && !attributes.has(fact.attribute)) return false
    if (entities !== null && !entities.has(fact.entity)) return false
    if (min !== undefined && fact.difficulty < min) return false
    if (max !== undefined && fact.difficulty > max) return false
    return true
  }
}

/**
 * Every entity whose `field` equals `value` — `entitiesInGroup(index, 'region', 'EU')`.
 *
 * The field is a STRING the caller names, not a known one, which is the whole point: this
 * package stays ignorant of what "region" means while still saving every host from
 * writing the same three-line scan. A pack grouping by `constellation` or `phylum` gets
 * the same helper with no change here.
 */
export function entitiesInGroup(
  index: ContentIndex,
  field: 'region' | 'subregion',
  value: string,
): readonly EntityId[] {
  return [...index.entities.values()].filter((e) => e[field] === value).map((e) => e.id)
}

/**
 * How many facts a focus would actually leave, so a picker can say so before committing.
 *
 * A chooser that offers "Currencies · Oceania" and then produces a three-question lesson
 * has wasted the choice; one that shows the count next to each option lets the user see
 * that before tapping. Counted over the quizzable facts — the keys of `itemsByFact` —
 * rather than over every fact in the index, because a fact no template can present is not
 * something this lesson could have asked either way.
 */
export function factsMatching(index: ContentIndex, focus: LessonFocus): number {
  const filter = focusFilter(index, focus)
  const quizzable = [...index.itemsByFact.keys()]
  return filter === undefined ? quizzable.length : quizzable.filter(filter).length
}
