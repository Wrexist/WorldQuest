/**
 * Typed answers through the lesson machine and the content engine.
 *
 * What is asserted is the part that would hurt if it were wrong: a typed answer is graded by
 * the same rules as a tapped one (hearts, runs, timing), it is never graded by an option id,
 * and what leaves the machine is an option id and never the text.
 */
import { describe, expect, it } from 'vitest'
import { seededRng } from '../shared/index.js'
import { BALANCE } from '../xp/balance.js'
import { buildIndex, buildQuestion, type Entity, type Fact, type Question, type Template } from '../content/index.js'
import { TYPED_WRONG } from '../content/typed.js'
import { initialState, transition, currentQuestion, type LessonState } from './machine.js'

const T0 = 1_000_000

const typedQuestion = (id: string, answer: string, isNew = false): Question => ({
  item: { id: `geo.${id}.capital@tpl.capital-typed.type`, factId: `geo.${id}.capital`, templateId: 'tpl.capital-typed.type', entityId: id, difficulty: 3, screenReaderSafe: true },
  promptKey: 'lesson:prompt.capital_of', promptParams: { entityName: id },
  options: [{ id, label: answer, isCorrect: true }],
  modality: 'text', timeLimitMs: null, isNew,
  typed: { accepts: [answer] },
})

const choice = (id: string): Question => ({
  item: { id: `geo.${id}.flag@t`, factId: `geo.${id}.flag`, templateId: 't', entityId: id, difficulty: 1, screenReaderSafe: true },
  promptKey: 'k', promptParams: {},
  options: [{ id: 'A', label: 'a', isCorrect: true }, { id: 'B', label: 'b', isCorrect: false }],
  modality: 'text', timeLimitMs: null, isNew: false,
})

const start = (questions: Question[], over: Parameters<typeof initialState>[0] = {}): LessonState => {
  let s = initialState(over)
  s = transition(s, { type: 'LOAD', lessonId: 'l', now: T0 })
  return transition(s, { type: 'LOADED', questions, now: T0 })
}
const type = (s: LessonState, text: string, now = T0 + 100): LessonState => transition(s, { type: 'TYPE', text, now })
const check = (s: LessonState, now = T0 + 4000): LessonState => transition(s, { type: 'CHECK', now })

describe('a typed question in the lesson machine', () => {
  it('grades what was typed when Check is pressed, and not before', () => {
    let s = start([typedQuestion('SE', 'Stockholm')])
    s = type(s, 'stockholm')
    expect(s.answers).toHaveLength(0)
    s = check(s)
    expect(s.answers).toHaveLength(1)
    expect(s.answers[0]!.wasCorrect).toBe(true)
    expect(s.answers[0]!.typedMatch).toBe('exact')
  })

  it('reports an option id, never the text: the right option when right, TYPED_WRONG when not', () => {
    const right = check(type(start([typedQuestion('SE', 'Stockholm')]), 'Stockholm'))
    expect(right.answers[0]!.chosenOptionId).toBe('SE')
    const wrong = check(type(start([typedQuestion('SE', 'Stockholm')]), 'Oslo'))
    expect(wrong.answers[0]!.chosenOptionId).toBe(TYPED_WRONG)
    expect(wrong.answers[0]!.wasCorrect).toBe(false)
  })

  it('counts a typo as right and says so', () => {
    const s = check(type(start([typedQuestion('SE', 'Stockholm')]), 'Stokholm'))
    expect(s.answers[0]!.wasCorrect).toBe(true)
    expect(s.answers[0]!.typedMatch).toBe('near')
  })

  it('ignores Check while nothing has been typed', () => {
    const s = start([typedQuestion('SE', 'Stockholm')])
    expect(check(s)).toBe(s)
    expect(check(type(s, '   ')).answers).toHaveLength(0)
  })

  it('cannot be answered or selected by option id', () => {
    const s = start([typedQuestion('SE', 'Stockholm')])
    expect(transition(s, { type: 'ANSWER', optionId: 'SE', now: T0 + 10 })).toBe(s)
    expect(transition(s, { type: 'SELECT', optionId: 'SE', now: T0 + 10 })).toBe(s)
  })

  it('ignores TYPE on a question with options', () => {
    const s = start([choice('SE')])
    expect(type(s, 'anything')).toBe(s)
  })

  it('keeps the text through the feedback and clears it for the next question', () => {
    let s = check(type(start([typedQuestion('SE', 'Stockholm'), typedQuestion('NO', 'Oslo')]), 'Stokholm'))
    expect(s.phase).toBe('answered')
    expect(s.typedText).toBe('Stokholm')
    s = transition(s, { type: 'CONTINUE', now: T0 + 5000 })
    expect(s.typedText).toBe('')
    expect(currentQuestion(s)!.item.entityId).toBe('NO')
  })

  it('costs a heart on a missed review and none on a new fact, like any other question', () => {
    const review = check(type(start([typedQuestion('SE', 'Stockholm', false)]), 'Oslo'))
    expect(review.hearts).toBe(BALANCE.hearts.max - 1)
    const fresh = check(type(start([typedQuestion('SE', 'Stockholm', true)]), 'Oslo'))
    expect(fresh.hearts).toBe(BALANCE.hearts.max)
  })

  it('grades what is typed when the clock runs out, and records no answer when nothing is', () => {
    const timed = (): LessonState => start([typedQuestion('SE', 'Stockholm')], { timeLimitMs: 10_000 })
    const typedInTime = transition(type(timed(), 'Stockholm'), { type: 'TIMEOUT', now: T0 + 10_050 })
    expect(typedInTime.answers[0]!.wasCorrect).toBe(true)
    const nothing = transition(timed(), { type: 'TIMEOUT', now: T0 + 10_050 })
    expect(nothing.answers[0]!.chosenOptionId).toBeNull()
  })

  it('truncates what is typed so a paste cannot be held in state', () => {
    const s = type(start([typedQuestion('SE', 'Stockholm')]), 'x'.repeat(500))
    expect(s.typedText.length).toBe(60)
  })

  it('re-asks a missed typed question in the review round as a typed question, text cleared', () => {
    let s = start([typedQuestion('SE', 'Stockholm')])
    s = check(type(s, 'Oslo'))
    s = transition(s, { type: 'CONTINUE', now: T0 + 5000 })
    expect(s.reviewFrom).toBe(1)
    expect(currentQuestion(s)!.typed).toBeDefined()
    expect(s.typedText).toBe('')
    s = check(type(s, 'Stockholm', T0 + 6000), T0 + 7000)
    expect(s.reviewed[0]!.wasCorrect).toBe(true)
    expect(s.answers).toHaveLength(1) // the review is practice: the first answer stays the evidence
  })
})

describe('buildQuestion for a typed template', () => {
  const entities: Entity[] = [
    { id: 'US', type: 'country', names: { en: 'United States', sv: 'USA' }, aliases: ['USA', 'United States of America'], region: 'NA', subregion: 'north-america' },
    { id: 'CA', type: 'country', names: { en: 'Canada', sv: 'Kanada' }, region: 'NA', subregion: 'north-america' },
  ]
  const facts: Fact[] = [
    { id: 'geo.US.capital', entity: 'US', attribute: 'capital', value: { names: { en: 'Washington, D.C.', sv: 'Washington, D.C.' } }, difficulty: 1, volatility: 'stable' },
    { id: 'geo.CA.capital', entity: 'CA', attribute: 'capital', value: { names: { en: 'Ottawa', sv: 'Ottawa' } }, difficulty: 1, volatility: 'stable' },
  ]
  const base = { modality: 'text', a11y: { screenReaderSafe: true }, timeLimitMs: null, difficultyModifier: 2, input: 'typed' } as const
  const forward: Template = { ...base, id: 'tpl.capital-typed.type', attribute: 'capital', prompt: { key: 'lesson:prompt.capital_of', params: ['entityName'] }, answer: { from: 'fact.value.names' } }
  const reverse: Template = { ...base, id: 'tpl.capital-reverse-typed.type', attribute: 'capital', prompt: { key: 'lesson:prompt.capital_reverse', params: ['valueName'] }, answer: { from: 'entity.names' } }
  const index = buildIndex({ entities, facts, templates: [forward, reverse] })

  it('builds a question with one option and the spellings that count', () => {
    const q = buildQuestion(index, index.itemsByFact.get('geo.US.capital')!.find((i) => i.templateId === forward.id)!, 'en', seededRng(1))!
    expect(q.options).toHaveLength(1)
    expect(q.options[0]!.isCorrect).toBe(true)
    expect(q.typed!.accepts).toEqual(expect.arrayContaining(['Washington, D.C.', 'Washington']))
  })

  it('accepts an entity\'s aliases when the answer is the country', () => {
    const q = buildQuestion(index, index.itemsByFact.get('geo.US.capital')!.find((i) => i.templateId === reverse.id)!, 'en', seededRng(1))!
    expect(q.typed!.accepts).toEqual(expect.arrayContaining(['United States', 'USA', 'United States of America']))
  })

  it('needs no distractors, so it builds where a four-option question could not', () => {
    // Two countries: a multiple-choice capital question would have too few wrong answers.
    expect(buildQuestion(index, index.itemsByFact.get('geo.CA.capital')!.find((i) => i.templateId === forward.id)!, 'en', seededRng(1))).not.toBeNull()
  })
})

describe('a typed question carries the other answers a typo must not become', () => {
  const entities: Entity[] = ['DK', 'SE', 'NO'].map((id) => ({ id, type: 'country', names: { en: id }, region: 'EU', subregion: 'north' }))
  const facts: Fact[] = [['DK', 'Danish krone', 'krone'], ['SE', 'Swedish krona', 'krona'], ['NO', 'Norwegian krone', 'krone']].map(([id, long, short]) => ({
    id: `geo.${id}.currency`, entity: id!, attribute: 'currency', value: { names: { en: long! }, shortNames: { en: short! } }, difficulty: 1, volatility: 'stable' as const,
  }))
  const template: Template = {
    id: 'tpl.currency-typed.type', attribute: 'currency', modality: 'text', input: 'typed', prompt: { key: 'lesson:prompt.currency_of', params: ['entityName'] },
    answer: { from: 'fact.value.names' }, a11y: { screenReaderSafe: true }, timeLimitMs: null, difficultyModifier: 2,
  }
  const index = buildIndex({ entities, facts, templates: [template] })
  const question = (id: string) => buildQuestion(index, index.itemsByFact.get(`geo.${id}.currency`)![0]!, 'en', seededRng(1))!

  it('lists the neighbour\'s currency as a rival', () => {
    expect(question('DK').typed!.rivals).toContain('krona')
  })

  it('marks "krona" wrong for Denmark in the machine, and "krone" right', () => {
    const play = (text: string) => check(type(start([question('DK')]), text))
    expect(play('krona').answers[0]!.wasCorrect).toBe(false)
    expect(play('krone').answers[0]!.wasCorrect).toBe(true)
    expect(play('Danish krone').answers[0]!.wasCorrect).toBe(true)
  })
})
