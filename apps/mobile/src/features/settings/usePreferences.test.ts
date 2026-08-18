/**
 * One thing, and it is the one that was broken: several writes in a single handler.
 *
 * `usePreferences` built every write from the `preferences` of the render that created
 * the callback, so onboarding's three-in-a-row `set` calls all started from the same
 * snapshot. The last one won and the first two vanished — with no error, no warning,
 * and a settings screen that looked entirely correct because it only ever writes one
 * at a time.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { usePreferences } from './usePreferences.js'
import { clearAll, readJson, writeJson } from '../../lib/storage.js'
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

describe('usePreferences — a stored row this build cannot use', () => {
  const KEY = 'preferences.v1'

  beforeEach(() => clearAll())

  it('refuses a null where a boolean belongs', () => {
    // The exact crash the old comment named and the old code did not prevent: a spread
    // overrode `sound: false` with the stored `null`, and `<Switch value={null}>` is a
    // crash on a screen the user is looking at.
    writeJson(KEY, { sound: null, haptics: null })
    const { result } = renderHook(() => usePreferences())
    expect(result.current.preferences.sound).toBe(false)
    expect(result.current.preferences.haptics).toBe(true)
  })

  it('refuses a goal that is not one of the three', () => {
    // `lessonsPerDay(minutes, itemMs)` runs on this, so a string makes the daily goal on
    // Home `NaN` — and 999 would be a goal nobody can reach.
    writeJson(KEY, { dailyGoalMinutes: '10' })
    expect(renderHook(() => usePreferences()).result.current.preferences.dailyGoalMinutes).toBe(10)
    cleanup()
    writeJson(KEY, { dailyGoalMinutes: 999 })
    expect(renderHook(() => usePreferences()).result.current.preferences.dailyGoalMinutes).toBe(10)
  })

  it('still accepts every real value of a nullable preference', () => {
    // The regression the first attempt at this introduced: checking a stored value's
    // `typeof` against its DEFAULT's rejects `reminderHour: 19` outright, because the
    // default is null and `typeof null` is 'object'.
    writeJson(KEY, { reminderHour: 19, avatar: 'avatar-07', startRegion: 'EU' })
    const { preferences } = renderHook(() => usePreferences()).result.current
    expect(preferences.reminderHour).toBe(19)
    expect(preferences.avatar).toBe('avatar-07')
    expect(preferences.startRegion).toBe('EU')
  })

  it('rejects an hour that is not an hour', () => {
    writeJson(KEY, { reminderHour: 47 })
    expect(renderHook(() => usePreferences()).result.current.preferences.reminderHour).toBeNull()
  })

  it('keeps the good keys when one is bad', () => {
    // Preferences are independent. Losing somebody's language because their avatar was
    // malformed is a worse trade than the one this is fixing.
    writeJson(KEY, { language: 'sv', avatar: 42 })
    const { preferences } = renderHook(() => usePreferences()).result.current
    expect(preferences.language).toBe('sv')
    expect(preferences.avatar).toBeNull()
  })
})
