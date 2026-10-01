import { describe, expect, it } from 'vitest'
import { TYPED_WRONG, type Question } from '@worldquest/engines'
import { slotsFor } from './src/lesson-tickets'

const question = (over: Partial<Question> & { options: Question['options'] }): Question => ({
  item: { id: 'geo.SE.capital@t', factId: 'geo.SE.capital', templateId: 't', entityId: 'SE', difficulty: 2, screenReaderSafe: true },
  promptKey: 'k', promptParams: {}, modality: 'text', timeLimitMs: null, isNew: false, ...over,
})

describe('the answer key the Worker keeps per question', () => {
  it('lets a typed question be answered wrongly, with an option id like every other answer', () => {
    const [slot] = slotsFor([question({ options: [{ id: 'SE', label: 'Stockholm', isCorrect: true }], typed: { accepts: ['Stockholm'] } })])
    expect(slot!.options).toEqual(['SE', TYPED_WRONG])
    expect(slot!.correctOptionId).toBe('SE')
  })

  it('offers the typed sentinel on typed questions only', () => {
    const [slot] = slotsFor([question({ options: [
      { id: 'SE', label: 'Stockholm', isCorrect: true }, { id: 'NO', label: 'Oslo', isCorrect: false },
    ] })])
    expect(slot!.options).toEqual(['SE', 'NO'])
    expect(slot!.options).not.toContain(TYPED_WRONG)
  })

  it('refuses a question with no single right answer', () => {
    expect(() => slotsFor([question({ options: [{ id: 'A', label: 'a', isCorrect: false }] })])).toThrow()
    expect(() => slotsFor([question({ options: [{ id: 'A', label: 'a', isCorrect: true }, { id: 'B', label: 'b', isCorrect: true }] })])).toThrow()
  })
})
