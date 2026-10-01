/**
 * The order a lesson is asked in.
 *
 * `selectItems` decides WHICH facts a lesson holds and `interleave` makes sure no two are
 * about the same entity back to back. Neither decides how the lesson FEELS from the first
 * question to the last, and a random order feels like a random order: a hard new fact first
 * thing, three easy ones in a row, the worst one last with the heart already gone.
 *
 * Duolingo's lessons are not random, and neither are good exams. The shape here:
 *
 * 1. **A warm-up.** The easiest one or two questions first. The first answer is the one a
 *    nervous learner is most likely to get wrong for reasons that are not the fact, and a
 *    miss on question one sets how the other nine are played.
 * 2. **A climb.** The rest in rising difficulty, so the hardest question arrives when the
 *    learner is warmest and has the most to hold it against.
 * 3. **A win to finish.** The next-easiest question goes LAST (in a lesson long enough to
 *    spare one). What a person remembers about a session is its peak and its end, and ending
 *    on a right answer is how "that was a good lesson" gets decided.
 *
 * ## What counts as hard
 *
 * Not only the authored `Fact.difficulty`. A fact the learner has seen and is about to forget
 * is harder TODAY than the number says, and a brand-new one is harder than a review of the
 * same difficulty, so both add to it. `hardnessOf` is the one place that arithmetic lives.
 *
 * ## Variety is part of the shape
 *
 * Reordering by difficulty would happily put four capital questions in a row, because capitals
 * are easy. So the order is repaired: no two questions about the same entity adjacent (what
 * `interleave` already promised, which a sort can break) and never three in a row about the
 * same attribute. The repair is greedy and stable — it takes the next question in shape order
 * that breaks neither rule — so it bends the shape as little as the rules allow.
 *
 * Pure and deterministic: no clock, no randomness. The order is a function of the lesson.
 */

import { retrievability } from '../learning/fsrs.js'
import type { FactId, MemoryState } from '../learning/types.js'
import type { Question } from '../content/types.js'

export type ShapeContext = {
  /** What the learner remembers, by fact. A fact with no entry is one they have never seen. */
  readonly memory: ReadonlyMap<FactId, MemoryState>
  readonly now: number
  /** The attribute a question is about; the engine has no opinion on what attributes are. */
  readonly attributeOf: (question: Question) => string | undefined
}

/** How much harder a question is today than its authored difficulty says. */
export function hardnessOf(question: Question, ctx: Pick<ShapeContext, 'memory' | 'now'>): number {
  const base = question.item.difficulty
  const state = ctx.memory.get(question.item.factId)
  // Never seen: harder than a review of the same fact, which at least has a trace to find.
  if (state === undefined || state.reps <= 0) return base + 1
  // Seen: as hard as it is close to being forgotten. Retrievability 1 adds nothing, 0.5 adds one.
  const forgetting = 1 - Math.min(1, Math.max(0, retrievability(state, ctx.now)))
  return base + 2 * forgetting
}

/** The smallest lesson worth shaping: below this there is no "middle" to climb through. */
const MIN_SHAPED = 4
/** A lesson at least this long can spare its next-easiest question for the finish. */
const MIN_FOR_FINISH = 6

export function shapeLesson(questions: readonly Question[], ctx: ShapeContext): Question[] {
  const n = questions.length
  if (n < MIN_SHAPED) return [...questions]

  const scored = questions
    .map((question, i) => ({ question, i, hardness: hardnessOf(question, ctx) }))
    // Stable on the original position, so equal difficulty keeps the order interleave chose.
    .sort((a, b) => a.hardness - b.hardness || a.i - b.i)

  const warmUp = Math.min(2, Math.max(1, Math.round(n * 0.2)))
  const finish = n >= MIN_FOR_FINISH ? 1 : 0
  const target = [
    ...scored.slice(0, warmUp),
    ...scored.slice(warmUp + finish),
    ...scored.slice(warmUp, warmUp + finish),
  ]

  const pool = [...target]
  const placed: typeof target = []
  const attribute = (entry: (typeof target)[number]): string | undefined => ctx.attributeOf(entry.question)

  const allowed = (entry: (typeof target)[number]): boolean => {
    const last = placed[placed.length - 1]
    if (last !== undefined && last.question.item.entityId === entry.question.item.entityId) return false
    const a = attribute(entry)
    const before = placed[placed.length - 2]
    if (a !== undefined && last !== undefined && before !== undefined && attribute(last) === a && attribute(before) === a) {
      return false
    }
    return true
  }

  while (pool.length > 0) {
    let pick = pool.findIndex(allowed)
    // Nothing left satisfies both rules — a lesson that is all one entity, say. Shape wins.
    if (pick < 0) pick = 0
    placed.push(pool.splice(pick, 1)[0]!)
  }
  /**
   * Put the win back at the end if the variety rules pushed it out.
   *
   * The greedy pass above takes the finale last, but a question it could not place without
   * breaking a rule is deferred, and a deferral can leave a hard question in the last slot.
   * So: if the last question is not the easiest of the lesson's second half, try moving the
   * easiest one that is to the end, and keep the move only if the WHOLE order still obeys both
   * rules. n is at most twenty, so trying each candidate in full is cheaper than being clever.
   */
  const valid = (sequence: readonly (typeof target)[number][]): boolean =>
    sequence.every((entry, i) => {
      const prev = sequence[i - 1]
      if (prev !== undefined && prev.question.item.entityId === entry.question.item.entityId) return false
      const a = attribute(entry)
      const before = sequence[i - 2]
      return !(a !== undefined && prev !== undefined && before !== undefined && attribute(prev) === a && attribute(before) === a)
    })

  if (finish > 0 && valid(placed)) {
    const last = placed[placed.length - 1]!
    const candidates = placed
      .slice(warmUp, -1)
      .filter((entry) => entry.hardness < last.hardness)
      .sort((a, b) => a.hardness - b.hardness || a.i - b.i)
    for (const candidate of candidates) {
      const trial = [...placed.filter((entry) => entry !== candidate), candidate]
      if (valid(trial)) return trial.map((entry) => entry.question)
    }
  }
  return placed.map((entry) => entry.question)
}
