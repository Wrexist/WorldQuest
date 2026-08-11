/**
 * One thing, and it is the one that was broken: several writes in a single handler.
 *
 * `usePreferences` built every write from the `preferences` of the render that created
 * the callback, so onboarding's three-in-a-row `set` calls all started from the same
 * snapshot. The last one won and the first two vanished — with no error, no warning,
 * and a settings screen that looked entirely correct because it only ever writes one
 * at a time.
 */

import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePreferences } from './usePreferences.js'
import { readJson } from '../../lib/storage.js'
import type { Preferences } from './usePreferences.js'

describe('usePreferences', () => {
  it('keeps every write when three land in one handler', () => {
    // Exactly what `app/(auth)/onboarding.tsx` does when the flow finishes.
    const { result } = renderHook(() => usePreferences())
    act(() => {
      result.current.set('startRegion', 'Africa')
      result.current.set('startLevel', 'confident')
      result.current.set('dailyGoalMinutes', 20)
    })

    expect(result.current.preferences.startRegion).toBe('Africa')
    expect(result.current.preferences.startLevel).toBe('confident')
    expect(result.current.preferences.dailyGoalMinutes).toBe(20)
  })

  it('persists all three, so the next cold start still has them', () => {
    // In-memory state agreeing with itself is not the promise. The promise is that the
    // answers survive the app being closed, and that is the file on device.
    const { result } = renderHook(() => usePreferences())
    act(() => {
      result.current.set('startRegion', 'Asia')
      result.current.set('startLevel', 'new')
      result.current.set('dailyGoalMinutes', 5)
    })

    const stored = readJson<Partial<Preferences>>('preferences.v1')
    expect(stored?.startRegion).toBe('Asia')
    expect(stored?.startLevel).toBe('new')
    expect(stored?.dailyGoalMinutes).toBe(5)
  })
})
