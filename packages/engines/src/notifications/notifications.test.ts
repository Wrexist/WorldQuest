import { describe, expect, it } from 'vitest'
import {
  CHILD_LATEST_HOUR,
  EARLIEST_HOUR,
  FALLBACK_HOUR,
  LATEST_HOUR,
  LESSONS_BEFORE_ASK,
  NEEDS_PUSH,
  REASK_AFTER_DAYS,
  allowedHours,
  clampHour,
  reminderPlan,
  shouldAskForReminder,
  suggestedHour,
} from './index.js'

const ZONE = 'Europe/Stockholm'
const at = (iso: string): number => Date.parse(iso)

const settings = {
  enabled: true,
  granted: true,
  isChild: false,
  hour: 19 as number | null,
  sessionHours: [] as readonly number[],
}

describe('quiet hours are a range, not a convention', () => {
  it('offers only hours between 08:00 and 20:00', () => {
    // 21:00–08:00 is quiet, "no exceptions" (notifications.md §2). 20 is the last hour
    // a reminder may fire; 21 is the first quiet one.
    const hours = allowedHours(false)
    expect(hours[0]).toBe(EARLIEST_HOUR)
    expect(hours[hours.length - 1]).toBe(LATEST_HOUR)
    expect(hours).not.toContain(21)
    expect(hours).not.toContain(7)
  })

  it('stops a child’s reminder before the evening', () => {
    // "1 per day, max, and never after 19:00" — so 18:00 is the last hour that fires
    // wholly before it.
    const hours = allowedHours(true)
    expect(hours[hours.length - 1]).toBe(CHILD_LATEST_HOUR)
    expect(hours).not.toContain(19)
    expect(hours).not.toContain(20)
  })

  it('clamps rather than refuses, so a reminder never silently stops existing', () => {
    // A user who chose 20:00 as an adult and is moved onto a child account must not end
    // up with a reminder that never fires and no explanation.
    expect(clampHour(20, true)).toBe(CHILD_LATEST_HOUR)
    expect(clampHour(23, false)).toBe(LATEST_HOUR)
    expect(clampHour(3, false)).toBe(EARLIEST_HOUR)
    expect(clampHour(Number.NaN, false)).toBe(FALLBACK_HOUR)
  })
})

describe('the suggested hour', () => {
  it('falls back to the early evening with nothing to learn from', () => {
    expect(suggestedHour([], false)).toBe(FALLBACK_HOUR)
  })

  it('uses the median, so one late night does not move it', () => {
    // A single 02:00 session on a flight would drag a MEAN by hours, and the whole
    // value of the suggestion is that it is when this person usually is free.
    expect(suggestedHour([18, 19, 19, 20, 2], false)).toBe(19)
    expect(suggestedHour([2, 19, 19], false)).toBe(19)
  })

  it('rounds an even count down rather than onto a half hour', () => {
    // 18 and 19 average to 18:30, which the picker cannot express. Early is a reminder
    // you can act on; late is one that arrives after the moment has passed.
    expect(suggestedHour([18, 19], false)).toBe(18)
  })

  it('still respects the child ceiling', () => {
    expect(suggestedHour([20, 20, 20], true)).toBe(CHILD_LATEST_HOUR)
  })

  it('ignores impossible hours rather than being poisoned by them', () => {
    expect(suggestedHour([99, -4, 1.5], false)).toBe(FALLBACK_HOUR)
  })
})

describe('the plan, which is the only thing the app may schedule', () => {
  it('schedules one daily reminder on the hour', () => {
    expect(reminderPlan(settings)).toEqual({ kind: 'daily', hour: 19, minute: 0 })
  })

  it('schedules nothing when the user turned it off', () => {
    expect(reminderPlan({ ...settings, enabled: false })).toEqual({ kind: 'none', reason: 'off' })
  })

  it('schedules nothing without permission, and says which it is', () => {
    // Settings has to be able to tell the two apart: "you turned this off" and "iOS
    // turned this off" need different sentences and different buttons.
    expect(reminderPlan({ ...settings, granted: false })).toEqual({
      kind: 'none',
      reason: 'no-permission',
    })
  })

  it('never returns an hour inside quiet hours, whatever it was handed', () => {
    for (const hour of [0, 3, 7, 21, 23, 47, -6]) {
      const plan = reminderPlan({ ...settings, hour })
      if (plan.kind !== 'daily') throw new Error('expected a daily plan')
      expect(plan.hour).toBeGreaterThanOrEqual(EARLIEST_HOUR)
      expect(plan.hour).toBeLessThanOrEqual(LATEST_HOUR)
    }
  })

  it('never returns an evening hour for a child, whatever it was handed', () => {
    for (const hour of [19, 20, 23]) {
      const plan = reminderPlan({ ...settings, hour, isChild: true })
      if (plan.kind !== 'daily') throw new Error('expected a daily plan')
      expect(plan.hour).toBeLessThanOrEqual(CHILD_LATEST_HOUR)
    }
  })

  it('learns the hour when the user has not chosen one', () => {
    expect(reminderPlan({ ...settings, hour: null, sessionHours: [17, 17, 18] })).toEqual({
      kind: 'daily',
      hour: 17,
      minute: 0,
    })
  })
})

describe('the ask happens twice, ever', () => {
  const asking = {
    lessonsCompleted: LESSONS_BEFORE_ASK,
    permissionAsked: false,
    granted: false,
    lastAskedAt: null as number | null,
    now: at('2026-08-14T12:00:00Z'),
    timeZone: ZONE,
  }

  it('never on first launch', () => {
    // The single most common notification mistake, and the reason opt-in rates sit at
    // 30% instead of 60%.
    expect(shouldAskForReminder({ ...asking, lessonsCompleted: 0 })).toBe(false)
    expect(shouldAskForReminder({ ...asking, lessonsCompleted: LESSONS_BEFORE_ASK - 1 })).toBe(
      false,
    )
  })

  it('after the third finished lesson', () => {
    expect(shouldAskForReminder(asking)).toBe(true)
  })

  it('not at all once permission is granted', () => {
    expect(shouldAskForReminder({ ...asking, granted: true, lessonsCompleted: 50 })).toBe(false)
  })

  it('waits ninety days after a refusal, then asks once more', () => {
    const refusedAt = at('2026-01-01T12:00:00Z')
    const after = (days: number): boolean =>
      shouldAskForReminder({
        ...asking,
        permissionAsked: true,
        lastAskedAt: refusedAt,
        now: refusedAt + days * 86_400_000,
      })

    expect(after(1)).toBe(false)
    expect(after(REASK_AFTER_DAYS - 1)).toBe(false)
    expect(after(REASK_AFTER_DAYS)).toBe(true)
  })

  it('and then never again', () => {
    // Two asks for the lifetime of the install. Anything more is the nagging the spec
    // exists to prevent.
    const refusedAt = at('2026-01-01T12:00:00Z')
    expect(
      shouldAskForReminder({
        ...asking,
        permissionAsked: true,
        lastAskedAt: refusedAt,
        now: refusedAt + REASK_AFTER_DAYS * 2 * 86_400_000,
      }),
    ).toBe(false)
  })

  it('does not spend the one retry on a dismissed card', () => {
    // Swiping our own card away is not the same as telling the OS no, and treating it
    // as a refusal would burn the retry on a user who never saw the system dialogue.
    expect(
      shouldAskForReminder({ ...asking, permissionAsked: false, lastAskedAt: asking.now - 1000 }),
    ).toBe(true)
  })
})

describe('what this deliberately does not do', () => {
  it('names every type that still needs the push service, with a reason', () => {
    // A local scheduler physically cannot do these — see the header. The list is in
    // code rather than only in the doc because this is what somebody will reach for
    // when they wire the server, and prose goes stale silently.
    for (const [type, reason] of Object.entries(NEEDS_PUSH)) {
      expect(reason.length, `${type} has no reason`).toBeGreaterThan(30)
    }
    expect(Object.keys(NEEDS_PUSH)).toContain('streak-at-risk')
    expect(Object.keys(NEEDS_PUSH)).toContain('comeback')
  })
})
