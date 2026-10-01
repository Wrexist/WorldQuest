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
import { masteryOf, retrievability } from './fsrs.js'

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
  /**
   * Share of recent answers that were right, 0–1, or null while there is too little to read.
   * Moves the mix: a learner answering nearly everything is offered more that is new, one
   * who is struggling is offered more of what they have already met. See `PACING`.
   */
  readonly recentAccuracy?: number | null
}

/** The 60/30/10 split: due reviews · new facts · struggling items. */
const MIX = { due: 0.6, fresh: 0.3, struggling: 0.1 } as const

/**
 * The same split, moved by how the learner is actually doing — the pacing a good tutor does
 * without being asked, and the part of "adaptive" that a fixed 60/30/10 is not.
 *
 * - **Sailing** (≥ 92 % right): a learner who knows nearly everything they are asked is being
 *   under-challenged by reviews of things they know. Fresh material rises to 45 %.
 * - **Struggling** (≤ 65 % right): piling new facts on top of ones that are not holding is how
 *   a learner decides they are bad at geography. Reviews rise to 70 % and fresh material falls
 *   to 20 %, which is also the floor (`MIN_NEW_SHARE`) — never to nothing, because a lesson
 *   with no new fact in it is a treadmill however kind the reason.
 *
 * The thresholds are the ramp's (`RAMP_AHEAD` and `RAMP_BEHIND`), for the same reason: they
 * are authored, and the first thing to tune against `review_log` once it has users.
 */
const PACING = {
  sailing: { at: 0.92, mix: { due: 0.45, fresh: 0.45, struggling: 0.1 } },
  struggling: { at: 0.65, mix: { due: 0.7, fresh: 0.2, struggling: 0.1 } },
} as const

const paced = (accuracy: number | null | undefined): { due: number; fresh: number; struggling: number } => {
  if (accuracy === null || accuracy === undefined || !Number.isFinite(accuracy)) return { ...MIX }
  if (accuracy >= PACING.sailing.at) return { ...PACING.sailing.mix }
  if (accuracy <= PACING.struggling.at) return { ...PACING.struggling.mix }
  return { ...MIX }
}

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
  const { candidates, newFactIds, count, now, rng, topicFilter, catchUpMode, recentAccuracy } = input
  const inTopic = (id: FactId) => (topicFilter ? topicFilter(id) : true)

  const inScope = candidates.filter((c) => inTopic(c.factId))
  const active = inScope.filter((c) => !c.suspended)

  /**
   * Due reviews, the ones closest to being FORGOTTEN first.
   *
   * This was "most overdue first", which sounds the same and is not. Overdue is a function of
   * the schedule: a fact with a stability of two weeks that is three days late is MORE overdue
   * than a fact with a stability of one day that is two days late, and the second is the one
   * the learner has probably already lost. Retrievability — the probability of recalling it
   * right now — is what FSRS actually computes, and ordering by it spends a short lesson on
   * the facts where a review does the most good. Ties fall back to overdue-ness.
   */
  const due = active
    .filter((c) => c.dueAt <= now)
    .sort((a, b) => retrievability(a, now) - retrievability(b, now) || a.dueAt - b.dueAt)

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
      : paced(recentAccuracy)

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
