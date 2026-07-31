/**
 * Lesson composition: memory state + content index → a queue of questions.
 *
 * This is where the learning engine and the content engine meet. It is the only
 * layer that knows both what the user remembers and what can be asked, which is why
 * it is also the layer that marks a question as new (heart accounting depends on it).
 *
 * Pure and deterministic given a seed.
 */

import type { Rng } from '../shared/index.js'
import { selectItems, lessonLength } from '../learning/selection.js'
import type { FactId, MemoryState } from '../learning/types.js'
import { buildQuestion, pickItemForFact, type ContentIndex, type Question } from '../content/index.js'

export type ComposeInput = {
  readonly index: ContentIndex
  readonly memory: readonly MemoryState[]
  readonly now: number
  readonly rng: Rng
  readonly locale: string
  /** Median answer time, used to size the lesson. */
  readonly medianItemMs?: number
  /** Explicit count overrides the size calculation (quests, challenges). */
  readonly count?: number
  readonly topicFilter?: (factId: FactId) => boolean
  /** Selects screen-reader-safe templates. Same facts, same progress. */
  readonly screenReaderOnly?: boolean
  readonly catchUpMode?: boolean
}

export function composeLesson(input: ComposeInput): readonly Question[] {
  const {
    index,
    memory,
    now,
    rng,
    locale,
    medianItemMs = 8_000,
    topicFilter,
    screenReaderOnly,
    catchUpMode,
  } = input

  const seen = new Set(memory.map((m) => m.factId))
  const quizzableFacts = [...index.itemsByFact.keys()]

  // A fact is "new" when the user has no memory state for it at all.
  const newFactIds = quizzableFacts.filter((id) => !seen.has(id))

  const count = input.count ?? lessonLength(medianItemMs)

  const chosen = selectItems({
    candidates: memory,
    newFactIds,
    count,
    now,
    rng,
    ...(topicFilter ? { topicFilter } : {}),
    ...(catchUpMode !== undefined ? { catchUpMode } : {}),
  })

  const questions: Question[] = []
  for (const factId of chosen) {
    const item = pickItemForFact(index, factId, rng, {
      ...(screenReaderOnly !== undefined ? { screenReaderOnly } : {}),
    })
    if (!item) continue

    const question = buildQuestion(index, item, locale, rng, { isNew: !seen.has(factId) })
    // A fact with no plausible distractors is skipped rather than asked badly.
    if (question) questions.push(question)
  }

  return questions
}
