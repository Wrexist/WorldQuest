import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { seededRng } from '../shared/index.js'
import { buildIndex, type Entity, type Fact, type Question, type Template } from '../content/index.js'
import { BALANCE } from '../xp/balance.js'
import { gradeLesson } from '../grading/index.js'
import { review } from '../learning/fsrs.js'
import type { MemoryState } from '../learning/types.js'
import { composeLesson } from './compose.js'
import {
  accuracy,
  currentQuestion,
  initialState,
  isFinished,
  transition,
  type LessonState,
} from './machine.js'

const packsDir = join(import.meta.dirname, '..', '..', '..', 'content', 'packs', 'geography')
const read = <T>(f: string): T[] =>
  (JSON.parse(readFileSync(join(packsDir, f), 'utf8')) as { items: T[] }).items

const index = buildIndex({
  entities: read<Entity>('entities.countries.v1.json'),
  facts: [...read<Fact>('facts.capitals.v1.json'), ...read<Fact>('facts.flags.v1.json')],
  templates: read<Template>('templates.v1.json'),
})

const T0 = 1_800_000_000_000

/** Drive the machine to a loaded, presenting state. */
function started(questions: readonly Question[], opts = {}): LessonState {
  let s = initialState(opts)
  s = transition(s, { type: 'LOAD', lessonId: 'lesson-1', now: T0 })
  s = transition(s, { type: 'LOADED', questions, now: T0 })
  return s
}

const makeQuestions = (n: number, isNew = false): Question[] =>
  index.items.slice(0, n).map((item, i) => ({
    item,
    promptKey: 'lesson:prompt.capital_of',
    promptParams: {},
    options: [
      { id: `right-${i}`, label: 'Right', isCorrect: true },
      { id: `wrong-${i}`, label: 'Wrong', isCorrect: false },
    ],
    modality: 'text' as const,
    timeLimitMs: null,
    isNew,
  }))

const answerCorrectly = (s: LessonState, now: number): LessonState => {
  const q = currentQuestion(s)!
  const right = q.options.find((o) => o.isCorrect)!
  return transition(s, { type: 'ANSWER', optionId: right.id, now })
}

const answerWrongly = (s: LessonState, now: number): LessonState => {
  const q = currentQuestion(s)!
  const wrong = q.options.find((o) => !o.isCorrect)!
  return transition(s, { type: 'ANSWER', optionId: wrong.id, now })
}

describe('lesson state machine', () => {
  it('runs a full lesson to the summary', () => {
    let s = started(makeQuestions(3))
    for (let i = 0; i < 3; i++) {
      s = answerCorrectly(s, T0 + (i + 1) * 5_000)
      expect(s.phase).toBe('answered')
      s = transition(s, { type: 'CONTINUE', now: T0 + (i + 1) * 6_000 })
    }
    expect(s.phase).toBe('summary')
    expect(s.answers).toHaveLength(3)
    expect(accuracy(s)).toBe(1)
    expect(isFinished(s)).toBe(true)
  })

  it('ignores a second tap on the same question', () => {
    // Double-tap protection is a guard on the transition, not a debounce in the UI.
    let s = started(makeQuestions(3))
    s = answerCorrectly(s, T0 + 1_000)
    const after = answerCorrectly(s, T0 + 1_050)
    expect(after).toBe(s)
    expect(s.answers).toHaveLength(1)
  })

  it('ignores an answer during feedback', () => {
    let s = started(makeQuestions(3))
    s = answerCorrectly(s, T0 + 1_000)
    s = { ...s, phase: 'feedback' }
    expect(transition(s, { type: 'ANSWER', optionId: 'right-0', now: T0 + 1_100 })).toBe(s)
  })

  it('ignores an unknown option id', () => {
    const s = started(makeQuestions(2))
    expect(transition(s, { type: 'ANSWER', optionId: 'nonsense', now: T0 })).toBe(s)
  })

  it('records elapsed time per question', () => {
    let s = started(makeQuestions(2))
    s = answerCorrectly(s, T0 + 4_200)
    expect(s.answers[0]!.elapsedMs).toBe(4_200)
  })

  it('does not count paused time as thinking time', () => {
    // Otherwise a phone call scores the user as having forgotten.
    let s = started(makeQuestions(2))
    s = transition(s, { type: 'PAUSE', now: T0 + 1_000 })
    expect(s.phase).toBe('paused')
    s = transition(s, { type: 'RESUME', now: T0 + 600_000 })
    s = answerCorrectly(s, T0 + 603_000)
    expect(s.answers[0]!.elapsedMs).toBe(3_000)
  })

  it('goes straight to summary when the queue is empty', () => {
    // Never strand the user on a blank screen.
    let s = initialState()
    s = transition(s, { type: 'LOAD', lessonId: 'x', now: T0 })
    s = transition(s, { type: 'LOADED', questions: [], now: T0 })
    expect(s.phase).toBe('summary')
  })

  it('keeps answers when a lesson is abandoned', () => {
    // Leaving a lesson must never cost someone the work they already did.
    let s = started(makeQuestions(5))
    s = answerCorrectly(s, T0 + 2_000)
    s = transition(s, { type: 'CONTINUE', now: T0 + 3_000 })
    s = transition(s, { type: 'ABANDON', now: T0 + 4_000 })
    expect(s.phase).toBe('abandoned')
    expect(s.answers).toHaveLength(1)
  })
})

describe('hearts', () => {
  it('does not charge a heart for a new item', () => {
    // You cannot lose a life for not knowing something you have never been taught.
    let s = started(makeQuestions(3, true))
    s = answerWrongly(s, T0 + 2_000)
    expect(s.hearts).toBe(BALANCE.hearts.max)
  })

  it('charges a heart for a wrong review item', () => {
    let s = started(makeQuestions(3, false))
    s = answerWrongly(s, T0 + 2_000)
    expect(s.hearts).toBe(BALANCE.hearts.max - 1)
  })

  it('restores a heart after a run of correct answers', () => {
    const n = BALANCE.hearts.restoreEveryCorrectStreak
    let s = started(makeQuestions(n + 2, false))
    s = answerWrongly(s, T0 + 1_000)
    s = transition(s, { type: 'CONTINUE', now: T0 + 1_500 })
    expect(s.hearts).toBe(BALANCE.hearts.max - 1)

    for (let i = 0; i < n; i++) {
      s = answerCorrectly(s, T0 + 2_000 + i * 1_000)
      s = transition(s, { type: 'CONTINUE', now: T0 + 2_500 + i * 1_000 })
    }
    expect(s.hearts).toBe(BALANCE.hearts.max)
  })

  it('never exceeds the maximum', () => {
    let s = started(makeQuestions(12, false))
    for (let i = 0; i < 10; i++) {
      s = answerCorrectly(s, T0 + (i + 1) * 1_000)
      s = transition(s, { type: 'CONTINUE', now: T0 + (i + 1) * 1_500 })
      expect(s.hearts).toBeLessThanOrEqual(BALANCE.hearts.max)
    }
  })

  it('ends the lesson at zero hearts, not the app', () => {
    let s = started(makeQuestions(20, false))
    // A wrong answer resets the run, so no heart is ever restored here.
    for (let i = 0; i < BALANCE.hearts.max; i++) {
      s = answerWrongly(s, T0 + (i + 1) * 1_000)
      if (!s.outOfHearts) s = transition(s, { type: 'CONTINUE', now: T0 + (i + 1) * 1_500 })
    }
    expect(s.hearts).toBe(0)
    expect(s.outOfHearts).toBe(true)
    s = transition(s, { type: 'CONTINUE', now: T0 + 60_000 })
    expect(s.phase).toBe('summary')
  })

  it('lets a revive finish the current lesson', () => {
    let s = started(makeQuestions(20, false))
    for (let i = 0; i < BALANCE.hearts.max; i++) {
      s = answerWrongly(s, T0 + (i + 1) * 1_000)
      if (!s.outOfHearts) s = transition(s, { type: 'CONTINUE', now: T0 + (i + 1) * 1_500 })
    }
    s = transition(s, { type: 'REVIVE', now: T0 + 70_000 })
    expect(s.phase).toBe('presenting')
    expect(s.hearts).toBe(BALANCE.hearts.max)
    expect(s.outOfHearts).toBe(false)
  })

  it('never charges a heart when hearts are disabled', () => {
    // Relaxed Mode and Classroom Mode.
    let s = started(makeQuestions(10, false), { heartsEnabled: false })
    for (let i = 0; i < 8; i++) {
      s = answerWrongly(s, T0 + (i + 1) * 1_000)
      s = transition(s, { type: 'CONTINUE', now: T0 + (i + 1) * 1_500 })
    }
    expect(s.outOfHearts).toBe(false)
    expect(s.phase).not.toBe('summary')
  })
})

describe('composeLesson', () => {
  it('builds a queue for a brand-new user', () => {
    const questions = composeLesson({
      index, memory: [], now: T0, rng: seededRng(1), locale: 'en', count: 6,
    })
    expect(questions.length).toBeGreaterThan(0)
    expect(questions.every((q) => q.isNew)).toBe(true)
  })

  it('marks known facts as not new', () => {
    const known = review({ factId: 'geo.SE.capital', state: null, rating: 3, now: T0 - 86_400_000 })
    const questions = composeLesson({
      index, memory: [known], now: T0, rng: seededRng(2), locale: 'en', count: 8,
    })
    const swedish = questions.find((q) => q.item.factId === 'geo.SE.capital')
    if (swedish) expect(swedish.isNew).toBe(false)
  })

  it('returns only screen-reader-safe questions when asked', () => {
    const questions = composeLesson({
      index, memory: [], now: T0, rng: seededRng(3), locale: 'en',
      count: 10, screenReaderOnly: true,
    })
    expect(questions.length).toBeGreaterThan(0)
    expect(questions.every((q) => q.item.screenReaderSafe)).toBe(true)
  })

  it('is deterministic for a given seed', () => {
    const args = { index, memory: [], now: T0, locale: 'en', count: 6 }
    expect(composeLesson({ ...args, rng: seededRng(9) }))
      .toEqual(composeLesson({ ...args, rng: seededRng(9) }))
  })

  it('respects a topic filter', () => {
    const questions = composeLesson({
      index, memory: [], now: T0, rng: seededRng(4), locale: 'en', count: 6,
      topicFilter: (id) => id.endsWith('.flag'),
    })
    expect(questions.length).toBeGreaterThan(0)
    expect(questions.every((q) => q.item.factId.endsWith('.flag'))).toBe(true)
  })

  it('teaches every attribute on day one, not one pack at a time', () => {
    // `selectItems` takes the HEAD of the new-fact list — its input is documented as
    // "ordered easiest-first". The composer passed it index insertion order, which is
    // the order the host happened to list its pack imports. Capitals were listed
    // first, so a brand-new user got capitals and nothing else, and no flag could
    // appear until all sixty-five capitals had been seen. Both attributes were
    // authored and sourced; one was reachable.
    //
    // Asserted across seeds because one lucky draw is not the property. The property
    // is that the mix does not depend on which file an app imported first.
    for (const seed of [1, 2, 3, 4, 5]) {
      const questions = composeLesson({
        index, memory: [], now: T0, rng: seededRng(seed), locale: 'en', count: 20,
      })
      const attributes = new Set(questions.map((q) => q.item.factId.split('.').pop()))
      expect(attributes, `seed ${seed}`).toContain('capital')
      expect(attributes, `seed ${seed}`).toContain('flag')
    }
  })

  it('leads with the easiest facts a user has not seen', () => {
    // The other half of the same contract. Shuffling alone would fix the starvation
    // and quietly drop "easiest-first", handing a beginner a difficulty-5 fact in
    // their first five questions.
    const questions = composeLesson({
      index, memory: [], now: T0, rng: seededRng(7), locale: 'en', count: 10,
    })
    const hardest = Math.max(
      ...questions.map((q) => index.facts.get(q.item.factId)!.difficulty),
    )
    const authored = [...index.facts.values()].map((f) => f.difficulty)
    expect(hardest).toBeLessThan(Math.max(...authored))
  })

  it('never asks a question the host cannot present', () => {
    const questions = composeLesson({
      index, memory: [], now: T0, rng: seededRng(8), locale: 'en',
      count: 20, modalities: ['text'],
    })
    expect(questions.length).toBeGreaterThan(0)
    expect(questions.every((q) => q.modality === 'text')).toBe(true)
    expect(questions.every((q) => q.promptAsset === undefined)).toBe(true)
  })
})

describe('gradeLesson', () => {
  const answersFrom = (
    facts: string[],
    correctness: boolean[],
    elapsedMs = 4_000,
  ) =>
    facts.map((factId, i) => ({
      itemId: `${factId}@tpl.capital.mc4`,
      factId,
      templateId: 'tpl.capital.mc4',
      chosenOptionId: 'x',
      wasCorrect: correctness[i]!,
      elapsedMs,
      answeredAt: T0 + (i + 1) * 5_000,
    }))

  const FACTS = ['geo.SE.capital', 'geo.NO.capital', 'geo.DK.capital', 'geo.FI.capital', 'geo.JP.flag']

  it('awards XP and coins for correct answers', () => {
    const r = gradeLesson({
      lessonId: 'l1',
      answers: answersFrom(FACTS, [true, true, true, true, true]),
      memory: new Map(),
      now: T0,
    })
    expect(r.correct).toBe(5)
    expect(r.perfect).toBe(true)
    expect(r.coinsAwarded).toBe(5 * BALANCE.coins.correctAnswer + BALANCE.coins.perfectLesson)
    expect(r.xpAwarded).toBeGreaterThan(5 * BALANCE.xp.correctAnswer)
  })

  it('writes one review event per graded answer', () => {
    const r = gradeLesson({
      lessonId: 'l2',
      answers: answersFrom(FACTS, [true, false, true, true, false]),
      memory: new Map(),
      now: T0,
    })
    expect(r.reviews).toHaveLength(5)
    expect(r.reviews.every((rev) => rev.rating >= 1 && rev.rating <= 4)).toBe(true)
    expect(r.accuracy).toBeCloseTo(0.6)
    expect(r.perfect).toBe(false)
  })

  it('advances memory state — a real answer moves a real due date', () => {
    // Phase 1 exit criterion 1, in miniature.
    const r = gradeLesson({
      lessonId: 'l3',
      answers: answersFrom(['geo.SE.capital'], [true]),
      memory: new Map(),
      now: T0,
    })
    const state = r.updatedMemory.get('geo.SE.capital')!
    expect(state.dueAt).toBeGreaterThan(T0)
    expect(state.reps).toBe(1)
  })

  it('rejects sub-400ms answers from XP and from the scheduler', () => {
    // Letting them through would corrupt the memory model, which is worse than
    // the XP they would steal.
    const r = gradeLesson({
      lessonId: 'l4',
      answers: answersFrom(FACTS, [true, true, true, true, true], 100),
      memory: new Map(),
      now: T0,
    })
    expect(r.rejected).toBe(5)
    expect(r.reviews).toHaveLength(0)
    expect(r.xpAwarded).toBe(0)
    expect(r.updatedMemory.size).toBe(0)
  })

  it('nearly zeroes XP for repeating an already-mastered fact', () => {
    const r = gradeLesson({
      lessonId: 'l5',
      answers: answersFrom(['geo.SE.capital'], [true]),
      memory: new Map(),
      now: T0,
      masteredBefore: new Set(['geo.SE.capital']),
    })
    expect(r.xpAwarded).toBeLessThan(BALANCE.xp.correctAnswer)
  })

  it('caps the speed bonus so speed is not a strategy', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      itemId: `i${i}`,
      factId: `geo.F${i}.capital`,
      templateId: 'tpl.capital.mc4',
      chosenOptionId: 'x',
      wasCorrect: true,
      elapsedMs: 500,
      answeredAt: T0 + i * 1_000,
    }))
    const r = gradeLesson({ lessonId: 'l6', answers: many, memory: new Map(), now: T0 })
    const base = 12 * BALANCE.xp.correctAnswer + BALANCE.xp.lessonComplete + BALANCE.xp.perfectLesson
    const maxSpeed = BALANCE.xp.speedBonus * BALANCE.xp.speedBonusMaxPerLesson
    expect(r.xpAwarded).toBeLessThanOrEqual(base + maxSpeed + BALANCE.xp.factMastered * 12)
  })

  it('applies the daily soft cap', () => {
    const uncapped = gradeLesson({
      lessonId: 'l7', answers: answersFrom(FACTS, [true, true, true, true, true]),
      memory: new Map(), now: T0,
    })
    const capped = gradeLesson({
      lessonId: 'l8', answers: answersFrom(FACTS, [true, true, true, true, true]),
      memory: new Map(), now: T0, xpEarnedToday: BALANCE.xp.dailySoftCap,
    })
    expect(capped.xpAwarded).toBeLessThan(uncapped.xpAwarded)
    // XP is always a whole number, so compare against the rounded expectation
    // rather than the raw product.
    expect(capped.xpAwarded).toBe(Math.round(uncapped.xpAwarded * BALANCE.xp.softCapMultiplier))
  })

  it('still awards full XP up to the cap, then reduces only the excess', () => {
    // The cap must taper, not cliff — hitting it mid-lesson should not zero the
    // rest of the lesson.
    const justUnder = BALANCE.xp.dailySoftCap - 20
    const r = gradeLesson({
      lessonId: 'l9', answers: answersFrom(FACTS, [true, true, true, true, true]),
      memory: new Map(), now: T0, xpEarnedToday: justUnder,
    })
    expect(r.xpAwarded).toBeGreaterThan(20 * BALANCE.xp.softCapMultiplier)
  })

  it('reports mastery transitions', () => {
    let memory = new Map<string, MemoryState>()
    let now = T0
    // Enough successful reviews to cross into proficient.
    for (let i = 0; i < 4; i++) {
      const r = gradeLesson({
        lessonId: `m${i}`,
        answers: [{
          itemId: 'x', factId: 'geo.SE.capital', templateId: 'tpl.capital.mc4',
          chosenOptionId: 'x', wasCorrect: true, elapsedMs: 3_000, answeredAt: now,
        }],
        memory,
        now,
      })
      memory = new Map(r.updatedMemory)
      now = memory.get('geo.SE.capital')!.dueAt
    }
    expect(memory.get('geo.SE.capital')!.reps).toBe(4)
  })

  it('produces identical results on client and server', () => {
    // The whole point of one shared module. Same answers in, same numbers out.
    const args = {
      lessonId: 'same',
      answers: answersFrom(FACTS, [true, false, true, true, true]),
      memory: new Map(),
      now: T0,
    }
    expect(gradeLesson(args)).toEqual(gradeLesson(args))
  })
})

describe('the walking skeleton, end to end', () => {
  it('composes, plays, grades, and moves a due date', () => {
    // compose → run the machine → grade → assert real state changed.
    const questions = composeLesson({
      index, memory: [], now: T0, rng: seededRng(42), locale: 'en', count: 5,
    })
    expect(questions.length).toBeGreaterThan(0)

    let s = started(questions)
    let t = T0
    while (!isFinished(s)) {
      t += 4_000
      s = answerCorrectly(s, t)
      t += 1_000
      s = transition(s, { type: 'CONTINUE', now: t })
    }

    expect(s.phase).toBe('summary')
    expect(s.answers).toHaveLength(questions.length)

    const graded = gradeLesson({
      lessonId: s.lessonId,
      answers: s.answers,
      memory: new Map(),
      now: t,
      isFirstLessonOfDay: true,
    })

    expect(graded.correct).toBe(questions.length)
    expect(graded.xpAwarded).toBeGreaterThan(0)
    expect(graded.reviews).toHaveLength(questions.length)

    for (const [, state] of graded.updatedMemory) {
      expect(state.dueAt).toBeGreaterThan(t)
      expect(state.reps).toBe(1)
    }
  })
})

describe('the timed mode', () => {
  const timed = (): LessonState => started(makeQuestions(2), { timeLimitMs: 10_000 })

  it('is off unless the mode asks for it', () => {
    // A LESSON property, not a template one. Whether a question is timed depends on
    // the mode the user chose, not on how the fact happens to be asked.
    expect(initialState().timeLimitMs).toBeNull()
    expect(initialState({ timeLimitMs: 8_000 }).timeLimitMs).toBe(8_000)
  })

  it('records a timeout as unanswered rather than as a wrong guess', () => {
    // The scheduler should treat "ran out of time" as weaker evidence than "chose the
    // wrong country", and the answer log has to be able to tell them apart.
    const s = transition(timed(), { type: 'TIMEOUT', now: T0 + 10_000 })
    expect(s.phase).toBe('answered')
    expect(s.answers).toHaveLength(1)
    expect(s.answers[0]!.chosenOptionId).toBeNull()
    expect(s.answers[0]!.wasCorrect).toBe(false)
  })

  it('costs no heart', () => {
    // Hearts are for getting something wrong. A clock running out is the mode being
    // hard, and charging twice for it turns a speed round into a punishment.
    const before = timed()
    const after = transition(before, { type: 'TIMEOUT', now: T0 + 10_000 })
    expect(after.hearts).toBe(before.hearts)
    expect(after.outOfHearts).toBe(false)
  })

  it('breaks the correct run, because the answer was not given', () => {
    const s = transition(timed(), { type: 'TIMEOUT', now: T0 + 10_000 })
    expect(s.correctRun).toBe(0)
  })

  it('is ignored in an untimed lesson', () => {
    // Firing this without a time limit is a caller bug; accepting it would mark an
    // answer the user never had a chance to give.
    const untimed = started(makeQuestions(1))
    expect(transition(untimed, { type: 'TIMEOUT', now: 999_999 })).toEqual(untimed)
  })

  it('is ignored once the question has already been answered', () => {
    const answered = answerCorrectly(timed(), T0 + 500)
    expect(transition(answered, { type: 'TIMEOUT', now: T0 + 10_000 })).toEqual(answered)
  })

  it('advances like any other answered question', () => {
    const s = transition(
      transition(timed(), { type: 'TIMEOUT', now: T0 + 10_000 }),
      { type: 'CONTINUE', now: T0 + 10_100 },
    )
    expect(s.phase).toBe('presenting')
    expect(s.index).toBe(1)
  })
})
