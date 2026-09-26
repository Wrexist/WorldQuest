import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

// The OS as it is on a fresh install: not yet allowed, and it says yes when asked.
let granted = false
vi.mock('expo-notifications', () => ({
  getPermissionsAsync: vi.fn(async () => ({ granted })),
  requestPermissionsAsync: vi.fn(async () => {
    granted = true
    return { granted: true }
  }),
  scheduleNotificationAsync: vi.fn(async () => 'id'),
  cancelScheduledNotificationAsync: vi.fn(async () => {}),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}))

import * as Notifications from 'expo-notifications'
import { clearAll, writeJson } from '../../lib/storage.js'
import { useReminderAsk } from './useReminderAsk.js'

beforeEach(async () => {
  await clearAll()
  vi.clearAllMocks()
  granted = false
})

describe("Home's reminder ask", () => {
  it('schedules the reminder the moment it is accepted, not on some later Settings visit', async () => {
    // Three lessons in, an adult, never asked: the ask is due.
    writeJson('activity.total.v1', 3)
    writeJson('onboarding.v1', { completed: true, birthYear: 1990, isChild: false })
    const { result } = renderHook(() => useReminderAsk())
    await waitFor(() => expect(result.current).toBeDefined())

    act(() => result.current?.onAccept())

    await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1))
    const request = vi.mocked(Notifications.scheduleNotificationAsync).mock.calls[0]![0]
    expect(request.trigger).toMatchObject({ type: 'daily' })
    expect(String(request.content.title).length).toBeGreaterThan(0)
  })

  it('schedules nothing when the OS says no', async () => {
    vi.mocked(Notifications.requestPermissionsAsync).mockResolvedValueOnce({ granted: false } as never)
    writeJson('activity.total.v1', 3)
    writeJson('onboarding.v1', { completed: true, birthYear: 1990, isChild: false })
    const { result } = renderHook(() => useReminderAsk())
    await waitFor(() => expect(result.current).toBeDefined())

    act(() => result.current?.onAccept())

    await waitFor(() => expect(result.current).toBeUndefined())
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled()
  })
})
