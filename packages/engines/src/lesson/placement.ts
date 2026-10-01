/**
 * Placement: ten questions that say where to start.
 *
 * Onboarding asks "how well do you know the world?" and takes the learner's word for it, and
 * people are bad at that question in both directions — the confident skim past what they do not
 * know, the modest sit through what they do. Duolingo's answer is a short adaptive test, and
 * this is the same idea, kept deliberately small: two questions at each of the five difficulty
 * levels, easiest first, and what the learner gets right says how far up the scale they already
 * are.
 *
 * ## What it asks about
 *
 * Only facts tagged `core` — the basics the first packs were authored around — and only the
 * plain way of asking (a forward, four-option question). A placement that asked a flag as a
 * reverse code-lookup would be measuring how the question is asked, not how much the learner
 * knows, and one that asked about an obscure athlete would measure nothing useful at all.
 * "Core" is a content tag and not a geography word, so this module still knows no attributes.
 *
 * ## What it decides, and how little
 *
 * It returns a STARTING level (`new`, `some`, `confident` — the three the ramp already has) and
 * nothing else. It does not mark facts known, move a stage, or touch the scheduler: the answers
 * go up like any lesson's and teach FSRS what they teach. A learner who got a hard flag right
 * by luck is put one step too high, finds it hard, and the ramp's own accuracy nudge brings them
 * back — the same safety net that catches a wrong self-assessment, which is why a ten-question
 * test is enough.
 *
 * The result is monotone: answering one more question correctly can never lower the level.
 * Pure and deterministic, given the injected rng.
 */

import { shuffle, type Rng } from '../shared/index.js'
import { buildQuestion, itemsForFact } from '../content/index.js'
import type { ContentIndex, Question, Template } from '../content/types.js'
import type { StartLevel } from '../learning/ramp.js'
import type { AnsweredItem } from './machine.js'

/** Two at each of the five levels. */
export const PLACEMENT_LENGTH = 10
const PER_LEVEL = 2
const LEVELS = [1, 2, 3, 4, 5] as const

/** Answered fewer than this and there is nothing to place on: the learner left, so nothing changes. */
export const PLACEMENT_MIN_ANSWERS = 6

export type PlacementInput = {
  readonly index: ContentIndex
  readonly rng: Rng
  readonly locale: string
  readonly screenReaderOnly?: boolean
  readonly modalities?: readonly Template['modality'][]
}

/** The test: easiest first, two per level where the content has them. */
export function composePlacement(input: PlacementInput): Question[] {
  const { index, rng, locale } = input
  const core = [...index.itemsByFact.keys()].filter((id) => index.facts.get(id)?.tags?.includes('core'))
  const byLevel = new Map<number, string[]>(LEVELS.map((level) => [level, []]))
  for (const id of shuffle(core, rng)) {
    const level = index.facts.get(id)!.difficulty
    byLevel.get(level)?.push(id)
  }

  const taken = new Set<string>()
  const entities = new Set<string>()
  const ask = (factId: string): Question | null => {
    const fact = index.facts.get(factId)!
    // Different countries throughout: two questions about Sweden test whether the learner has
    // heard of Sweden.
    if (entities.has(fact.entity)) return null
    for (const item of itemsForFact(index, factId, rng, {
      ...(input.screenReaderOnly !== undefined ? { screenReaderOnly: input.screenReaderOnly } : {}),
      ...(input.modalities !== undefined ? { modalities: input.modalities } : {}),
      preferModifierAtMost: 0,
      deprioritizeEntityAnswers: false,
    })) {
      // The plain way only: a template that asks harder is not what this measures.
      if ((index.templates.get(item.templateId)?.difficultyModifier ?? 0) > 0) continue
      const question = buildQuestion(index, item, locale, rng, { isNew: false })
      if (question === null) continue
      taken.add(factId)
      entities.add(fact.entity)
      return question
    }
    return null
  }

  const picked: Question[] = []
  for (const level of LEVELS) {
    let got = 0
    for (const id of byLevel.get(level) ?? []) {
      if (got >= PER_LEVEL) break
      const question = ask(id)
      if (question !== null) {
        picked.push(question)
        got++
      }
    }
  }

  // A level the content cannot fill (a small pack) is made up from the nearest ones, so the
  // test is still ten questions rather than a shorter one that reads as a different test.
  for (const level of [3, 2, 4, 1, 5]) {
    for (const id of byLevel.get(level) ?? []) {
      if (picked.length >= PLACEMENT_LENGTH) break
      if (taken.has(id)) continue
      const question = ask(id)
      if (question !== null) picked.push(question)
    }
  }
  return picked.sort((a, b) => a.item.difficulty - b.item.difficulty).slice(0, PLACEMENT_LENGTH)
}

/**
 * Where the answers say to start, or null when there are too few to say.
 *
 * Three groups, because the scale is three-valued: the easiest level, the middle two, the top
 * two. `confident` needs most of the top AND most of the middle — a learner who gets the hardest
 * flags and misses the easy ones is lucky, not expert — and `some` needs the middle or a start
 * on the top.
 */
export function placementLevel(answers: readonly AnsweredItem[], questions: readonly Question[]): StartLevel | null {
  if (answers.length < PLACEMENT_MIN_ANSWERS) return null
  const difficulty = new Map(questions.map((q) => [q.item.id, q.item.difficulty] as const))
  let low = 0
  let mid = 0
  let high = 0
  for (const answer of answers) {
    if (!answer.wasCorrect) continue
    const d = difficulty.get(answer.itemId) ?? 3
    if (d <= 1) low++
    else if (d <= 3) mid++
    else high++
  }
  if (high >= 3 && mid >= 3) return 'confident'
  if (mid >= 2 && low >= 1) return 'some'
  if (high >= 1 && mid >= 2) return 'some'
  return 'new'
}
