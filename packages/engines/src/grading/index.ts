/**
 * Grading — the function the client and the server both call.
 *
 * The client runs it to show +10 XP instantly. The `submit-lesson` edge function
 * runs the SAME code against the same answers and returns the authoritative result.
 * Because it is one module rather than two implementations, they cannot disagree
 * about what a user knows or what they earned.
 *
 * Pure. Everything it needs arrives as an argument.
 *
 * Spec: docs/engineering/architecture.md §5
 */

import { BALANCE } from '../xp/balance.js'
import { deriveRating, masteryOf, review } from '../learning/fsrs.js'
import { MASTERY_ORDER } from '../progression/index.js'
import {
  MIN_CREDIBLE_ANSWER_MS,
  type FactId,
  type Mastery,
  type MemoryState,
  type ReviewEvent,
} from '../learning/types.js'
import type { AnsweredItem } from '../lesson/machine.js'

export type GradeInput = {
  readonly lessonId: string
  readonly answers: readonly AnsweredItem[]
  /** Current memory state per fact. Missing means first exposure. */
  readonly memory: ReadonlyMap<FactId, MemoryState>
  /**
   * Submission time. Grading itself uses each answer's own `answeredAt`, so an
   * offline lesson replayed hours later still schedules from when it was actually
   * answered — not from when the queue happened to flush.
   */
  readonly now: number
  readonly targetRetention?: number
  /** Per-template median answer time, for deriving a 1–4 rating. */
  readonly medianMsByTemplate?: ReadonlyMap<string, number>
  /** XP already earned today, for the soft cap. */
  readonly xpEarnedToday?: number
  readonly isFirstLessonOfDay?: boolean
  /** Facts already mastered before this lesson, for the repeat penalty. */
  readonly masteredBefore?: ReadonlySet<FactId>
}

export type MasteryChange = {
  readonly factId: FactId
  readonly from: Mastery
  readonly to: Mastery
}

export type GradeResult = {
  readonly lessonId: string
  readonly items: number
  readonly correct: number
  readonly accuracy: number
  readonly xpAwarded: number
  readonly coinsAwarded: number
  readonly reviews: readonly ReviewEvent[]
  readonly updatedMemory: ReadonlyMap<FactId, MemoryState>
  readonly masteryChanges: readonly MasteryChange[]
  readonly perfect: boolean
  /** Answers excluded as not credible — surfaced so a spike is visible. */
  readonly rejected: number
  /**
   * Reviews the scheduler had asked for, answered correctly.
   *
   * The number `ach.review.faithful` counts — 25 / 250 / 1000 of them — and the one
   * achievement in the catalogue that measures the behaviour this product exists to
   * produce, rather than volume. It was computed here (`wasOverdue`) and thrown away, so
   * the event had no producer and all three tiers sat at zero.
   */
  readonly overdueCleared: number
  /**
   * Hearts spent during this lesson, DERIVED here rather than reported by the client.
   *
   * It used to arrive in the submit payload. The server range-checked it and wrote it
   * to `lessons.hearts_lost` — so any authenticated caller could pick the number,
   * within bounds, and `docs/systems/xp-economy.md §7` watches heart-block rate per
   * accuracy band as an economy health metric. A metric the measured party can set is
   * not a measurement, and the whole argument of §3 — that hearts must protect the
   * struggling learner most — is settled by reading exactly this number back.
   *
   * Nothing is trusted to compute it. `wasCorrect` is already re-decided from the
   * answer key before grading, `memory` is the server's own record of what the user
   * had seen, and the replay below is the same rule set as `lesson/machine.ts`,
   * against the same BALANCE constants. It is not an anti-cheat check bolted on; it
   * is the same derivation, run where the data is authoritative.
   */
  readonly heartsLost: number
}

const DEFAULT_MEDIAN_MS = 8_000

/**
 * What one answer is worth. The per-item half of the reward rules.
 *
 * `speedBonus` is reported rather than left for the caller to re-derive. The grader has
 * to know whether a bonus was paid, because the next answer's eligibility depends on the
 * running count — and it used to answer that by repeating the `elapsedMs < SPEED_BONUS_MS
 * && used < max` condition beside the call. Two copies of a rule drift; the one that pays
 * and the one that counts drifting apart means a lesson pays more bonuses than it allows.
 */
export type Award = {
  readonly xp: number
  readonly coins: number
  /** This answer was paid a speed bonus, so it counts against the per-lesson cap. */
  readonly speedBonus: boolean
}

export type AwardInput = {
  readonly wasCorrect: boolean
  readonly elapsedMs: number
  /** The scheduler asked for this review — see `overdueReviewBonus`. */
  readonly wasOverdue: boolean
  /** Already at `mastered` or better before this lesson. */
  readonly alreadyKnown: boolean
  /** How many speed bonuses this lesson has already paid. */
  readonly speedBonusesUsed: number
}

/**
 * Under this, an answer is fast enough to be worth a bonus.
 *
 * Exported because the lesson screen previews the award as the user answers, and it was
 * counting its own eligible answers against a local `3_000`. A threshold written twice is
 * a preview that can promise a bonus the grader does not pay.
 */
export const SPEED_BONUS_MS = 3_000

/**
 * The reward for a single answer, in one place.
 *
 * Extracted so the feedback card can show what the user ACTUALLY earned. It used to
 * render the string `"+10"` and `"+5"`, hardcoded — which broke the rule that reward
 * numbers live only in the balance table, and was also simply untrue: the real figure
 * is 2 for a known fact that was not due, 12 for one the scheduler asked for, 14 with
 * the speed bonus, and a quarter of any of those past the daily soft cap.
 *
 * Importing `BALANCE.xp.correctAnswer` into the screen would have fixed the rule and
 * left the lie. A function both the grader and the screen call fixes both, and means
 * the two can never disagree about what a user just earned — the same argument that
 * makes `gradeLesson` itself one module rather than two.
 */
export function awardForAnswer(input: AwardInput): Award {
  if (!input.wasCorrect) return { xp: 0, coins: 0, speedBonus: false }

  const cheapRepeat = input.alreadyKnown && !input.wasOverdue
  let xp = cheapRepeat ? BALANCE.xp.repeatKnownNotDue : BALANCE.xp.correctAnswer

  if (input.wasOverdue) xp += BALANCE.xp.overdueReviewBonus

  const speedBonus =
    input.elapsedMs < SPEED_BONUS_MS &&
    input.speedBonusesUsed < BALANCE.xp.speedBonusMaxPerLesson
  if (speedBonus) xp += BALANCE.xp.speedBonus

  return { xp, coins: BALANCE.coins.correctAnswer, speedBonus }
}

export function gradeLesson(input: GradeInput): GradeResult {
  const {
    lessonId,
    answers,
    memory,
    targetRetention,
    medianMsByTemplate,
    xpEarnedToday = 0,
    isFirstLessonOfDay = false,
    masteredBefore = new Set<FactId>(),
  } = input

  const updatedMemory = new Map(memory)
  const reviews: ReviewEvent[] = []
  const masteryChanges: MasteryChange[] = []

  let correct = 0
  let rejected = 0
  let rawXp = 0
  let coins = 0
  let speedBonuses = 0
  let overdueCleared = 0

  // The heart replay. Mirrors `lesson/machine.ts` — same constants, same order — and
  // has to, because the client renders hearts live from the machine and this decides
  // what is recorded. Two implementations of one rule is the drift the whole
  // shared-grader design exists to prevent, so if either side changes, both do.
  //
  // `heartsEnabled` has no equivalent here because no caller sets it: Relaxed Mode and
  // Classroom Mode turn hearts off and are v2 (see roadmap), and `useLesson` takes the
  // `true` default on every path today. When they arrive they arrive as server-known
  // state — a mode, not a client claim — and this replay reads it like everything else.
  // Annotated, because `BALANCE` is `as const` and the initialiser would otherwise
  // narrow this to the literal type `5`.
  let hearts: number = BALANCE.hearts.max
  let correctRun = 0
  let heartsLost = 0

  for (const answer of answers) {
    // Sub-400ms answers are not credible. They earn nothing AND never reach the
    // scheduler — letting them through would corrupt the memory model, which is
    // worse than the XP they'd steal.
    if (answer.elapsedMs < MIN_CREDIBLE_ANSWER_MS) {
      rejected++
      continue
    }

    const medianMs = medianMsByTemplate?.get(answer.templateId) ?? DEFAULT_MEDIAN_MS
    const rating = deriveRating(answer.wasCorrect, answer.elapsedMs, medianMs)

    const before = updatedMemory.get(answer.factId) ?? null
    const wasOverdue = before !== null && before.dueAt <= answer.answeredAt
    const masteryBefore = masteryOf(before, answer.answeredAt)

    const after = review({
      factId: answer.factId,
      state: before,
      rating,
      now: answer.answeredAt,
      ...(targetRetention !== undefined ? { targetRetention } : {}),
    })
    updatedMemory.set(answer.factId, after)

    const masteryAfter = masteryOf(after, answer.answeredAt)
    if (masteryAfter !== masteryBefore) {
      masteryChanges.push({ factId: answer.factId, from: masteryBefore, to: masteryAfter })
    }

    reviews.push({
      factId: answer.factId,
      templateId: answer.templateId,
      rating,
      wasCorrect: answer.wasCorrect,
      elapsedMs: answer.elapsedMs,
      at: answer.answeredAt,
    })

    if (answer.wasCorrect) {
      correct++

      correctRun++
      // A run of correct answers earns a heart back. Capped, and counted on the run
      // rather than the total, so recovery is what pays.
      if (correctRun % BALANCE.hearts.restoreEveryCorrectStreak === 0) {
        hearts = Math.min(BALANCE.hearts.max, hearts + 1)
      }

      // The whole point of computing `wasOverdue`, and the half that was missing.
      // `ach.review.faithful` counts these, `recordServerOutcome` loops
      // `overdueCleared` times, and the number returned below was the 0 it was
      // initialised to — so the achievement this product's core loop earns had no
      // producer and sat at zero across all three tiers. The award used `wasOverdue`
      // and nothing counted it.
      if (wasOverdue) overdueCleared++

      /**
       * Re-answering something already known, when it was NOT due, is near-worthless.
       * This is what stops XP tracking activity instead of learning.
       *
       * `&& !wasOverdue` is the whole of the rule, and it was missing. The constant is
       * named `repeatKnownNotDue`; the check was `masteredBefore.has(factId)`, which
       * means "mastered at any point ever". So a fact learned three months ago and now
       * legitimately due came back at 2 XP, plus the 2 XP overdue bonus, against 10 for a
       * brand-new item — the economy paid nearly three times as much for grinding fresh
       * content as for the spaced review this product exists to deliver. An app whose
       * scheduler is the platform bet cannot price its own core loop last.
       *
       * With the clause, a due review of a mastered fact earns 10 + 2 and a new item
       * earns 10, which is the ordering the balance table's own comment on
       * `overdueReviewBonus` describes: "rewards coming back to an overdue review rather
       * than grinding fresh items."
       *
       * The bug was invisible until now for a second reason worth recording: nothing ever
       * wrote `user_facts.mastery`, so `masteredBefore` was always empty and this branch
       * had never once been taken in production. Fixing that column is what turned a
       * dormant mispricing into a live one.
       */
      const award = awardForAnswer({
        wasCorrect: true,
        elapsedMs: answer.elapsedMs,
        wasOverdue,
        alreadyKnown: masteredBefore.has(answer.factId),
        speedBonusesUsed: speedBonuses,
      })
      rawXp += award.xp
      coins += award.coins
      // Counted from what was actually paid, not from a second copy of the condition.
      if (award.speedBonus) speedBonuses++
    } else {
      correctRun = 0

      // New items never cost a heart — you cannot lose a life for not knowing
      // something you have never been taught (§3 rule 2). `before === null` is that
      // test, and it is the server's own memory record rather than a flag the payload
      // could set. Note it is read from `updatedMemory`, so a fact answered twice in
      // one lesson is new only the first time; the client's machine fixes `isNew` when
      // the question is built and would call it new both times. The two disagree only
      // in that case, and this side is the one that gets written down.
      const chargeable = before !== null || BALANCE.hearts.newItemsCostHearts
      if (chargeable) {
        // Only a heart actually held is a heart lost. Answering wrong at zero costs
        // nothing further — the lesson has already ended for hearts purposes, and
        // counting it would inflate the very metric §7 reads.
        if (hearts > 0) heartsLost++
        hearts = Math.max(0, hearts - 1)
      }
    }
  }

  const graded = answers.length - rejected
  const perfect = graded > 0 && correct === graded

  if (graded >= BALANCE.xp.minItemsForCompletionBonus) {
    rawXp += BALANCE.xp.lessonComplete
  }
  if (perfect && graded >= BALANCE.xp.minItemsForCompletionBonus) {
    rawXp += BALANCE.xp.perfectLesson
    coins += BALANCE.coins.perfectLesson
  }
  if (isFirstLessonOfDay) rawXp += BALANCE.xp.firstLessonOfDay

  // The only XP source volume cannot farm: it requires a fact to survive weeks.
  const newlyMastered = masteryChanges.filter(
    (c) => (c.to === 'mastered' || c.to === 'burnished') && c.from !== 'mastered' && c.from !== 'burnished',
  ).length
  rawXp += newlyMastered * BALANCE.xp.factMastered

  return {
    lessonId,
    items: graded,
    correct,
    accuracy: graded === 0 ? 0 : correct / graded,
    xpAwarded: applySoftCap(rawXp, xpEarnedToday),
    coinsAwarded: coins,
    reviews,
    updatedMemory,
    masteryChanges,
    perfect,
    rejected,
    overdueCleared,
    heartsLost,
  }
}

/**
 * How many facts ended the lesson knowing more than they started it.
 *
 * The number the summary screen leads with, and the only one on it a quiz app could
 * not also show: XP and coins measure activity, this measures learning.
 *
 * Filtered rather than `masteryChanges.length`, because that records movement in BOTH
 * directions — a lesson that knocked two facts back to `learning` would otherwise
 * report them as progress. Overstating what somebody learned is the same class of
 * error as shipping a wrong fact, and much harder to notice.
 *
 * Lives here rather than in the screen so the ordering has exactly one definition
 * (`MASTERY_ORDER`, in progression) and the server can compute the same figure.
 */
export function factsStrengthened(result: GradeResult): number {
  return result.masteryChanges.filter(
    (change) => MASTERY_ORDER.indexOf(change.to) > MASTERY_ORDER.indexOf(change.from),
  ).length
}

/**
 * Past the daily cap XP earns at a reduced rate, and we tell the user plainly
 * ("You've done plenty today"). Anti-grind, and on-brand rather than punitive.
 */
export function applySoftCap(xp: number, alreadyEarnedToday: number): number {
  const { dailySoftCap, softCapMultiplier } = BALANCE.xp
  const headroom = Math.max(0, dailySoftCap - alreadyEarnedToday)
  if (xp <= headroom) return Math.round(xp)
  const over = xp - headroom
  return Math.round(headroom + over * softCapMultiplier)
}
