import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { clearAll, writeJson } from '../../lib/storage.js'
import { announceFocusFinished } from '../../lib/d1-memory.js'
import { localDay } from '../../lib/day.js'
import { recordLessonCompleted, useWeekActivity } from './useWeekActivity.js'
import { useMonthActivity } from '../streak/monthActivity.js'

beforeEach(() => clearAll())
describe('activity after PR 21 progress restoration', () => {
  it('refreshes both charts when a local lesson finishes', () => {
    const { result } = renderHook(() => ({ week: useWeekActivity(), month: useMonthActivity() }))
    expect(result.current.week[6]?.count).toBe(0)
    act(() => recordLessonCompleted())
    expect(result.current.week[6]?.count).toBe(1)
    expect(result.current.month.learnedDays).toBe(1)
  })
  it('refreshes mounted charts when restored server days are published', () => {
    const { result } = renderHook(() => ({ week: useWeekActivity(), month: useMonthActivity() }))
    act(() => {
      writeJson('activity.byDay.v1', { [localDay(new Date())]: 3 })
      writeJson('d1.focusFinished.v1', [{ focus: {}, finished: 3 }])
      announceFocusFinished()
    })
    expect(result.current.week[6]?.count).toBe(3)
    expect(result.current.month.learnedDays).toBe(1)
  })
})
