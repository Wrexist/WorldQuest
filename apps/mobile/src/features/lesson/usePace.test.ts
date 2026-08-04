import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  MAX_CREDITED_ANSWER_MS,
  MIN_CREDIBLE_ANSWER_MS,
  lessonLength,
  lessonsPerDay,
  type AnsweredItem,
} from '@worldquest/engines'
import { DEFAULT_ITEM_MS, medianOf, recordPace, resetPaceCache, useItemPace } from './usePace.js'
import { remove } from '../../lib/storage.js'

const answer = (elapsedMs: number, chosen: string | null = 'a'): AnsweredItem => ({
  itemId: 'i',
  factId: 'f',
  templateId: 't',
  chosenOptionId: chosen,
  wasCorrect: true,
  elapsedMs,
  answeredAt: 0,
})

beforeEach(() => {
  remove('pace.itemMs.v1')
  resetPaceCache()
})

describe('medianOf', () => {
  it('falls back to the documented default with no data', () => {
    expect(medianOf([])).toBe(DEFAULT_ITEM_MS)
  })

  it('is a median, not a mean — one abandoned question must not reshape every lesson', () => {
    // A mean of these is ~24s and would halve every later lesson.
    expect(medianOf([3000, 4000, 5000, 6000, 100_000])).toBe(5000)
  })

  it('takes a real sample on an even count rather than inventing an average', () => {
    expect(medianOf([4000, 6000])).toBe(4000)
  })
})

describe('recordPace', () => {
  it('starts at the default and moves to what the user actually does', () => {
    const { result } = renderHook(() => useItemPace())
    expect(result.current).toBe(DEFAULT_ITEM_MS)

    act(() => recordPace([answer(3000), answer(3000), answer(3000)]))
    expect(result.current).toBe(3000)
  })

  it('ignores a question that was never answered', () => {
    // A timeout says nothing about how fast this user answers.
    act(() => recordPace([answer(9999, null)]))
    const { result } = renderHook(() => useItemPace())
    expect(result.current).toBe(DEFAULT_ITEM_MS)
  })

  it('drops times outside the engine’s credible window', () => {
    // A ten-minute "answer" is a phone left on a table.
    act(() => recordPace([answer(MIN_CREDIBLE_ANSWER_MS - 1), answer(MAX_CREDITED_ANSWER_MS + 1)]))
    const { result } = renderHook(() => useItemPace())
    expect(result.current).toBe(DEFAULT_ITEM_MS)
  })

  it('survives a restart', () => {
    act(() => recordPace([answer(4000), answer(4000)]))
    resetPaceCache()
    const { result } = renderHook(() => useItemPace())
    expect(result.current).toBe(4000)
  })

  it('follows a user who speeds up rather than averaging their whole history', () => {
    // 40 slow answers, then 40 fast ones: the window has rolled over completely.
    act(() => recordPace(Array.from({ length: 40 }, () => answer(9000))))
    act(() => recordPace(Array.from({ length: 40 }, () => answer(3000))))
    const { result } = renderHook(() => useItemPace())
    expect(result.current).toBe(3000)
  })
})

describe('the daily goal actually depends on the goal', () => {
  it('gives a 5-minute user fewer lessons than a 20-minute user', () => {
    // The bug this whole file exists to fix: both numbers used to be identical
    // because neither function was ever called.
    const pace = 6000
    expect(lessonsPerDay(5, pace)).toBeLessThan(lessonsPerDay(20, pace))
  })

  it('always asks for at least one lesson', () => {
    expect(lessonsPerDay(1, 30_000)).toBeGreaterThanOrEqual(1)
  })

  it('sizes a lesson from pace, not from the goal', () => {
    // Lesson LENGTH is deliberately goal-independent — the goal controls how many
    // lessons, not how long one is. A slower user gets a shorter lesson.
    expect(lessonLength(12_000)).toBeLessThan(lessonLength(3000))
  })
})
