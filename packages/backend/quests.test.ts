import { describe, expect, it } from 'vitest'
import { COMPLETION_BONUS, RATING, TASK_XP, generateDailyQuest, seededRng, type DailyQuest, type MemoryState } from '@worldquest/engines'
import { BONUS_SLOT, questPayout } from './src/quests'
import { learningContent } from './src/learning-content'

/**
 * The payout is the only place XP leaves the server on a quest's word, so it gets tests
 * without a database in the way. The real D1 tests in `proof.test.ts` cover the wiring;
 * these cover the arithmetic that decides how much is paid.
 */
const DAY = '2026-08-01'
const NOW = Date.parse(`${DAY}T09:00:00Z`)
/**
 * Every fact due, so the three review slots draw distinct slices. With nothing due the
 * generator fills all three from the same first unseen facts — which is real behaviour
 * for a first-week learner, and would make every assertion below about three slots at
 * once rather than one.
 */
const due = (): Map<string, MemoryState> => new Map([...learningContent.facts.keys()].map(factId => [factId, {
  factId, stability: 10, difficulty: 5, reps: 3, lapses: 0, lastReviewAt: NOW - 86_400_000,
  dueAt: NOW - 1000, suspended: false,
} satisfies MemoryState]))
const compose = (): DailyQuest => generateDailyQuest({
  userId: 'u1', date: DAY, index: learningContent, memory: due(),
  now: NOW, rng: seededRng(1), recentAccuracy: 0.8,
})
const correct = (quest: DailyQuest, slot: string) =>
  quest.tasks.find(task => task.slot === slot)!.factIds.map(factId => ({ factId, rating: RATING.easy }))
const finished = (accuracy = 1) => ({ correct: accuracy, reviews: 1, elapsedMs: 1000 })

describe('quest payout', () => {
  it('pays a completed review slot once', () => {
    const quest = compose()
    const evidence = { reviews: correct(quest, 'locate'), lessons: [] }
    const { claims, payout } = questPayout(quest, new Set(), evidence)
    expect(claims).toEqual([{ slot: 'locate', xp: TASK_XP }])
    expect(payout.xp).toBe(TASK_XP)
  })

  it('pays nothing for a slot already in quest_claims', () => {
    const quest = compose()
    const evidence = { reviews: correct(quest, 'locate'), lessons: [] }
    // The same evidence, replayed: the difference between what the day adds up to and what
    // has been paid is what is left to pay. Nothing is.
    expect(questPayout(quest, new Set(['locate']), evidence).payout.xp).toBe(0)
  })

  it('pays the completion bonus once, and never again', () => {
    const quest = compose()
    const evidence = {
      reviews: quest.tasks.filter(task => task.slot !== 'perform').flatMap(task => correct(quest, task.slot)),
      lessons: [finished()],
    }
    const first = questPayout(quest, new Set(), evidence)
    expect(first.claims.map(claim => claim.slot)).toContain(BONUS_SLOT)
    expect(first.payout.xp).toBe(TASK_XP * 5 + COMPLETION_BONUS)

    const paid = new Set(first.claims.map(claim => claim.slot))
    expect(questPayout(quest, paid, evidence).claims).toEqual([])

    // Partially paid: the slots already claimed are skipped, the rest still pay.
    const partial = questPayout(quest, new Set(['locate', 'recognise', BONUS_SLOT]), evidence)
    expect(partial.claims.map(claim => claim.slot).sort()).toEqual(['discover', 'perform', 'recall'])
  })

  it('does not advance a review slot on a wrong answer', () => {
    const quest = compose()
    const wrong = correct(quest, 'locate').map(review => ({ ...review, rating: RATING.again }))
    expect(questPayout(quest, new Set(), { reviews: wrong, lessons: [] }).claims).toEqual([])
  })

  it('counts one fact once, however many times the day names it', () => {
    const quest = compose()
    const task = quest.tasks.find(t => t.slot === 'locate')!
    const once = task.factIds.map(factId => ({ factId, rating: RATING.good }))
    const { payout } = questPayout(quest, new Set(), { reviews: [...once, ...once], lessons: [] })
    // Four facts, not eight: replaying the same fact twice cannot satisfy a four-fact slot
    // that only ever listed two facts' worth.
    expect(payout.slots).toEqual(['locate'])
    expect(questPayout(quest, new Set(), { reviews: [...once, ...once.slice(0, 1)], lessons: [] }).payout.xp)
      .toBe(TASK_XP)
  })

  it('pays nothing at all when nothing was pinned', () => {
    expect(questPayout(null, new Set(), { reviews: [{ factId: 'x', rating: RATING.easy }], lessons: [finished()] }))
      .toEqual({ claims: [], payout: { xp: 0, slots: [] } })
  })

  it('will not complete a slot from a lesson that did not qualify', () => {
    const quest = compose()
    const perform = quest.tasks.find(task => task.slot === 'perform')!
    const qualifying = perform.goal === 'perfect_lesson' ? 1 : undefined
    if (qualifying === undefined) return
    // A 50%-accuracy lesson cannot satisfy a perfect-lesson goal.
    expect(questPayout(quest, new Set(), { reviews: [], lessons: [finished(0.5)] }).claims).toEqual([])
  })
})
