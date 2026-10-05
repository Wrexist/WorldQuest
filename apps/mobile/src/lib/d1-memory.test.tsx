import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { announceFocusFinished, MEMORY_KEY, useCachedMemory } from './d1-memory.js'
import { startGuestStorage, writeJson } from './storage.js'

it('updates mounted fact progress after acknowledgment and clears it on account change', () => {
  startGuestStorage()
  const { result } = renderHook(() => useCachedMemory())
  expect(result.current.size).toBe(0)
  const fact = { factId: 'geo.SE.athlete-q104506', stability: 100, difficulty: 5, reps: 5, lapses: 0,
    lastReviewAt: 1000, dueAt: 100000, suspended: false }
  act(() => { writeJson(MEMORY_KEY, [fact]); announceFocusFinished() })
  expect(result.current.get(fact.factId)).toEqual(fact)
  act(() => startGuestStorage())
  expect(result.current.size).toBe(0)
})
