/**
 * Progression — rolling fact mastery up into something a user recognises.
 *
 * The scheduler thinks in facts: `geo.SE.capital` is due in eleven days. Nobody
 * thinks that way about their own learning. They think "I know Europe" — so this
 * layer aggregates facts → entities → regions → the world.
 *
 * ## The rule that matters
 *
 * An entity is only as known as its WEAKEST quizzable fact. If you can name Sweden's
 * capital but not recognise its flag, you do not know Sweden — and a screen that says
 * you do is a screen that stops teaching you the thing you are missing. Averaging
 * would hide exactly the gap the product exists to close.
 *
 * Pure, like everything in this package: no clock, no network, no randomness. The
 * caller supplies `now` because "due" is a question about a moment, and a function
 * that reads the clock cannot be tested against a future the user has not reached.
 *
 * Spec: docs/systems/progression.md
 */

import type { ContentIndex, Entity, EntityId } from '../content/types.js'
import { isQuizzable } from '../content/index.js'
import type { FactId, Mastery, MemoryState } from '../learning/types.js'
import { masteryOf } from '../learning/fsrs.js'

/** Weakest to strongest. The index doubles as the comparison. */
export const MASTERY_ORDER: readonly Mastery[] = [
  'unseen',
  'learning',
  'familiar',
  'proficient',
  'mastered',
  'burnished',
]

const rank = (mastery: Mastery): number => MASTERY_ORDER.indexOf(mastery)

/** Mastery levels that count as "learned" in a progress count. */
export const LEARNED: readonly Mastery[] = ['mastered', 'burnished']

export const isLearned = (mastery: Mastery): boolean => LEARNED.includes(mastery)

export type EntityProgress = {
  readonly entityId: EntityId
  /** The weakest quizzable fact's level — see the note above. */
  readonly mastery: Mastery
  readonly factsTotal: number
  readonly factsLearned: number
  /** Facts due for review now. Drives the "review" prompt on a country card. */
  readonly factsDue: number
  /**
   * Facts the user has met at least once.
   *
   * NOT derivable from `mastery`: that is the WEAKEST fact, so a user who has
   * burnished Sweden's capital but never seen its flag reads as `unseen` — and
   * treating that as "not started" tells them they have done nothing.
   */
  readonly factsSeen: number
  /** True when every quizzable fact is at least `mastered`. */
  readonly complete: boolean
}

export type RegionProgress = {
  readonly region: string
  readonly entitiesTotal: number
  readonly entitiesComplete: number
  readonly entitiesStarted: number
  readonly factsTotal: number
  readonly factsLearned: number
  readonly factsDue: number
  /** 0–1, by facts rather than by entities — it moves every session. */
  readonly fraction: number
}

export type WorldProgress = {
  readonly regions: readonly RegionProgress[]
  readonly entitiesTotal: number
  readonly entitiesComplete: number
  readonly factsTotal: number
  readonly factsLearned: number
  readonly factsDue: number
  readonly fraction: number
}

/**
 * Facts belonging to an entity that a user can actually be quizzed on.
 *
 * Non-quizzable facts — a disputed capital, a population that changes every year —
 * still exist and are still shown, but counting them would make a country
 * permanently incompletable through no fault of the learner.
 */
function quizzableFactsOf(index: ContentIndex, entityId: EntityId): readonly FactId[] {
  const ids: FactId[] = []
  for (const fact of index.facts.values()) {
    if (fact.entity === entityId && isQuizzable(fact)) ids.push(fact.id)
  }
  return ids
}

export function entityProgress(
  index: ContentIndex,
  entityId: EntityId,
  memory: ReadonlyMap<FactId, MemoryState>,
  now: number,
): EntityProgress {
  const factIds = quizzableFactsOf(index, entityId)

  let weakest: Mastery = 'burnished'
  let learned = 0
  let due = 0
  let seen = 0

  for (const factId of factIds) {
    const state = memory.get(factId)
    // `now` matters: mastery is a function of retrievability, so a fact learned in
    // March is not still "mastered" in December without review. Passing a fixed time
    // would make the grid claim knowledge the scheduler has already written off.
    const mastery: Mastery = state ? masteryOf(state, now) : 'unseen'
    if (rank(mastery) < rank(weakest)) weakest = mastery
    if (isLearned(mastery)) learned++
    if (state !== undefined) seen++
    if (state && state.dueAt <= now) due++
  }

  // An entity with no quizzable facts is not "burnished" — it is not assessable at
  // all, and reporting mastery for it would inflate every total above it.
  if (factIds.length === 0) {
    return {
      entityId,
      mastery: 'unseen',
      factsTotal: 0,
      factsLearned: 0,
      factsDue: 0,
      factsSeen: 0,
      complete: false,
    }
  }

  return {
    entityId,
    mastery: weakest,
    factsTotal: factIds.length,
    factsLearned: learned,
    factsDue: due,
    factsSeen: seen,
    complete: isLearned(weakest),
  }
}

/** Every entity in a region, with the region's totals. */
export function regionProgress(
  index: ContentIndex,
  region: string,
  memory: ReadonlyMap<FactId, MemoryState>,
  now: number,
): RegionProgress {
  const entities = [...index.entities.values()].filter((e) => e.region === region)
  return summarise(region, entities, index, memory, now)
}

/**
 * Every region present in the content, weakest-first is NOT the order — regions come
 * back sorted by code so the grid does not reshuffle as a user learns.
 */
export function worldProgress(
  index: ContentIndex,
  memory: ReadonlyMap<FactId, MemoryState>,
  now: number,
): WorldProgress {
  const byRegion = new Map<string, Entity[]>()
  for (const entity of index.entities.values()) {
    if (entity.region === undefined) continue
    const bucket = byRegion.get(entity.region)
    if (bucket) bucket.push(entity)
    else byRegion.set(entity.region, [entity])
  }

  const regions = [...byRegion.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([region, entities]) => summarise(region, entities, index, memory, now))

  const totals = regions.reduce(
    (acc, r) => ({
      entitiesTotal: acc.entitiesTotal + r.entitiesTotal,
      entitiesComplete: acc.entitiesComplete + r.entitiesComplete,
      factsTotal: acc.factsTotal + r.factsTotal,
      factsLearned: acc.factsLearned + r.factsLearned,
      factsDue: acc.factsDue + r.factsDue,
    }),
    { entitiesTotal: 0, entitiesComplete: 0, factsTotal: 0, factsLearned: 0, factsDue: 0 },
  )

  return {
    regions,
    ...totals,
    fraction: totals.factsTotal === 0 ? 0 : totals.factsLearned / totals.factsTotal,
  }
}

function summarise(
  region: string,
  entities: readonly Entity[],
  index: ContentIndex,
  memory: ReadonlyMap<FactId, MemoryState>,
  now: number,
): RegionProgress {
  let entitiesComplete = 0
  let entitiesStarted = 0
  let factsTotal = 0
  let factsLearned = 0
  let factsDue = 0

  for (const entity of entities) {
    const progress = entityProgress(index, entity.id, memory, now)
    if (progress.complete) entitiesComplete++
    if (progress.factsSeen > 0) entitiesStarted++
    factsTotal += progress.factsTotal
    factsLearned += progress.factsLearned
    factsDue += progress.factsDue
  }

  return {
    region,
    entitiesTotal: entities.length,
    entitiesComplete,
    entitiesStarted,
    factsTotal,
    factsLearned,
    factsDue,
    // By facts, not by entities: a region of 50 countries where the user has learned
    // half of each shows 50 %, not 0 %. Progress a user cannot see is progress they
    // assume they have not made.
    fraction: factsTotal === 0 ? 0 : factsLearned / factsTotal,
  }
}
