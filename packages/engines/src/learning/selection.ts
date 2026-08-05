/**
 * Item selection — deciding what the user sees next.
 *
 * Pure and deterministic given the same Rng seed, because friend challenges require
 * both players to get identical questions and every test asserts reproducibility.
 *
 * Spec: docs/systems/learning-engine.md §3
 */

import { shuffle, type Rng } from '../shared/index.js'
import { LEECH_LAPSE_THRESHOLD, type FactId, type MemoryState } from './types.js'
import { masteryOf } from './fsrs.js'

export type SelectionInput = {
  /** Existing memory states to draw reviews from. */
  readonly candidates: readonly MemoryState[]
  /** Facts the user has never seen, ordered easiest-first by authored difficulty. */
  readonly newFactIds: readonly FactId[]
  readonly count: number
  readonly now: number
  readonly rng: Rng
  /** Set when the user chose a topic. Free topic choice is non-negotiable (Leo). */
  readonly topicFilter?: (id: FactId) => boolean
  /** Opt-in only. Without it, the new-item floor always applies. */
  readonly catchUpMode?: boolean
}

/** The 60/30/10 split: due reviews · new facts · struggling items. */
const MIX = { due: 0.6, fresh: 0.3, struggling: 0.1 } as const

/**
 * Reviews-only sessions feel like a treadmill, and a treadmill is the top reason
 * people abandon spaced-repetition tools. Never go below this share of new content
 * unless the user explicitly asked to catch up.
 */
const MIN_NEW_SHARE = 0.2

/** Above this, we rebalance towards reviews — gently, and never with a red badge. */
const BACKLOG_THRESHOLD = 50
const BACKLOG_MIX = { due: 0.85, fresh: 0.15 } as const

export const MIN_LESSON_ITEMS = 5
export const MAX_LESSON_ITEMS = 20

/**
 * A lesson is a fixed-size unit of about two minutes. The daily goal controls how
 * many lessons a day, NOT how long one lesson is — see lessonsPerDay().
 *
 * Deriving length from the daily goal directly (goal ÷ item time) collapses: with
 * realistic item times every goal from 5 to 20 minutes lands above the 20-item cap,
 * so a 5-minute user and a 20-minute user get identical lessons and the setting does
 * nothing. Sizing the lesson and counting lessons keeps "five minutes is a complete
 * experience" true at every goal.
 */
const TARGET_LESSON_MS = 120_000

export function lessonLength(medianItemMs: number): number {
  const raw = Math.round(TARGET_LESSON_MS / Math.max(medianItemMs, 1_000))
  return Math.min(MAX_LESSON_ITEMS, Math.max(MIN_LESSON_ITEMS, raw))
}

/** How many lessons make up the user's chosen daily goal. Always at least one. */
export function lessonsPerDay(dailyGoalMinutes: number, medianItemMs: number): number {
  const perLessonMs = lessonLength(medianItemMs) * Math.max(medianItemMs, 1_000)
  return Math.max(1, Math.round((dailyGoalMinutes * 60_000) / perLessonMs))
}

/** Entity prefix of a fact id: 'geo.JP.capital' → 'geo.JP'. Used for interleaving. */
function entityOf(factId: FactId): string {
  const parts = factId.split('.')
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : factId
}

/**
 * Interleaving beats blocking for retention, and blocked repetition simply feels
 * broken to users. Never two consecutive items about the same entity.
 */
function interleave(ids: readonly FactId[], rng: Rng): FactId[] {
  const pool = shuffle(ids, rng)
  const out: FactId[] = []
  const deferred: FactId[] = []

  for (const id of pool) {
    const previous = out[out.length - 1]
    if (previous !== undefined && entityOf(previous) === entityOf(id)) {
      deferred.push(id)
    } else {
      out.push(id)
    }
  }

  // Re-place deferred items wherever they no longer collide; append the rest.
  for (const id of deferred) {
    const slot = out.findIndex(
      (existing, i) =>
        entityOf(existing) !== entityOf(id) &&
        (out[i + 1] === undefined || entityOf(out[i + 1]!) !== entityOf(id)),
    )
    if (slot === -1) out.push(id)
    else out.splice(slot + 1, 0, id)
  }

  return out
}

/**
 * Compose the next lesson.
 *
 * Degrades sanely when a bucket is empty — a new user with no due items gets 90 %
 * new content rather than a short lesson, and we never return an empty queue.
 */
export function selectItems(input: SelectionInput): FactId[] {
  const { candidates, newFactIds, count, now, rng, topicFilter, catchUpMode } = input
  const inTopic = (id: FactId) => (topicFilter ? topicFilter(id) : true)

  const inScope = candidates.filter((c) => inTopic(c.factId))
  const active = inScope.filter((c) => !c.suspended)

  const due = active
    .filter((c) => c.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt) // most overdue first

  /**
   * Leeches that have finished resting.
   *
   * Suspended candidates used to be filtered out here and never came back, which turned
   * a rest into a life sentence — the fact could not be shown, so it could not be got
   * right, so it could not be released. `review()` now clears `suspended` on the first
   * correct answer, and this is the slot that gives it the chance to be one.
   *
   * They rejoin through `struggling` rather than `due` on purpose. The mix caps that
   * bucket at 10 %, so a backlog of leeches can never crowd out the reviews and new
   * content a session is actually for — which is the failure mode that made dropping
   * them look reasonable in the first place.
   */
  const resting = inScope.filter((c) => c.suspended && c.dueAt <= now)

  const struggling = [
    ...active.filter(
      (c) =>
        c.lapses >= 4 &&
        c.lapses < LEECH_LAPSE_THRESHOLD &&
        masteryOf(c, now) !== 'proficient' &&
        masteryOf(c, now) !== 'mastered' &&
        masteryOf(c, now) !== 'burnished',
    ),
    // No mastery filter: a rested leech is struggling by definition.
    ...resting,
  ]

  const fresh = newFactIds.filter(inTopic)

  // Cold start: no history at all. Lead with new content.
  //
  // `resting` counts as history. Without it, a user whose facts have ALL become leeches
  // reads as a brand-new user: the mix goes to 90 % fresh with `struggling` at zero, and
  // the backfill below never looked at `resting` either — so the one slot that gives a
  // rested leech a chance to be answered correctly, and released, was closed in exactly
  // the case where every remaining fact needs it. The life sentence this block exists to
  // end, restored by the cold-start branch.
  const hasHistory = active.length > 0 || resting.length > 0
  const mix = !hasHistory
    ? { due: 0, fresh: 0.9, struggling: 0 }
    : due.length > BACKLOG_THRESHOLD && !catchUpMode
      ? { ...BACKLOG_MIX, struggling: 0 }
      : MIX

  let dueTarget = Math.round(count * mix.due)
  let freshTarget = Math.round(count * mix.fresh)
  const strugglingTarget = Math.round(count * (mix.struggling ?? 0))

  // The floor that stops a session becoming pure review.
  if (!catchUpMode && fresh.length > 0) {
    const floor = Math.ceil(count * MIN_NEW_SHARE)
    if (freshTarget < floor) {
      const shortfall = floor - freshTarget
      freshTarget = floor
      dueTarget = Math.max(0, dueTarget - shortfall)
    }
  }

  const picked: FactId[] = [
    ...due.slice(0, dueTarget).map((c) => c.factId),
    ...fresh.slice(0, freshTarget),
    ...struggling.slice(0, strugglingTarget).map((c) => c.factId),
  ]

  // Backfill from whatever is available rather than returning a short lesson.
  const seen = new Set(picked)
  const backfill = [
    ...due.map((c) => c.factId),
    ...fresh,
    ...active.map((c) => c.factId),
    // Last, because the 10 % cap above is the real allowance for them and this is only
    // the alternative to returning a short lesson. Still present, because "nothing else
    // to show" is precisely when a rested leech should get its chance.
    ...resting.map((c) => c.factId),
  ]
  for (const id of backfill) {
    if (picked.length >= count) break
    if (!seen.has(id)) {
      picked.push(id)
      seen.add(id)
    }
  }

  return interleave(picked.slice(0, count), rng)
}
