/**
 * A dismissed streak card stays dismissed — across a remount, and so across a relaunch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Progress } from '@worldquest/api'
import { clearAll } from '../../lib/storage.js'
import { useStreakNotice } from './useStreakNotice.js'

const progress: Progress = {
  xpTotal: 400,
  coins: 50,
  hearts: 5,
  streak: 12,
  longestStreak: 12,
  factsMastered: 3,
  // Two days before the pinned "today" below, with a freeze held: yesterday was covered.
  lastActiveDate: '2026-09-23',
  freezesHeld: 1,
  brokenOn: null,
  lastRepairAt: null,
  restoreTo: null,
}

beforeEach(() => {
  clearAll()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 25, 12, 0, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useStreakNotice', () => {
  it('shows the freeze card, and once dismissed never again', () => {
    const first = renderHook(() => useStreakNotice(progress, null))
    expect(first.result.current.notice?.kind).toBe('freeze')

    act(() => first.result.current.dismiss())
    expect(first.result.current.notice).toBeNull()
    first.unmount()

    // A fresh mount reads the dismissal back from storage.
    const again = renderHook(() => useStreakNotice(progress, null))
    expect(again.result.current.notice).toBeNull()
  })

  it('shows nothing before progress has arrived', () => {
    const { result } = renderHook(() => useStreakNotice(null, null))
    expect(result.current.notice).toBeNull()
    // And dismissing nothing is harmless.
    expect(() => act(() => result.current.dismiss())).not.toThrow()
  })
})
