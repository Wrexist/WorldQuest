import { describe, expect, it } from 'vitest'
import { buildIndex } from '../content/index.js'
import type { Entity, Fact, Template } from '../content/types.js'
import type { FactId, MemoryState } from '../learning/types.js'
import { seededRng } from '../shared/index.js'
import { BALANCE } from '../xp/balance.js'
import {
  COMPLETION_BONUS,
  DISCOVER_TARGET,
  REVIEW_TARGET,
  SLOTS,
  SPEED_ROUND_MS,
  TASK_XP,
  applyQuestEvent,
  canonicalTarget,
  generateDailyQuest,
  hasExpired,
  questProblems,
  questProgress,
  replayQuest,
  type DailyQuest,
} from './index.js'

const NOW = Date.parse('2026-08-01T09:00:00Z')
const DAY = 86_400_000

const entity = (id: string): Entity => ({ id, type: 'country', names: { en: id }, region: 'EU' })

const fact = (id: string, entityId: string, attribute: string): Fact => ({
  id,
  entity: entityId,
  attribute,
  value: { names: { en: `${id} value` } },
  difficulty: 3,
  volatility: 'stable',
})

const template = (attribute: string): Template => ({
  id: `tpl.${attribute}`,
  attribute,
  modality: 'text',
  prompt: { key: `lesson:prompt.${attribute}`, params: ['entityName'] },
  answer: { from: 'fact.value.names' },
  distractors: { count: 3, strategy: 'same-region' },
  a11y: { screenReaderSafe: true },
})

/** Twenty facts across ten countries — enough for every slot to fill. */
const ids = Array.from({ length: 10 }, (_, i) => `C${i}`)
const index = buildIndex({
  entities: ids.map(entity),
  facts: ids.flatMap((id) => [
    fact(`${id}.capital`, id, 'capital'),
    fact(`${id}.flag`, id, 'flag'),
  ]),
  templates: [template('capital'), template('flag')],
})

const memoryFor = (factIds: readonly string[], dueOffsetDays: number): Map<FactId, MemoryState> =>
  new Map(
    factIds.map((factId) => [
      factId,
      {
        factId,
        stability: 10,
        difficulty: 5,
        reps: 3,
        lapses: 0,
        lastReviewAt: NOW - DAY,
        dueAt: NOW + dueOffsetDays * DAY,
        suspended: false,
      },
    ]),
  )

const generate = (memory: Map<FactId, MemoryState>, accuracy = 0.8, seed = 1): DailyQuest =>
  generateDailyQuest({
    userId: 'u1',
    date: '2026-08-01',
    index,
    memory,
    now: NOW,
    rng: seededRng(seed),
    recentAccuracy: accuracy,
  })

describe('generation', () => {
  it('always produces exactly five slots, in order', () => {
    // A quest screen with three cards on it looks broken, and "come back when you
    // have more history" is not an answer.
    const quest = generate(new Map())
    expect(quest.tasks.map((t) => t.slot)).toEqual([...SLOTS])
  })

  it('is deterministic for the same seed', () => {
    // A quest that rerolls on reinstall or on a second device is a quest to farm.
    const due = memoryFor([...index.facts.keys()].slice(0, 12), -1)
    expect(generate(due, 0.8, 7)).toEqual(generate(due, 0.8, 7))
  })

  it('draws review slots from what is actually due', () => {
    const dueIds = ['C0.capital', 'C1.capital', 'C2.capital', 'C3.capital']
    const quest = generate(memoryFor(dueIds, -1))
    const review = quest.tasks.filter((t) => t.slot !== 'perform' && t.slot !== 'discover')
    const used = review.flatMap((t) => t.factIds)
    expect(used.filter((id) => dueIds.includes(id)).length).toBeGreaterThan(0)
  })

  it('fills review slots from new content for a first-week user', () => {
    // Nothing is due on day one. Handing that user three empty tasks is the worst
    // possible first impression of the mechanic.
    const quest = generate(new Map())
    for (const task of quest.tasks) {
      if (task.slot === 'perform') continue
      expect(task.factIds.length).toBeGreaterThan(0)
      expect(task.target).toBeGreaterThan(0)
    }
  })

  it('never asks for more than the content can supply', () => {
    // A task showing 0 / 4 that cannot reach 4 is worse than one showing 0 / 2.
    const tiny = buildIndex({
      entities: [entity('X')],
      facts: [fact('X.capital', 'X', 'capital')],
      templates: [template('capital')],
    })
    const quest = generateDailyQuest({
      userId: 'u1',
      date: '2026-08-01',
      index: tiny,
      memory: new Map(),
      now: NOW,
      rng: seededRng(1),
      recentAccuracy: 0.8,
    })
    for (const task of quest.tasks) {
      if (task.slot === 'perform') continue
      expect(task.target).toBeLessThanOrEqual(Math.max(1, task.factIds.length))
    }
  })

  it('scales the performance slot so it is always reachable', () => {
    // A perfect-lesson goal handed to someone at 60 % accuracy is a task they fail
    // every day, and a daily failure is the opposite of the point.
    expect(generate(new Map(), 0.6).tasks[4]?.goal).toBe('streak_keeper')
    expect(generate(new Map(), 0.8).tasks[4]?.goal).toBe('speed_round')
    expect(generate(new Map(), 0.95).tasks[4]?.goal).toBe('perfect_lesson')
  })

  it('skips suspended facts', () => {
    // A leech the scheduler has pulled out of rotation must not come back through
    // the quest — that is the one place it is guaranteed to be seen.
    const memory = memoryFor(['C0.capital'], -1)
    const state = memory.get('C0.capital')!
    memory.set('C0.capital', { ...state, suspended: true })
    const quest = generate(memory)
    const used = quest.tasks.flatMap((t) => t.factIds)
    expect(used).not.toContain('C0.capital')
  })

  it('uses a stable id so a replay is a no-op', () => {
    expect(generate(new Map()).id).toBe('u1:2026-08-01')
  })
})

describe('progress', () => {
  const quest = generate(memoryFor([...index.facts.keys()], -1), 0.95)

  it('advances only on a correct answer', () => {
    // Counting wrong answers makes the quest a measure of attendance, not learning.
    const target = quest.tasks[0]!.factIds[0]!
    const wrong = applyQuestEvent(quest, { type: 'fact_answered', factId: target, correct: false })
    expect(wrong.quest.tasks[0]!.progress).toBe(0)
    expect(wrong.xpAwarded).toBe(0)

    const right = applyQuestEvent(quest, { type: 'fact_answered', factId: target, correct: true })
    expect(right.quest.tasks[0]!.progress).toBe(1)
  })

  it('ignores a fact that is not part of the task', () => {
    const result = applyQuestEvent(quest, {
      type: 'fact_answered',
      factId: 'not-in-any-task',
      correct: true,
    })
    expect(result.quest).toEqual(quest)
    expect(result.xpAwarded).toBe(0)
  })

  it('pays per completed slot', () => {
    let current = quest
    let paid = 0
    for (const factId of quest.tasks[0]!.factIds) {
      const result = applyQuestEvent(current, { type: 'fact_answered', factId, correct: true })
      current = result.quest
      paid += result.xpAwarded
    }
    expect(current.tasks[0]!.complete).toBe(true)
    expect(paid).toBe(TASK_XP)
  })

  it('pays the completion bonus exactly once', () => {
    let current = completeEverything(quest)
    expect(current.complete).toBe(true)

    // A replayed submission must not award the bonus a second time.
    const replay = applyQuestEvent(current, {
      type: 'lesson_completed',
      accuracy: 1,
      durationMs: 10_000,
    })
    expect(replay.xpAwarded).toBe(0)
    current = replay.quest
    expect(current.bonusClaimed).toBe(true)
  })

  it('reads its numbers from the balance table', () => {
    expect(TASK_XP).toBe(BALANCE.xp.dailyQuestTask)
    expect(COMPLETION_BONUS).toBe(BALANCE.xp.dailyQuest)
  })

  it('checks the performance goal against the right condition', () => {
    const perfect = generate(new Map(), 0.95)
    const slow = applyQuestEvent(perfect, {
      type: 'lesson_completed',
      accuracy: 0.9,
      durationMs: 10_000,
    })
    expect(slow.quest.tasks[4]!.complete).toBe(false)

    const clean = applyQuestEvent(perfect, {
      type: 'lesson_completed',
      accuracy: 1,
      durationMs: 200_000,
    })
    expect(clean.quest.tasks[4]!.complete).toBe(true)

    const fast = generate(new Map(), 0.8)
    expect(
      applyQuestEvent(fast, {
        type: 'lesson_completed',
        accuracy: 0.5,
        durationMs: SPEED_ROUND_MS,
      }).quest.tasks[4]!.complete,
    ).toBe(true)
    expect(
      applyQuestEvent(fast, {
        type: 'lesson_completed',
        accuracy: 1,
        durationMs: SPEED_ROUND_MS + 1,
      }).quest.tasks[4]!.complete,
    ).toBe(false)
  })

  it('reports progress for the ring on Home', () => {
    expect(questProgress(quest)).toEqual({ done: 0, total: 5 })
    expect(questProgress(completeEverything(quest))).toEqual({ done: 5, total: 5 })
  })

  it('does not mutate the quest it is given', () => {
    const before = generate(new Map(), 0.95)
    const snapshot = JSON.stringify(before)
    applyQuestEvent(before, {
      type: 'fact_answered',
      factId: before.tasks[0]!.factIds[0]!,
      correct: true,
    })
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('expiry', () => {
  it('knows when a quest belongs to a past day', () => {
    const quest = generate(new Map())
    expect(hasExpired(quest, '2026-08-01')).toBe(false)
    expect(hasExpired(quest, '2026-08-02')).toBe(true)
  })

  it('has no concept of a penalty for a missed quest', () => {
    // Deliberate: there is no `missedCount`, no make-up, no "you missed 3 this week".
    // That mechanic is what turns a game into an obligation, and this asserts the
    // absence rather than trusting a comment.
    const quest = generate(new Map())
    expect(Object.keys(quest)).toEqual(['id', 'date', 'tasks', 'complete', 'bonusClaimed'])
  })
})

/** Drives every slot to done, whatever the generator picked. */
function completeEverything(quest: DailyQuest): DailyQuest {
  let current = quest
  for (const task of quest.tasks) {
    if (task.slot === 'perform') continue
    for (const factId of task.factIds) {
      current = applyQuestEvent(current, { type: 'fact_answered', factId, correct: true }).quest
    }
  }
  return applyQuestEvent(current, { type: 'lesson_completed', accuracy: 1, durationMs: 10_000 })
    .quest
}

describe('replayQuest — what the server pays for', () => {
  const pinned = generateDailyQuest({
    userId: 'u1',
    date: '2026-08-18',
    index,
    memory: new Map(),
    now: NOW,
    rng: seededRng(7),
    recentAccuracy: 0.5, // streak_keeper: any finished lesson
  })

  it('starts from zero, whatever progress the quest arrived carrying', () => {
    // The device's progress is a local cache; the server's evidence is the truth. A
    // quest handed over claiming four complete tasks must not be paid for them.
    const forged: DailyQuest = {
      ...pinned,
      tasks: pinned.tasks.map((t) => ({ ...t, progress: t.target, complete: true })),
      complete: true,
    }
    const replayed = replayQuest(forged, [])
    expect(replayed.tasks.every((t) => !t.complete)).toBe(true)
    expect(replayed.complete).toBe(false)
  })

  it('completes a slot from the evidence, and no more than once per fact', () => {
    const task = pinned.tasks[0]!
    const oneFact = task.factIds[0]!
    // The same fact five times is one fact. A review slot asks for four FACTS, and
    // `applyQuestEvent` on its own would count all five — see the note on `replayQuest`
    // for why the dedupe lives on the paying side.
    const repeated = Array.from({ length: 5 }, () => ({
      type: 'fact_answered' as const,
      factId: oneFact,
      correct: true,
    }))
    expect(replayQuest(pinned, repeated).tasks[0]!.progress).toBe(1)

    const distinct = task.factIds.map((factId) => ({
      type: 'fact_answered' as const,
      factId,
      correct: true,
    }))
    expect(replayQuest(pinned, distinct).tasks[0]!.complete).toBe(true)
  })

  it('is idempotent — the same day replayed twice pays the same', () => {
    const events = pinned.tasks.flatMap((t) =>
      t.factIds.map((factId) => ({ type: 'fact_answered' as const, factId, correct: true })),
    )
    const once = replayQuest(pinned, events)
    const twice = replayQuest(pinned, [...events, ...events])
    expect(twice.tasks.map((t) => t.progress)).toEqual(once.tasks.map((t) => t.progress))
  })

  it('never counts a wrong answer', () => {
    const task = pinned.tasks[0]!
    const wrong = task.factIds.map((factId) => ({
      type: 'fact_answered' as const,
      factId,
      correct: false,
    }))
    expect(replayQuest(pinned, wrong).tasks[0]!.progress).toBe(0)
  })
})

describe('canonical shape - what the server may pin', () => {
  const context = { owner: 'u1', day: '2026-08-01', knownFacts: new Set(index.facts.keys()) }
  const today = (seed = 1): DailyQuest => generate(memoryFor([], 0), 0.8, seed)
  const swap = (quest: DailyQuest, index0: number, change: Partial<DailyQuest['tasks'][number]>): DailyQuest => ({
    ...quest,
    tasks: quest.tasks.map((task, i) => (i === index0 ? { ...task, ...change } : task)),
  })

  it('accepts what the generator produces', () => {
    // The strongest statement available: the composer's output is canonical by definition.
    for (let seed = 1; seed <= 8; seed++) expect(questProblems(today(seed), context)).toEqual([])
  })

  it('accepts the degraded tasks a finished corpus produces', () => {
    // Every fact known and none due: the generator still returns five tasks and leaves
    // the review slots it cannot fill. Those are uncompletable, not cheap — no answer
    // can advance them — so the shape stays valid and the pin does not fail the learner
    // who has learned everything.
    const quest = generate(memoryFor([...index.facts.keys()], 10), 0.8, 3)
    const unfillable = quest.tasks.filter((t) => t.factIds.length === 0)
    expect(unfillable.length, 'fixture no longer produces an unfillable slot').toBeGreaterThan(0)
    for (const task of unfillable) expect(task.target).toBe(canonicalTarget(task.slot, 0))
    expect(questProblems(quest, context)).toEqual([])
  })

  it('rejects an eight-slot quest', () => {
    const quest = today()
    const extra = { ...quest.tasks[0]!, slot: 'locate' as const }
    const problems = questProblems({ ...quest, tasks: [...quest.tasks, extra] }, context)
    expect(problems.join(' ')).toContain('5 slots, got 6')
  })

  it('rejects a duplicated or invented slot', () => {
    expect(questProblems(swap(today(), 1, { slot: 'locate' }), context).join(' ')).toContain('slot 2 must be recognise')
    expect(questProblems(swap(today(), 4, { slot: 'invented' as never }), context).join(' ')).toContain('slot 5 must be perform')
  })

  it('rejects a fact that is not content', () => {
    const quest = today()
    const target = quest.tasks.find((t) => t.factIds.length > 0)!
    const at = quest.tasks.indexOf(target)
    expect(questProblems(swap(quest, at, { factIds: ['not.a.fact'] }), context).join(' '))
      .toContain('unknown fact not.a.fact')
  })

  it('rejects a task listing more facts than its slot has, which would make any answers do', () => {
    const quest = today()
    const at = quest.tasks.findIndex((t) => t.slot === 'locate')
    const everyFact = [...context.knownFacts]
    const problems = questProblems(swap(quest, at, { factIds: everyFact, target: REVIEW_TARGET }), context)
    expect(problems.join(' ')).toContain(`lists ${everyFact.length} facts`)
  })

  it('rejects a cheaper target and an unreachable one', () => {
    const quest = today()
    const at = quest.tasks.findIndex((t) => t.slot === 'recognise')
    const facts = quest.tasks[at]!.factIds
    expect(questProblems(swap(quest, at, { target: 1 }), context).join(' ')).toContain('is not the canonical')
    expect(questProblems(swap(quest, at, { target: facts.length + 3 }), context).join(' ')).toContain('is not the canonical')
  })

  it('rejects a goal on a review slot and a perform slot without one', () => {
    const quest = today()
    expect(questProblems(swap(quest, 0, { goal: 'perfect_lesson' }), context).join(' ')).toContain('must not carry a goal')
    const stripped = quest.tasks.map((task, i) => {
      if (i !== 4) return task
      const { goal, ...rest } = task
      void goal
      return rest
    })
    expect(questProblems({ ...quest, tasks: stripped }, context).join(' ')).toContain('perform must carry a goal')
    expect(questProblems(swap(quest, 4, { factIds: ['C0.capital'] }), context).join(' ')).toContain('perform must not carry facts')
  })

  it('rejects a quest composed for another account or another day', () => {
    const quest = today()
    expect(questProblems(quest, { ...context, owner: 'u2' }).join(' ')).toContain('does not belong to this account')
    expect(questProblems(quest, { ...context, day: '2026-08-02' }).join(' ')).toContain('quest date is not the day')
    expect(questProblems({ ...quest, id: 'u2:2026-08-01' }, context).join(' ')).toContain('does not belong to this account')
  })

  it('sizes the discover slot separately from the review slots', () => {
    expect(canonicalTarget('discover', DISCOVER_TARGET)).toBe(DISCOVER_TARGET)
    expect(canonicalTarget('discover', 5)).toBe(DISCOVER_TARGET)
    expect(canonicalTarget('recall', 10)).toBe(REVIEW_TARGET)
    expect(canonicalTarget('perform', 0)).toBe(1)
  })
})
