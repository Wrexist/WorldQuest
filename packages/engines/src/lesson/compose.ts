/**
 * Lesson composition: memory state + content index → a queue of questions.
 *
 * This is where the learning engine and the content engine meet. It is the only
 * layer that knows both what the user remembers and what can be asked, which is why
 * it is also the layer that marks a question as new (heart accounting depends on it).
 *
 * Pure and deterministic given a seed.
 */

import { shuffle, type Rng } from '../shared/index.js'
import { selectItems, lessonLength } from '../learning/selection.js'
import type { FactId, MemoryState } from '../learning/types.js'
import {
  buildQuestion,
  pickItemForFact,
  type ContentIndex,
  type Question,
  type Template,
} from '../content/index.js'

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
  /**
   * What the host can actually put on screen. Omitted means "everything".
   *
   * A template's modality is a promise about presentation: `image` means the prompt
   * is a picture, and a host that cannot show that picture asks "Which country's
   * flag is this?" beside four country names and no flag — a question with no
   * answerable content, served to a child who then loses a heart on it.
   *
   * Nothing is lost by narrowing it. Every fact is reachable through more than one
   * template, and the siblings test the SAME fact — so the user's `user_facts` row
   * comes out identical either way. That is the same argument
   * `docs/design/accessibility.md` §8 makes for screen-reader templates, and it is
   * the reason both filters live here rather than in the UI: a question the host
   * cannot present should never enter the queue, not be skipped once it has.
   */
  readonly modalities?: readonly Template['modality'][]
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
    modalities,
    catchUpMode,
  } = input

  const seen = new Set(memory.map((m) => m.factId))
  const quizzableFacts = [...index.itemsByFact.keys()]

  /**
   * A fact is "new" when the user has no memory state for it at all.
   *
   * Sorted easiest-first, which is the order `selectItems` documents as its input and
   * simply trusted. It used to arrive in index insertion order — meaning the order the
   * pack files happened to be listed in the host's import statement — and `selectItems`
   * takes the HEAD of this list, so a user with an empty memory got the first N facts
   * of whichever pack was imported first and nothing else.
   *
   * Every user's memory is empty on day one, so the effect was total: capitals were
   * imported first, so a new user's lesson was capitals, and no flag or currency
   * question could appear until all sixty-five capitals had been seen. Three attributes
   * were authored, sourced and tested; one was reachable. The import order in one file
   * was deciding the curriculum.
   *
   * Ties are shuffled rather than left in pack order, because difficulty alone would
   * still hand out every difficulty-2 capital before the first difficulty-2 flag — the
   * same starvation on a smaller scale.
   */
  const newFactIds = shuffle(
    quizzableFacts.filter((id) => !seen.has(id)),
    rng,
  ).sort((a, b) => (index.facts.get(a)?.difficulty ?? 3) - (index.facts.get(b)?.difficulty ?? 3))

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
      ...(modalities !== undefined ? { modalities } : {}),
    })
    if (!item) continue

    const question = buildQuestion(index, item, locale, rng, { isNew: !seen.has(factId) })
    // A fact with no plausible distractors is skipped rather than asked badly.
    if (question) questions.push(question)
  }

  return questions
}
