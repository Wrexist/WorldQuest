import { describe, expect, it } from 'vitest'
import { buildIndex, buildQuestion, composeLesson, seededRng, type Entity, type Fact, type Template } from '@worldquest/engines'
import entities from '../../content/packs/geography/entities.countries.v1.json' with { type: 'json' }
import capitals from '../../content/packs/geography/facts.capitals.v1.json' with { type: 'json' }
import templates from '../../content/packs/geography/templates.v1.json' with { type: 'json' }
import { parseD1Question } from './d1-learning-contracts.js'

const index = buildIndex({ entities: entities.items as unknown as Entity[], facts: capitals.items as unknown as Fact[],
  templates: templates.items as unknown as Template[] })
const typedItem = index.items.find(item => index.templates.get(item.templateId)?.input === 'typed')!
const typed = buildQuestion(index, typedItem, 'sv', seededRng(1))!

describe('the questions the lesson composer actually emits', () => {
  it('preserves typed questions, including accepted spellings and near rivals', () => {
    expect(typed.typed?.accepts.length).toBeGreaterThan(0)
    expect(typed.options).toHaveLength(1)
    expect(parseD1Question(JSON.parse(JSON.stringify(typed)))).toEqual(typed)
  })

  it('preserves a matching board through the network/storage boundary', () => {
    const questions = composeLesson({ index, memory: [], now: 1, rng: seededRng(1), locale: 'sv', count: 10, maxModifier: 0 })
    expect(questions.filter(q => q.group)).toHaveLength(4)
    expect(questions.map(q => parseD1Question(JSON.parse(JSON.stringify(q))))).toEqual(questions)
  })

  it('refuses a single exposed answer unless there is a valid typed-answer contract', () => {
    const { typed: _typed, ...withoutTyping } = typed
    for (const value of [withoutTyping, { ...typed, typed: {} }, { ...typed, typed: { accepts: [] } },
      { ...typed, typed: { accepts: [42] } }, { ...typed, typed: { accepts: ['valid'], rivals: [false] } },
      { ...typed, options: [...typed.options, { id: 'wrong', label: 'Wrong', isCorrect: false }] }]) {
      expect(() => parseD1Question(value)).toThrow('INVALID_RESPONSE')
    }
  })

  it('refuses malformed board coordinates and a typed question on a board', () => {
    const board = composeLesson({ index, memory: [], now: 1, rng: seededRng(1), locale: 'sv', count: 10, maxModifier: 0 })
      .find(q => q.group)!
    for (const group of [{ id: 'board', size: 4, position: 4 }, { id: 'board', size: 4, position: -1 },
      { id: 'board', size: 1, position: 0 }, { id: 'board', size: 4, position: 0.5 }]) {
      expect(() => parseD1Question({ ...board, group })).toThrow('INVALID_RESPONSE')
    }
    expect(() => parseD1Question({ ...typed, group: board.group })).toThrow('INVALID_RESPONSE')
  })
})
