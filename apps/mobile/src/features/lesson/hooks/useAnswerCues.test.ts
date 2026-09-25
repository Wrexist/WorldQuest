import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { initialState, type AnsweredItem, type LessonState } from '@worldquest/engines'
import { useAnswerCues } from './useAnswerCues.js'
import { track } from '../../../lib/analytics.js'
import { hapticCorrect, hapticWrong } from '../../../lib/haptics.js'

vi.mock('../../../lib/analytics.js', () => ({ track: vi.fn() }))
vi.mock('../../../lib/haptics.js', () => ({ hapticCorrect: vi.fn(), hapticWrong: vi.fn() }))
vi.mock('../../../lib/sound.js', () => ({ soundCorrect: vi.fn(), soundWrong: vi.fn() }))

const answer = (over: Partial<AnsweredItem>): AnsweredItem => ({
  itemId: 'item',
  factId: 'fact.se.capital',
  templateId: 'tpl.capital-of.mc4',
  chosenOptionId: 'opt-a',
  wasCorrect: true,
  elapsedMs: 4_200,
  answeredAt: 1,
  ...over,
})

const withAnswers = (answers: readonly AnsweredItem[]): LessonState => ({
  ...initialState(),
  lessonId: 'lesson-1',
  phase: answers.length > 0 ? 'answered' : 'presenting',
  answers,
})

describe('useAnswerCues', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fires nothing for a question still being thought about', () => {
    renderHook(() => useAnswerCues(withAnswers([]), 5_000))
    expect(track).not.toHaveBeenCalled()
    expect(hapticCorrect).not.toHaveBeenCalled()
  })

  it('fires once per graded answer, with the time the MACHINE recorded', () => {
    // The machine stops the clock at Check; a second clock read here could disagree.
    const { rerender } = renderHook(({ s }) => useAnswerCues(s, 5_000), {
      initialProps: { s: withAnswers([]) },
    })
    const graded = withAnswers([answer({})])
    rerender({ s: graded })
    rerender({ s: { ...graded } })
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith(
      'question_answered',
      expect.objectContaining({ elapsed_ms: 4_200, correct: true, fact_id: 'fact.se.capital' }),
    )
    expect(hapticCorrect).toHaveBeenCalledTimes(1)
  })

  it('gives a wrong answer the gentle haptic', () => {
    const { rerender } = renderHook(({ s }) => useAnswerCues(s, 5_000), {
      initialProps: { s: withAnswers([]) },
    })
    rerender({ s: withAnswers([answer({ wasCorrect: false })]) })
    expect(hapticWrong).toHaveBeenCalledTimes(1)
    expect(hapticCorrect).not.toHaveBeenCalled()
  })

  it('stays silent when the clock ran out on nothing selected', () => {
    // Not something the user did, so nothing that could read as a reprimand.
    const { rerender } = renderHook(({ s }) => useAnswerCues(s, 5_000), {
      initialProps: { s: withAnswers([]) },
    })
    rerender({ s: withAnswers([answer({ chosenOptionId: null, wasCorrect: false })]) })
    expect(track).not.toHaveBeenCalled()
    expect(hapticWrong).not.toHaveBeenCalled()
  })
})
