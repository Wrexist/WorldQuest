import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('expo-notifications', () => ({
  getPermissionsAsync: vi.fn(async () => ({ granted: true })),
  requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: vi.fn(async () => 'id'),
  cancelScheduledNotificationAsync: vi.fn(async () => {}),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}))

import * as Notifications from 'expo-notifications'
import { recentSessionHours, recordSessionHour, syncReminder } from './notifications.js'
import { clearAll, writeJson } from './storage.js'

const getPermissionsAsync = vi.mocked(Notifications.getPermissionsAsync)
const scheduleNotificationAsync = vi.mocked(Notifications.scheduleNotificationAsync)
const cancelScheduledNotificationAsync = vi.mocked(Notifications.cancelScheduledNotificationAsync)

const source = readFileSync(join(import.meta.dirname, 'notifications.ts'), 'utf8')
const COPY = { title: 'Ready to explore?', body: 'Europe is waiting. 5 minutes?' }

beforeEach(() => {
  clearAll()
  vi.clearAllMocks()
  getPermissionsAsync.mockResolvedValue({ granted: true } as never)
})

describe('the schedule the OS ends up holding', () => {
  it('is exactly one daily notification, at the chosen hour', async () => {
    writeJson('preferences.v1', { reminder: true, reminderHour: 9 })

    await expect(syncReminder(COPY)).resolves.toEqual({ kind: 'daily', hour: 9, minute: 0 })
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1)

    const request = scheduleNotificationAsync.mock.calls[0]![0]
    expect(request.trigger).toMatchObject({ type: 'daily', hour: 9, minute: 0 })
    expect(request.content.body).toBe(COPY.body)
  })

  it('cancels the old one before writing a new one', async () => {
    // Cancel-then-schedule, never diff-then-patch. A stale reminder surviving a change
    // means a notification arriving at a time the user explicitly moved away from —
    // which is the most uninstall-worthy thing this feature can do.
    writeJson('preferences.v1', { reminder: true, reminderHour: 9 })
    await syncReminder(COPY)

    const cancelOrder = cancelScheduledNotificationAsync.mock.invocationCallOrder[0]!
    const scheduleOrder = scheduleNotificationAsync.mock.invocationCallOrder[0]!
    expect(cancelOrder).toBeLessThan(scheduleOrder)
  })

  it('cancels and schedules nothing when the toggle is off', async () => {
    writeJson('preferences.v1', { reminder: false })

    await expect(syncReminder(COPY)).resolves.toEqual({ kind: 'none', reason: 'off' })
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1)
    expect(scheduleNotificationAsync).not.toHaveBeenCalled()
  })

  it('schedules nothing without permission, however keen the preference is', async () => {
    writeJson('preferences.v1', { reminder: true, reminderHour: 9 })
    getPermissionsAsync.mockResolvedValue({ granted: false } as never)

    await expect(syncReminder(COPY)).resolves.toEqual({ kind: 'none', reason: 'no-permission' })
    expect(scheduleNotificationAsync).not.toHaveBeenCalled()
  })

  it('treats a preferences file written before this key existed as ON', async () => {
    // The daily reminder is default ON (notifications.md §3), and an install that
    // predates `reminderHour` must behave like an untouched toggle rather than like a
    // user who turned it off.
    writeJson('preferences.v1', { sound: false })

    const plan = await syncReminder(COPY)
    expect(plan.kind).toBe('daily')
  })

  it('never schedules inside quiet hours, whatever the stored hour says', async () => {
    // The stored value is not trusted: an old install, a hand-edited file, or a child
    // flag that arrived after the hour was chosen.
    for (const hour of [0, 3, 23]) {
      vi.clearAllMocks()
      writeJson('preferences.v1', { reminder: true, reminderHour: hour })
      await syncReminder(COPY)
      const trigger = scheduleNotificationAsync.mock.calls[0]![0].trigger as { hour: number }
      expect(trigger.hour).toBeGreaterThanOrEqual(8)
      expect(trigger.hour).toBeLessThanOrEqual(20)
    }
  })

  it('does not throw when the phone refuses to schedule', async () => {
    // Fails on a simulator, on web, and on a device whose user revoked permission
    // between two lines of this file. None of that is worth a crash.
    writeJson('preferences.v1', { reminder: true, reminderHour: 9 })
    scheduleNotificationAsync.mockRejectedValueOnce(new Error('no'))
    await expect(syncReminder(COPY)).resolves.toEqual({ kind: 'daily', hour: 9, minute: 0 })
  })
})

describe('the hours a reminder is learned from', () => {
  it('records the local hour a lesson finished at', () => {
    recordSessionHour(new Date(2026, 7, 14, 17, 45))
    expect(recentSessionHours()).toEqual([17])
  })

  it('keeps a fortnight and no more', () => {
    // notifications.md §6 says the median of the last 14. An unbounded array in device
    // storage is a slow leak that only shows up on a two-year-old install.
    for (let i = 0; i < 40; i++) recordSessionHour(new Date(2026, 7, 14, 9, 0))
    expect(recentSessionHours()).toHaveLength(14)
  })

  it('keeps the newest, not the oldest', () => {
    recordSessionHour(new Date(2026, 7, 1, 8, 0))
    for (let i = 0; i < 14; i++) recordSessionHour(new Date(2026, 7, 14, 19, 0))
    expect(recentSessionHours()).not.toContain(8)
  })
})

describe('the rules a runtime test cannot see', () => {
  it('makes no decision of its own — every one comes from the engine', () => {
    // notifications.md §2: "Enforced in the scheduling service, not by convention."
    // A quiet-hour or child rule re-derived here is a second copy that can disagree
    // with the tested one, and the app layer is the copy nobody tests.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).toMatch(/reminderPlan\(/)
    // No hour arithmetic outside the engine: no clamping, no comparison against 21, 8
    // or 19, no second opinion about who is a child.
    expect(code).not.toMatch(/\b(21|20|19|18|8)\s*[<>]/)
    expect(code).not.toMatch(/Math\.(min|max)/)
  })

  it('opens the app rather than starting a lesson', () => {
    // §5: "A notification never starts a lesson directly. The user always chooses to
    // begin." That one rule is most of the difference between an invitation and a shove.
    expect(source).toMatch(/worldquest:\/\/'/)
    expect(source).not.toMatch(/worldquest:\/\/lesson/)
  })
})
