/**
 * Match the pairs.
 *
 * Duolingo's other signature exercise, and a good one for geography: four countries on one
 * side, four capitals (or flags, or codes, or athletes) on the other, and the learner joins
 * them. It is recognition, but recognition with ELIMINATION — a pair that cannot be placed
 * yet is set aside and comes back when the others are gone — which is a quicker, lighter way
 * to meet four facts than four separate questions, and the reason it is where new facts are
 * introduced.
 *
 * ## It is four ordinary questions
 *
 * That is the design, and it is why nothing downstream changed. A group is four consecutive
 * `Question`s that share one option list and carry `group` metadata. Each is graded as the fact
 * it is about, scheduled as that fact, and issued by the Worker as its own slot with its own
 * answer key — so the Worker needed no new protocol, FSRS needed no new case, and a client
 * that has never heard of pairs (the legacy build, a speed round) plays each member as the
 * plain four-option question it also is.
 *
 * The first thing the learner tries for each left-hand item is its answer, as in every other
 * question: finding the right partner on the third try is learning, not evidence of knowing.
 *
 * ## When
 *
 * Only at the gentle end of the ramp (a way-of-asking ceiling of 1 or less) — at the top it is
 * recall by typing that is wanted — in a lesson long enough to spare four questions for it, and
 * once per lesson. Four questions of the same attribute about four different things whose
 * answers read differently: a board with two "euro" cards has two right answers on it.
 *
 * Pure and deterministic, given the injected rng.
 */

import { shuffle, type Rng } from '../shared/index.js'
import type { ContentIndex, Question } from '../content/types.js'

/** How many pairs a board holds. Four is what fits a phone and what working memory holds. */
export const PAIR_SIZE = 4

/** A lesson shorter than this has no room to give four questions to one exercise. */
const MIN_LESSON_FOR_PAIRS = 8

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Is this question one that can sit on a board? A plain forward question about a value, in words. */
function pairable(index: ContentIndex, q: Question): boolean {
  if (q.group !== undefined || q.typed !== undefined) return false
  if (q.modality !== 'text') return false
  if (q.options.length < 2 || q.options.some((o) => o.asset !== undefined)) return false
  // Forward only: the entity is the prompt and the value is the answer, so the left-hand card
  // is the entity and the right-hand card is its value. A reverse question has the value in the
  // prompt, which would put the answers on both sides of the board.
  const template = index.templates.get(q.item.templateId)
  if (template?.answer.from !== 'fact.value.names') return false
  return typeof q.promptParams['entityName'] === 'string' && q.options.some((o) => o.isCorrect && o.id === q.item.entityId)
}

/**
 * Turn four of a lesson's questions into one board, or return it unchanged.
 *
 * The board takes the place of its EARLIEST member, so a lesson's shape (warm-up, climb, finish)
 * is bent no further than by pulling three questions forward to sit beside the first.
 */
export function pairUp(
  questions: readonly Question[],
  context: { readonly index: ContentIndex; readonly rng: Rng; readonly attributeOf: (q: Question) => string | undefined },
): Question[] {
  if (questions.length < MIN_LESSON_FOR_PAIRS) return [...questions]

  // The attribute with the most boards-worth of candidates, ties to the one that appears first.
  const byAttribute = new Map<string, Question[]>()
  for (const q of questions) {
    if (!pairable(context.index, q)) continue
    const attribute = context.attributeOf(q)
    if (attribute === undefined) continue
    byAttribute.set(attribute, [...(byAttribute.get(attribute) ?? []), q])
  }

  for (const [, candidates] of [...byAttribute].sort((a, b) => b[1].length - a[1].length)) {
    const members: Question[] = []
    const labels = new Set<string>()
    for (const q of candidates) {
      const label = fold(q.options.find((o) => o.id === q.item.entityId)?.label ?? '')
      // A board with two cards that read the same has two right answers on it.
      if (label === '' || labels.has(label)) continue
      labels.add(label)
      members.push(q)
      if (members.length === PAIR_SIZE) break
    }
    if (members.length < PAIR_SIZE) continue

    // One option list for the whole board, shuffled once: the same cards in the same order for
    // every member, which is what makes them a board and not four questions that look alike.
    const shared = shuffle(
      members.map((q) => ({ id: q.item.entityId, label: q.options.find((o) => o.id === q.item.entityId)!.label })),
      context.rng,
    )
    const id = `pairs.${members[0]!.item.id}`
    const board = members.map((q, position): Question => {
      const { locator: _locator, revealAsset: _revealAsset, promptAsset: _promptAsset, hint: _hint, ...rest } = q
      return {
        ...rest,
        options: shared.map((o) => ({ id: o.id, label: o.label, isCorrect: o.id === q.item.entityId })),
        group: { id, size: PAIR_SIZE, position },
      }
    })

    const taken = new Set(members.map((q) => q.item.id))
    const out: Question[] = []
    let placed = false
    for (const q of questions) {
      if (!taken.has(q.item.id)) {
        out.push(q)
      } else if (!placed) {
        out.push(...board)
        placed = true
      }
    }
    return out
  }
  return [...questions]
}
