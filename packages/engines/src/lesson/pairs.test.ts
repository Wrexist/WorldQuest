import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { seededRng } from '../shared/index.js'
import { BALANCE } from '../xp/balance.js'
import { buildIndex, type Entity, type Fact, type Question, type Template } from '../content/index.js'
import { composeLesson } from './compose.js'
import { PAIR_SIZE, pairUp } from './pairs.js'
import { currentQuestion, initialState, transition, type LessonState } from './machine.js'

const T0 = 1_000_000
const PACKS = join(import.meta.dirname, '../../../content/packs/geography')
const read = <T,>(f: string): T[] => JSON.parse(readFileSync(join(PACKS, f), 'utf8')).items

const forward: Template = {
  id: 'tpl.capital.mc4', attribute: 'capital', modality: 'text', prompt: { key: 'lesson:prompt.capital_of', params: ['entityName'] },
  answer: { from: 'fact.value.names' }, a11y: { screenReaderSafe: true }, timeLimitMs: null, difficultyModifier: 0,
}
const reverse: Template = { ...forward, id: 'tpl.capital-reverse.mc4', answer: { from: 'entity.names' }, prompt: { key: 'lesson:prompt.capital_reverse', params: ['valueName'] } }

const CITIES: [string, string][] = [['SE', 'Stockholm'], ['NO', 'Oslo'], ['DK', 'Copenhagen'], ['FI', 'Helsinki'], ['IS', 'Reykjavik'], ['EE', 'Tallinn'], ['LV', 'Riga'], ['LT', 'Vilnius']]
const entities: Entity[] = CITIES.map(([id]) => ({ id, type: 'country', names: { en: `Land ${id}` }, region: 'EU', subregion: 'north' }))
const facts: Fact[] = CITIES.map(([id, city]) => ({ id: `geo.${id}.capital`, entity: id, attribute: 'capital', value: { names: { en: city } }, difficulty: 1, volatility: 'stable' }))
const index = buildIndex({ entities, facts, templates: [forward, reverse] })
const attributeOf = (q: Question) => index.facts.get(q.item.factId)?.attribute

/** A forward capital question as `buildQuestion` makes it: the entity in the prompt, option ids are entity ids. */
const capitalQuestion = (id: string): Question => {
  const city = CITIES.find(([c]) => c === id)![1]
  const others = CITIES.filter(([c]) => c !== id).slice(0, 3)
  return {
    item: { id: `geo.${id}.capital@tpl.capital.mc4`, factId: `geo.${id}.capital`, templateId: 'tpl.capital.mc4', entityId: id, difficulty: 1, screenReaderSafe: true },
    promptKey: 'lesson:prompt.capital_of', promptParams: { entityName: `Land ${id}` },
    options: [{ id, label: city, isCorrect: true }, ...others.map(([c, n]) => ({ id: c, label: n, isCorrect: false }))],
    modality: 'text', timeLimitMs: null, isNew: false,
  }
}
const lesson = (ids: string[]): Question[] => ids.map(capitalQuestion)

describe('pairUp', () => {
  const eight = lesson(['SE', 'NO', 'DK', 'FI', 'IS', 'EE', 'LV', 'LT'])

  it('turns four questions into one board and leaves the rest alone', () => {
    const out = pairUp(eight, { index, rng: seededRng(1), attributeOf })
    expect(out).toHaveLength(8)
    expect(out.filter((q) => q.group !== undefined)).toHaveLength(PAIR_SIZE)
    expect(out.filter((q) => q.group === undefined)).toHaveLength(8 - PAIR_SIZE)
  })

  it('keeps the four consecutive, in position order, in the earliest member\'s place', () => {
    const out = pairUp(eight, { index, rng: seededRng(1), attributeOf })
    const first = out.findIndex((q) => q.group !== undefined)
    expect(first).toBe(0)
    for (let i = 0; i < PAIR_SIZE; i++) {
      expect(out[first + i]!.group).toMatchObject({ size: PAIR_SIZE, position: i })
      expect(out[first + i]!.group!.id).toBe(out[first]!.group!.id)
    }
  })

  it('gives every member the same cards in the same order, with exactly its own pair right', () => {
    const board = pairUp(eight, { index, rng: seededRng(2), attributeOf }).filter((q) => q.group)
    const order = board[0]!.options.map((o) => o.id)
    for (const q of board) {
      expect(q.options.map((o) => o.id)).toEqual(order)
      expect(q.options.filter((o) => o.isCorrect).map((o) => o.id)).toEqual([q.item.entityId])
    }
    // Four cards, and they are the four members' own answers.
    expect(new Set(order)).toEqual(new Set(board.map((q) => q.item.entityId)))
  })

  it('keeps every member a valid question of its own: same item, same fact, same prompt', () => {
    const before = new Map(eight.map((q) => [q.item.id, q]))
    for (const q of pairUp(eight, { index, rng: seededRng(3), attributeOf }).filter((x) => x.group)) {
      expect(q.item).toEqual(before.get(q.item.id)!.item)
      expect(q.promptKey).toBe(before.get(q.item.id)!.promptKey)
    }
  })

  it('does nothing in a lesson too short to spare four questions', () => {
    const short = eight.slice(0, 6)
    expect(pairUp(short, { index, rng: seededRng(1), attributeOf })).toEqual(short)
  })

  it('does nothing when the lesson has fewer than four DIFFERENT answers to put on a board', () => {
    const three = lesson(['SE', 'NO', 'DK'])
    const eightWithThree = [...three, ...three, ...three.slice(0, 2)].map((q, i) => ({ ...q, item: { ...q.item, id: `${q.item.id}-${i}` } }))
    expect(eightWithThree).toHaveLength(8)
    expect(pairUp(eightWithThree, { index, rng: seededRng(1), attributeOf }).filter((q) => q.group)).toHaveLength(0)
  })

  it('never puts two cards that read the same on one board', () => {
    const twins = lesson(['SE', 'NO', 'DK', 'FI', 'IS', 'EE', 'LV', 'LT']).map((q, i) =>
      i < 2 ? { ...q, options: q.options.map((o) => (o.isCorrect ? { ...o, label: 'Same' } : o)) } : q)
    for (const q of pairUp(twins, { index, rng: seededRng(1), attributeOf }).filter((x) => x.group)) {
      const labels = q.options.map((o) => o.label)
      expect(new Set(labels).size).toBe(labels.length)
    }
  })

  it('never takes a reverse question: the answer would be on both sides of the board', () => {
    const reverseOnes = eight.map((q) => ({ ...q, item: { ...q.item, templateId: 'tpl.capital-reverse.mc4' } }))
    expect(pairUp(reverseOnes, { index, rng: seededRng(1), attributeOf }).some((q) => q.group)).toBe(false)
  })

  it('is deterministic', () => {
    expect(pairUp(eight, { index, rng: seededRng(4), attributeOf })).toEqual(pairUp(eight, { index, rng: seededRng(4), attributeOf }))
  })
})

describe('a board in the lesson machine', () => {
  const boardLesson = (): LessonState => {
    let s = initialState()
    s = transition(s, { type: 'LOAD', lessonId: 'l', now: T0 })
    return transition(s, { type: 'LOADED', questions: pairUp(lesson(['SE', 'NO', 'DK', 'FI', 'IS', 'EE', 'LV', 'LT']), { index, rng: seededRng(1), attributeOf }), now: T0 })
  }
  const memberIds = (s: LessonState) => s.questions.filter((q) => q.group).map((q) => q.item.id)
  const rightChoices = (s: LessonState) => Object.fromEntries(s.questions.filter((q) => q.group).map((q) => [q.item.id, q.item.entityId]))

  it('grades the whole board at once, one answer per fact, and lands on the board\'s last question', () => {
    const s0 = boardLesson()
    const s = transition(s0, { type: 'ANSWER_GROUP', choices: rightChoices(s0), now: T0 + 8000 })
    expect(s.answers).toHaveLength(PAIR_SIZE)
    expect(s.answers.every((a) => a.wasCorrect)).toBe(true)
    expect(s.answers.map((a) => a.itemId)).toEqual(memberIds(s0))
    expect(s.phase).toBe('answered')
    expect(s.index).toBe(PAIR_SIZE - 1)
  })

  it('moves on to the first question after the board', () => {
    const s0 = boardLesson()
    const s = transition(transition(s0, { type: 'ANSWER_GROUP', choices: rightChoices(s0), now: T0 + 8000 }), { type: 'CONTINUE', now: T0 + 9000 })
    expect(currentQuestion(s)!.group).toBeUndefined()
    expect(s.index).toBe(PAIR_SIZE)
  })

  it('shares the time between the pairs, so the last is not charged for the first', () => {
    const s0 = boardLesson()
    const s = transition(s0, { type: 'ANSWER_GROUP', choices: rightChoices(s0), now: T0 + 8000 })
    expect(s.answers.map((a) => a.elapsedMs)).toEqual([2000, 2000, 2000, 2000])
  })

  it('records every miss as a miss but charges at most one heart for the board', () => {
    const s0 = boardLesson()
    const wrong = Object.fromEntries(s0.questions.filter((q) => q.group).map((q) => [q.item.id, q.options.find((o) => !o.isCorrect)!.id]))
    const s = transition(s0, { type: 'ANSWER_GROUP', choices: wrong, now: T0 + 8000 })
    expect(s.answers.filter((a) => !a.wasCorrect)).toHaveLength(PAIR_SIZE)
    expect(s.hearts).toBe(BALANCE.hearts.max - 1)
    expect(s.heartsLost).toBe(1)
  })

  it('scores each pair on its own: one wrong first try is one miss', () => {
    const s0 = boardLesson()
    const choices = rightChoices(s0)
    const target = memberIds(s0)[1]!
    const q = s0.questions.find((x) => x.item.id === target)!
    const s = transition(s0, { type: 'ANSWER_GROUP', choices: { ...choices, [target]: q.options.find((o) => !o.isCorrect)!.id }, now: T0 + 8000 })
    expect(s.answers.map((a) => a.wasCorrect)).toEqual([true, false, true, true])
  })

  it('ignores a board that is missing an answer, or names one the pair does not have', () => {
    const s0 = boardLesson()
    const choices = rightChoices(s0)
    const [first] = memberIds(s0)
    const { [first!]: _dropped, ...partial } = choices
    expect(transition(s0, { type: 'ANSWER_GROUP', choices: partial, now: T0 + 8000 })).toBe(s0)
    expect(transition(s0, { type: 'ANSWER_GROUP', choices: { ...choices, [first!]: 'ZZ' }, now: T0 + 8000 })).toBe(s0)
  })

  it('ignores ANSWER_GROUP on an ordinary question and mid-board', () => {
    let s = boardLesson()
    s = transition(transition(s, { type: 'ANSWER_GROUP', choices: rightChoices(s), now: T0 + 8000 }), { type: 'CONTINUE', now: T0 + 9000 })
    expect(transition(s, { type: 'ANSWER_GROUP', choices: {}, now: T0 + 9500 })).toBe(s)
  })

  it('re-asks a missed pair in the review round as an ordinary question', () => {
    const s0 = boardLesson()
    const choices = rightChoices(s0)
    const target = memberIds(s0)[0]!
    const q = s0.questions.find((x) => x.item.id === target)!
    let s = transition(s0, { type: 'ANSWER_GROUP', choices: { ...choices, [target]: q.options.find((o) => !o.isCorrect)!.id }, now: T0 + 8000 })
    // Answer the rest of the lesson correctly.
    s = transition(s, { type: 'CONTINUE', now: T0 + 9000 })
    while (s.phase === 'presenting' && s.reviewFrom === null) {
      const next = currentQuestion(s)!
      s = transition(transition(s, { type: 'SELECT', optionId: next.options.find((o) => o.isCorrect)!.id, now: T0 + 9100 }), { type: 'CHECK', now: T0 + 9200 })
      s = transition(s, { type: 'CONTINUE', now: T0 + 9300 })
    }
    expect(s.reviewFrom).not.toBeNull()
    const review = currentQuestion(s)!
    expect(review.item.id).toBe(target)
    expect(review.group).toBeUndefined()
  })
})

describe('composeLesson with boards', () => {
  const entities2 = read<Entity>('entities.countries.v1.json')
  const real = buildIndex({
    entities: entities2,
    facts: ['capitals', 'flags', 'currencies', 'locations', 'languages', 'calling-codes'].flatMap((f) => read<Fact>(`facts.${f}.v1.json`)),
    templates: read<Template>('templates.v1.json'),
  })
  const compose = (seed: number, extra: Record<string, unknown> = {}) =>
    composeLesson({ index: real, memory: [], now: T0, rng: seededRng(seed), locale: 'en', count: 10, ...extra })

  it('puts a board in a gentle lesson, and only one', () => {
    let boards = 0
    for (let seed = 1; seed <= 30; seed++) {
      const groups = new Set(compose(seed, { maxModifier: 0 }).filter((q) => q.group).map((q) => q.group!.id))
      expect(groups.size).toBeLessThanOrEqual(1)
      boards += groups.size
    }
    expect(boards).toBeGreaterThan(0)
  })

  it('keeps the lesson the length that was asked for', () => {
    for (let seed = 1; seed <= 30; seed++) expect(compose(seed, { maxModifier: 0 })).toHaveLength(10)
  })

  it('draws no board at the top of the ramp, where the learner types instead', () => {
    for (let seed = 1; seed <= 30; seed++) expect(compose(seed, { maxModifier: 2 }).some((q) => q.group)).toBe(false)
  })

  it('draws no board when the caller cannot', () => {
    for (let seed = 1; seed <= 30; seed++) expect(compose(seed, { maxModifier: 0, pairs: false }).some((q) => q.group)).toBe(false)
  })
})
