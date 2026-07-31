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
}

const DEFAULT_MEDIAN_MS = 8_000

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

      // Re-answering something already mastered the same day is near-worthless.
      // This is what stops XP tracking activity instead of learning.
      const alreadyMastered = masteredBefore.has(answer.factId)
      rawXp += alreadyMastered
        ? BALANCE.xp.repeatMasteredSameDay
        : BALANCE.xp.correctAnswer
      coins += BALANCE.coins.correctAnswer

      if (wasOverdue) rawXp += BALANCE.xp.overdueReviewBonus

      if (
        answer.elapsedMs < 3_000 &&
        speedBonuses < BALANCE.xp.speedBonusMaxPerLesson
      ) {
        rawXp += BALANCE.xp.speedBonus
        speedBonuses++
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
  }
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
