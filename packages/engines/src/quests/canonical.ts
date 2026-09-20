/**
 * What a canonical quest is.
 *
 * What the server has to decide is whether what it was handed is a real quest, and it
 * cannot re-derive one — only the device knows what was due at the moment it composed.
 * These rules are the part that can be checked from the shape alone:
 *
 * - the five slots, in order, so an eight-slot quest or a duplicated slot is not a quest;
 * - every fact named is real content, so invented facts earn nothing;
 * - a task lists no more facts than its slot canonically has, so listing the whole
 *   corpus to make any four right answers complete a slot is not a cheaper quest;
 * - a task's target is the canonical clamp of the facts it holds — not lower, which
 *   would be a cheaper quest, and not higher, which would be an unreachable one;
 * - `perform` carries a goal and no facts, every other slot the opposite.
 *
 * A review slot with no facts is allowed, because a learner who has finished the corpus
 * really does get one: the generator degrades rather than failing, and such a task is
 * uncompletable rather than cheap — no answer can advance it, so it earns nothing.
 * What these rules deliberately cannot decide is whether the *specific* facts were ones
 * this account had earned the right to be asked about. A one-fact review slot is valid
 * by shape and cheaper in practice, so eligibility is answered at pin time against the
 * account's own memory rows, on the server, rather than guessed here.
 *
 * Spec: docs/systems/quests-and-liveops.md §1
 */

import type { FactId } from '../learning/types.js'
import { SLOTS, type DailyQuest, type Slot } from './progress.js'

/** Facts a review slot asks for. */
export const REVIEW_TARGET = 4
/** Facts the discover slot asks for. */
export const DISCOVER_TARGET = 2

/**
 * The target a canonical task carries, given the facts it actually has.
 *
 * Not always `REVIEW_TARGET`: a first-week user may have fewer unseen facts than a
 * full slot, and `generateDailyQuest` degrades to a shorter task rather than an
 * unreachable one. So the canonical target is the clamp of what the task holds.
 */
export function canonicalTarget(slot: Slot, factCount: number): number {
  if (slot === 'perform') return 1
  return Math.max(1, Math.min(slot === 'discover' ? DISCOVER_TARGET : REVIEW_TARGET, factCount))
}

/** The most facts a canonical task of this slot may list. */
export function maxTaskFacts(slot: Slot): number {
  if (slot === 'perform') return 0
  return slot === 'discover' ? DISCOVER_TARGET : REVIEW_TARGET
}

export type QuestContext = {
  /** The account the quest must belong to. */
  readonly owner: string
  /** The local day being pinned. */
  readonly day: string
  readonly knownFacts: ReadonlySet<FactId>
}

/**
 * Everything wrong with a quest, or an empty list.
 *
 * A list rather than a boolean, so a failing client, a bug report and a test all say
 * which rule broke instead of "invalid quest".
 *
 * Only the rules that decide payment or ownership are checked. Progress and `complete`
 * are deliberately not: `replayQuest` zeroes them and derives the truth from the
 * server's own rows, so rejecting a harmless client-side progress value would turn a
 * cosmetic disagreement into a failed lesson.
 */
export function questProblems(quest: DailyQuest, context: QuestContext): string[] {
  const problems: string[] = []
  if (quest.id !== `${context.owner}:${context.day}`) problems.push('quest does not belong to this account and day')
  if (quest.date !== context.day) problems.push('quest date is not the day being pinned')
  if (quest.tasks.length !== SLOTS.length) problems.push(`a quest has ${SLOTS.length} slots, got ${quest.tasks.length}`)

  quest.tasks.forEach((task, index) => {
    const expected = SLOTS[index]
    if (task.slot !== expected) problems.push(`slot ${index + 1} must be ${expected}, got ${task.slot}`)
    if (new Set(task.factIds).size !== task.factIds.length) problems.push(`${task.slot} lists the same fact twice`)
    if (task.factIds.length > maxTaskFacts(task.slot)) {
      problems.push(`${task.slot} lists ${task.factIds.length} facts, at most ${maxTaskFacts(task.slot)} are canonical`)
    }
    for (const factId of task.factIds) {
      if (!context.knownFacts.has(factId)) problems.push(`${task.slot} names an unknown fact ${factId}`)
    }
    if (task.slot === 'perform') {
      if (task.factIds.length > 0) problems.push('perform must not carry facts')
      if (!task.goal) problems.push('perform must carry a goal')
      return
    }
    if (task.goal) problems.push(`${task.slot} must not carry a goal`)
    if (task.target !== canonicalTarget(task.slot, task.factIds.length)) {
      problems.push(`${task.slot} target ${task.target} is not the canonical ${canonicalTarget(task.slot, task.factIds.length)} for its ${task.factIds.length} facts`)
    }
  })

  return problems
}
