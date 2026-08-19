/**
 * FSRS scheduler — the core of the WorldQuest learning engine.
 *
 * Pure. No clock, no randomness, no I/O. The same module runs in the app for
 * optimistic feedback and in the `submit-lesson` edge function for authoritative
 * grading, so the two cannot drift.
 *
 * Spec:     docs/systems/learning-engine.md
 * Decision: docs/adr/0004-spaced-repetition.md
 */

import { clamp, MS_PER_DAY } from '../shared/index.js'
import {
  DEFAULT_TARGET_RETENTION,
  LEECH_COOLDOWN_DAYS,
  LEECH_LAPSE_THRESHOLD,
  MAX_CREDITED_ANSWER_MS,
  type FactId,
  type Mastery,
  type MemoryState,
  type Rating,
  type ReviewEvent,
  type ReviewInput,
} from './types.js'

/** Forgetting-curve constants. R(t,S) = (1 + FACTOR·t/S)^DECAY */
const DECAY = -0.5
const FACTOR = 19 / 81

/**
 * Default FSRS weights.
 *
 * Index map: w0–w3 initial stability per rating · w4–w5 initial difficulty ·
 * w6 difficulty delta · w7 mean reversion · w8–w10 stability after recall ·
 * w11–w14 stability after a lapse · w15 hard penalty · w16 easy bonus.
 *
 * VERIFIED 2026-08-19 against `ts-fsrs@4.7.1`, whose default `w` is exactly this vector
 * followed by `0.51655, 0.6621` — FSRS-5's two same-day-review parameters, which this
 * scheduler has no path for and deliberately does not carry. `fsrs.reference.test.ts`
 * pins both the vector and four golden traces, and it found a real defect the moment it
 * existed: see `review()` on why stability reads the PRE-update difficulty.
 *
 * A sanity check that catches a bad vector immediately: initial difficulty for a "Good"
 * first answer must land near the middle of the 1–10 range, not at a clamp boundary.
 * `pnpm engines:simulate` asserts this.
 *
 * After ~50k reviews, re-fit on our own `review_log` per cohort. The exact numbers
 * matter less than they look: `rebuild()` recomputes all state from the append-only
 * log, so changing weights never costs a user their progress.
 */
export const DEFAULT_WEIGHTS = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898,
] as const

export type Weights = readonly number[]

const MIN_STABILITY = 0.01
const MAX_STABILITY = 36500
const MIN_DIFFICULTY = 1
const MAX_DIFFICULTY = 10

/**
 * A product cap, not a mathematical one. FSRS will happily schedule a well-known
 * fact decades out; a geography app that never checks in on Japan again has
 * quietly stopped being able to claim you know it. Burnished facts are reviewed
 * about yearly — see the mastery table in docs/systems/learning-engine.md.
 */
const MAX_INTERVAL_DAYS = 365

/** Never schedule inside an hour, even after a lapse — that's a drill, not a review. */
const MIN_INTERVAL_DAYS = 1 / 24

/** Probability of recalling a fact right now, given its stability. */
export function retrievability(state: MemoryState, now: number): number {
  if (state.lastReviewAt === null) return 0
  const elapsedDays = Math.max(0, (now - state.lastReviewAt) / MS_PER_DAY)
  return Math.pow(1 + (FACTOR * elapsedDays) / state.stability, DECAY)
}

/**
 * Days until retrievability decays to `targetRetention`.
 *
 * targetRetention is a PRODUCT decision, not a technical one: a lower target means
 * fewer reviews and more new content (better for Emma and Ingrid), a higher target
 * means more reviews and higher accuracy (what Alex and Kenji want).
 */
export function intervalDays(stability: number, targetRetention: number): number {
  const r = clamp(targetRetention, 0.7, 0.99)
  return (stability / FACTOR) * (Math.pow(r, 1 / DECAY) - 1)
}

function initialStability(rating: Rating, w: Weights): number {
  return clamp(w[rating - 1]!, MIN_STABILITY, MAX_STABILITY)
}

function initialDifficulty(rating: Rating, w: Weights): number {
  return clamp(w[4]! - Math.exp(w[5]! * (rating - 1)) + 1, MIN_DIFFICULTY, MAX_DIFFICULTY)
}

function nextDifficulty(difficulty: number, rating: Rating, w: Weights): number {
  // Linear damping: difficulty moves less the closer it already is to the extreme.
  const delta = -w[6]! * (rating - 3)
  const damped = difficulty + (delta * (10 - difficulty)) / 9
  // Mean reversion towards the "easy" baseline, so a run of bad days doesn't
  // permanently mark a fact as impossible.
  const reverted = w[7]! * initialDifficulty(4, w) + (1 - w[7]!) * damped
  return clamp(reverted, MIN_DIFFICULTY, MAX_DIFFICULTY)
}

function stabilityAfterRecall(
  stability: number,
  difficulty: number,
  r: number,
  rating: Rating,
  w: Weights,
): number {
  const hardPenalty = rating === 2 ? w[15]! : 1
  const easyBonus = rating === 4 ? w[16]! : 1
  const growth =
    1 +
    Math.exp(w[8]!) *
      (11 - difficulty) *
      Math.pow(stability, -w[9]!) *
      (Math.exp(w[10]! * (1 - r)) - 1) *
      hardPenalty *
      easyBonus
  return clamp(stability * growth, MIN_STABILITY, MAX_STABILITY)
}

function stabilityAfterLapse(
  stability: number,
  difficulty: number,
  r: number,
  w: Weights,
): number {
  const next =
    w[11]! *
    Math.pow(difficulty, -w[12]!) *
    (Math.pow(stability + 1, w[13]!) - 1) *
    Math.exp(w[14]! * (1 - r))
  // A lapse must never increase stability.
  return clamp(Math.min(next, stability), MIN_STABILITY, MAX_STABILITY)
}

/**
 * The single scheduling entry point. Pure: same inputs → same output.
 */
export function review(input: ReviewInput, weights: Weights = DEFAULT_WEIGHTS): MemoryState {
  const { state, rating, now } = input
  const targetRetention = input.targetRetention ?? DEFAULT_TARGET_RETENTION
  const w = weights

  let stability: number
  let difficulty: number
  let reps: number
  let lapses: number
  const factId: FactId = input.factId

  // `state === null` only. It used to also treat `lastReviewAt === null` as a first
  // exposure, which silently discarded `reps` and `lapses` on any row that had them —
  // and a row with reps but no review date is a data incident, not a new card. Reading
  // it as "never seen" wipes the history that would let anyone diagnose it, and hands
  // the user a fresh initial stability for a fact they have failed six times.
  if (state === null) {
    stability = initialStability(rating, w)
    difficulty = initialDifficulty(rating, w)
    reps = 1
    lapses = rating === 1 ? 1 : 0
  } else {
    const r = retrievability(state, now)
    difficulty = nextDifficulty(state.difficulty, rating, w)
    /**
     * `state.difficulty`, not the `difficulty` computed one line above.
     *
     * FSRS derives the new stability from the difficulty as it stood BEFORE this answer.
     * This passed the updated value, and the error was invisible everywhere it was looked
     * for: difficulty does not depend on stability, so every D assertion matched the
     * reference exactly, and on a "Good" answer the difficulty barely moves so S agreed to
     * 0.16 %. It showed only on Hard and Easy, where D swings by a whole point.
     *
     * - **Easy** lowered D first, so `(11 - D)` was larger and stability came out up to
     *   **12.6 %** too high. Intervals too long — the fact returns after it is forgotten.
     * - **Hard** raised D first, suppressing stability by up to **8.2 %**. Intervals too
     *   short — busywork on exactly the items that are already hardest to face.
     *
     * Both are the wrong direction and both compound. 544 engine tests passed over it,
     * because every one of them asserts a property that a subtly wrong scheduler also has.
     */
    stability =
      rating === 1
        ? stabilityAfterLapse(state.stability, state.difficulty, r, w)
        : stabilityAfterRecall(state.stability, state.difficulty, r, rating, w)
    reps = state.reps + 1
    lapses = state.lapses + (rating === 1 ? 1 : 0)
  }

  /**
   * A leech rests; it is not buried.
   *
   * This was `lapses >= LEECH_LAPSE_THRESHOLD` — and `lapses` never decreases, while
   * `selectItems` dropped every suspended candidate. So crossing the threshold once
   * removed a fact from rotation for the life of the account: it could not be shown, so
   * it could not be answered correctly, so it could not be released. The user was told
   * they had not learned it, for ever, by the same system that had stopped teaching it.
   *
   * Suspension is now a property of THIS answer rather than of the whole history. Failing
   * again while over the threshold rests the fact; getting it right releases it, in one
   * answer. `lapses` is untouched — the FSRS formulas and the struggling bucket both read
   * it, and rewriting history to fix a policy would be the wrong lever.
   */
  const isLeech = lapses >= LEECH_LAPSE_THRESHOLD
  const suspended = isLeech && rating === 1

  const days = clamp(
    intervalDays(stability, targetRetention),
    MIN_INTERVAL_DAYS,
    MAX_INTERVAL_DAYS,
  )
  // Resting means distance. The scheduler would hand a fresh lapse an interval measured
  // in hours, which is precisely the drilling the leech policy exists to stop.
  const restDays = suspended ? Math.max(days, LEECH_COOLDOWN_DAYS) : days
  const dueAt = now + restDays * MS_PER_DAY

  return {
    factId,
    stability,
    difficulty,
    reps,
    lapses,
    lastReviewAt: now,
    dueAt,
    suspended,
  }
}

/**
 * The mastery boundaries, named because they exist in two languages.
 *
 * `user_facts.mastery` is derived by a Postgres trigger from the same three rules —
 * see supabase/migrations/20260805090000_mastery_is_derived.sql. Two copies of a rule
 * are one copy and one bug waiting for the input that separates them, and this repo has
 * shipped that exact shape before. It cannot be one copy here: a trigger cannot import
 * TypeScript. So the numbers get names, and `fsrs.test.ts` reads the migration and
 * asserts the CASE uses these ones.
 *
 * `familiar` is deliberately absent. It is the only level that depends on
 * retrievability — an answer that changes while the row sits still — so it has no
 * stored form, and the migration says so at length.
 */
export const MASTERY_THRESHOLDS = {
  burnishedStability: 180,
  masteredStability: 21,
  masteredReps: 5,
  proficientStability: 7,
  proficientReps: 3,
  proficientLapses: 1,
  familiarStability: 1,
  familiarRetrievability: 0.9,
} as const

/**
 * The UI label. Boundaries are exact and tested — `mastered` is the claim behind
 * "183 / 195 countries", so it has to mean something specific.
 */
export function masteryOf(state: MemoryState | null, now: number): Mastery {
  if (state === null || state.lastReviewAt === null) return 'unseen'

  const t = MASTERY_THRESHOLDS
  const stabilityDays = state.stability
  const r = retrievability(state, now)

  if (stabilityDays >= t.burnishedStability && state.lapses === 0) return 'burnished'
  if (stabilityDays >= t.masteredStability && state.reps >= t.masteredReps) return 'mastered'
  if (
    stabilityDays >= t.proficientStability &&
    state.reps >= t.proficientReps &&
    state.lapses <= t.proficientLapses
  ) {
    return 'proficient'
  }
  if (stabilityDays >= t.familiarStability && r >= t.familiarRetrievability) return 'familiar'
  return 'learning'
}

/**
 * Turn a binary answer plus timing into an FSRS grade.
 *
 * Hesitation is real signal about memory strength; treating every correct answer
 * identically throws it away. This mapping is one of the highest-leverage tuning
 * knobs in the product — change it with simulation, not intuition.
 *
 * `medianMs` is the user's own median for this template type, with a global prior.
 */
export function deriveRating(
  correct: boolean,
  elapsedMs: number,
  medianMs: number,
): Rating {
  if (!correct) return 1

  // Past the credible window the user put the phone down, so we have NO timing
  // signal — fall back to Good rather than inferring from the elapsed value.
  // Clamping instead would be worse than useless: for a slow template (say a
  // 60 s median) a capped 30 s reads as *below* the fast threshold, and someone
  // who wandered off for ten minutes gets scored as instant recall.
  if (elapsedMs > MAX_CREDITED_ANSWER_MS) return 3

  // Sub-400ms answers are not credible either, but they are excluded upstream —
  // they earn no XP and never reach the scheduler. See the anti-cheat table in
  // docs/engineering/security-privacy.md.
  if (elapsedMs > medianMs * 2.5) return 2
  if (elapsedMs < medianMs * 0.6) return 4
  return 3
}

/**
 * Replay an append-only review log to rebuild memory state.
 *
 * This is not a convenience — it is the recovery guarantee that makes every other
 * decision here reversible. `review_log` is authoritative; `user_facts` is a cache.
 * If weights change, a bug corrupts state, or we migrate algorithms, we recompute.
 * Users never lose progress to an engine change.
 */
export function rebuild(
  log: readonly ReviewEvent[],
  targetRetention: number = DEFAULT_TARGET_RETENTION,
  weights: Weights = DEFAULT_WEIGHTS,
): Map<FactId, MemoryState> {
  const byFact = new Map<FactId, MemoryState>()
  const ordered = [...log].sort((a, b) => a.at - b.at)

  for (const event of ordered) {
    const previous = byFact.get(event.factId) ?? null
    const next = review(
      {
        factId: event.factId,
        state: previous,
        rating: event.rating,
        now: event.at,
        targetRetention,
      },
      weights,
    )
    byFact.set(event.factId, next)
  }

  return byFact
}
