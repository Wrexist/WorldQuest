/**
 * The adaptive reorder: after two misses in a row, something easier comes next.
 *
 * What these protect is that it is only ever a REORDER — same questions, same length, nothing
 * dropped or repeated — because the Worker grades each answer by the slot it was issued in and
 * the scheduler learns from each fact once. The rest is when it acts and, as important, when
 * it must not.
 */
import { describe, expect, it } from 'vitest'
import type { Question } from '../content/types.js'
import { currentQuestion, initialState, transition, type LessonState } from './machine.js'

const T0 = 1_000_000

const q = (id: string, difficulty: number, over: Partial<Question> = {}): Question => ({
  item: { id: `geo.${id}.capital@t`, factId: `geo.${id}.capital`, templateId: 't', entityId: id, difficulty, screenReaderSafe: true },
  promptKey: 'k', promptParams: {},
  options: [{ id: 'right', label: 'r', isCorrect: true }, { id: 'wrong', label: 'w', isCorrect: false }],
  modality: 'text', timeLimitMs: null, isNew: false, ...over,
})

const start = (questions: Question[], options: Parameters<typeof initialState>[0] = {}): LessonState => {
  let s = initialState(options)
  s = transition(s, { type: 'LOAD', lessonId: 'l', now: T0 })
  return transition(s, { type: 'LOADED', questions, now: T0 })
}

let clock = T0
const answer = (s: LessonState, optionId: 'right' | 'wrong'): LessonState => {
  clock += 3000
  const checked = transition(transition(s, { type: 'SELECT', optionId, now: clock }), { type: 'CHECK', now: clock + 1 })
  return checked
}
const next = (s: LessonState): LessonState => transition(s, { type: 'CONTINUE', now: (clock += 100) })
const order = (s: LessonState): string[] => s.questions.map((x) => x.item.entityId)

// Hard ones first, then a spread: A..F are the ones the learner will fail on, G..J what is left.
const lesson = (): Question[] => [q('A', 4), q('B', 4), q('C', 5), q('D', 3), q('E', 1), q('F', 2), q('G', 4)]

describe('after two misses in a row', () => {
  it('puts the easiest question still to come next', () => {
    let s = start(lesson())
    s = next(answer(s, 'wrong'))
    s = answer(s, 'wrong') // the second miss: C (5) is next, E (1) is the easiest left
    expect(order(s).slice(2, 4)).toEqual(['E', 'D'])
    expect(currentQuestion(next(s))!.item.entityId).toBe('E')
  })

  it('only reorders: nothing added, dropped or repeated', () => {
    let s = start(lesson())
    const before = order(s).slice().sort()
    s = next(answer(next(answer(s, 'wrong')), 'wrong'))
    expect(order(s).slice().sort()).toEqual(before)
    expect(s.questions).toHaveLength(7)
  })

  it('leaves the order alone after one miss, or after a miss and a hit', () => {
    let s = start(lesson())
    const before = order(s)
    s = answer(s, 'wrong')
    expect(order(s)).toEqual(before)
    s = next(s)
    s = answer(s, 'right')
    expect(order(s)).toEqual(before)
    s = next(s)
    s = answer(s, 'wrong') // a miss after a hit is the first of a new run
    expect(order(s)).toEqual(before)
  })

  it('does nothing when the next question is already the easiest', () => {
    let s = start([q('A', 3), q('B', 3), q('C', 1), q('D', 2), q('E', 4), q('F', 5)])
    s = next(answer(s, 'wrong'))
    s = answer(s, 'wrong')
    expect(order(s)).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
  })

  it('never moves a matching board, or swaps one into the next place', () => {
    const board = (id: string, position: number): Question => q(id, 1, { group: { id: 'pairs.x', size: 2, position } })
    let s = start([q('A', 4), q('B', 4), board('P', 0), board('Q', 1), q('C', 5), q('D', 5)])
    s = next(answer(s, 'wrong'))
    s = answer(s, 'wrong') // next is the board's first question: leave it
    expect(order(s)).toEqual(['A', 'B', 'P', 'Q', 'C', 'D'])
  })

  it('never reaches for a typed question as the easy one', () => {
    const typed = q('T', 1, { typed: { accepts: ['x'] }, options: [{ id: 'T', label: 'x', isCorrect: true }] })
    let s = start([q('A', 4), q('B', 4), q('C', 5), q('D', 4), typed, q('E', 4)])
    s = next(answer(s, 'wrong'))
    s = answer(s, 'wrong')
    expect(order(s)[2]).not.toBe('T')
  })

  it('does nothing in a timed lesson, where there is no time to be kind', () => {
    let s = start(lesson(), { timeLimitMs: 10_000 })
    const before = order(s)
    s = next(answer(s, 'wrong'))
    s = answer(s, 'wrong')
    expect(order(s)).toEqual(before)
  })

  it('does nothing once hearts have run out', () => {
    let s = start(lesson(), { heartsEnabled: true })
    s = { ...s, hearts: 2 }
    s = next(answer(s, 'wrong'))
    s = answer(s, 'wrong')
    expect(s.outOfHearts).toBe(true)
    expect(order(s)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
  })

  it('never touches the review round', () => {
    // Miss everything, then keep missing in the review: it must stay in the order it was built in.
    let s = start([q('A', 4), q('B', 4), q('C', 4), q('D', 4), q('E', 4), q('F', 4)], { heartsEnabled: false })
    for (let i = 0; i < 6; i++) s = next(answer(s, 'wrong'))
    expect(s.reviewFrom).toBe(6)
    const review = order(s).slice(6)
    s = answer(s, 'wrong')
    s = next(s)
    s = answer(s, 'wrong')
    expect(order(s).slice(6)).toEqual(review)
  })

  it('can act again if the learner misses the easy one too', () => {
    let s = start([q('A', 5), q('B', 5), q('C', 5), q('D', 1), q('E', 2), q('F', 3)], { heartsEnabled: false })
    s = next(answer(s, 'wrong'))
    s = next(answer(s, 'wrong')) // D (1) is brought forward to be asked third
    expect(currentQuestion(s)!.item.entityId).toBe('D')
    s = next(answer(s, 'wrong')) // three in a row: the next easiest is brought forward too
    expect(currentQuestion(s)!.item.entityId).toBe('E')
  })
})
