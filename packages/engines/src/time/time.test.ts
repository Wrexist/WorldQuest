import { describe, expect, it } from 'vitest'
import {
  applyActivity,
  daysBetween,
  isMilestone,
  nextMilestone,
  localDate,
  startOfLocalDay,
  type StreakState,
} from './index.js'

const STOCKHOLM = 'Europe/Stockholm'
const AUCKLAND = 'Pacific/Auckland'
const UTC = 'UTC'

const at = (iso: string): number => Date.parse(iso)

describe('localDate', () => {
  it('uses the user local day, not UTC', () => {
    // 23:30 UTC is already tomorrow in Stockholm. A UTC-based streak would tell
    // this user they missed a day when they did not.
    const instant = at('2026-03-10T23:30:00Z')
    expect(localDate(instant, UTC)).toBe('2026-03-10')
    expect(localDate(instant, STOCKHOLM)).toBe('2026-03-11')
  })

  it('handles a timezone a full day ahead', () => {
    const instant = at('2026-06-30T12:00:00Z')
    expect(localDate(instant, AUCKLAND)).toBe('2026-07-01')
  })

  it('handles the moment just after local midnight', () => {
    // 22:05 UTC = 00:05 the next day in Stockholm summer time.
    expect(localDate(at('2026-07-14T22:05:00Z'), STOCKHOLM)).toBe('2026-07-15')
  })
})

describe('startOfLocalDay', () => {
  it('returns an instant earlier than or equal to the input', () => {
    const instant = at('2026-07-15T14:23:45Z')
    expect(startOfLocalDay(instant, STOCKHOLM)).toBeLessThanOrEqual(instant)
  })

  it('lands on local midnight', () => {
    const instant = at('2026-07-15T14:23:45Z')
    const midnight = startOfLocalDay(instant, STOCKHOLM)
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: STOCKHOLM, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(midnight))
    expect(time).toBe('00:00')
  })

  it('is stable across the spring-forward transition', () => {
    // Europe/Stockholm springs forward on 2026-03-29. The local day is 23 hours.
    const before = startOfLocalDay(at('2026-03-29T00:30:00Z'), STOCKHOLM)
    const after = startOfLocalDay(at('2026-03-29T20:00:00Z'), STOCKHOLM)
    expect(localDate(before, STOCKHOLM)).toBe('2026-03-29')
    expect(localDate(after, STOCKHOLM)).toBe('2026-03-29')
  })

  it('is stable across the autumn fall-back transition', () => {
    // 2026-10-25 in Stockholm is 25 hours long. Dividing by 86400000 breaks here.
    const early = startOfLocalDay(at('2026-10-25T00:30:00Z'), STOCKHOLM)
    const late = startOfLocalDay(at('2026-10-25T22:00:00Z'), STOCKHOLM)
    expect(localDate(early, STOCKHOLM)).toBe('2026-10-25')
    expect(localDate(late, STOCKHOLM)).toBe('2026-10-25')
  })
})

describe('daysBetween', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-07-14', '2026-07-15')).toBe(1)
    expect(daysBetween('2026-07-14', '2026-07-14')).toBe(0)
    expect(daysBetween('2026-07-14', '2026-07-20')).toBe(6)
  })

  it('counts one day across a DST boundary, not 0.96 or 1.04', () => {
    // THE streak bug. A millisecond division across spring-forward yields 0.958
    // days, which floors to 0 and silently freezes the streak.
    expect(daysBetween('2026-03-28', '2026-03-29')).toBe(1)
    expect(daysBetween('2026-10-24', '2026-10-25')).toBe(1)
  })

  it('crosses month and year boundaries', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2028-02-28', '2028-02-29')).toBe(1) // leap year
  })

  it('is negative when going backwards', () => {
    expect(daysBetween('2026-07-15', '2026-07-14')).toBe(-1)
  })
})

describe('streaks', () => {
  const fresh: StreakState = {
    current: 0, longest: 0, lastActiveDate: null, freezesHeld: 0,
  }

  it('starts a streak on the first activity', () => {
    const s = applyActivity(fresh, at('2026-07-14T10:00:00Z'), STOCKHOLM)
    expect(s.current).toBe(1)
    expect(s.longest).toBe(1)
    expect(s.extended).toBe(true)
  })

  it('extends on a consecutive day', () => {
    const day1 = applyActivity(fresh, at('2026-07-14T10:00:00Z'), STOCKHOLM)
    const day2 = applyActivity(day1, at('2026-07-15T10:00:00Z'), STOCKHOLM)
    expect(day2.current).toBe(2)
    expect(day2.extended).toBe(true)
  })

  it('does not extend twice in one day', () => {
    // Five lessons is not a five-day streak.
    const morning = applyActivity(fresh, at('2026-07-14T07:00:00Z'), STOCKHOLM)
    const evening = applyActivity(morning, at('2026-07-14T21:00:00Z'), STOCKHOLM)
    expect(evening.current).toBe(1)
    expect(evening.extended).toBe(false)
  })

  it('survives the spring-forward day', () => {
    // The single most important test in this file: a 200-day streak must not die
    // to a clock change.
    const before: StreakState = {
      current: 200, longest: 200, lastActiveDate: '2026-03-28', freezesHeld: 0,
    }
    const s = applyActivity(before, at('2026-03-29T12:00:00Z'), STOCKHOLM)
    expect(s.current).toBe(201)
    expect(s.reset).toBe(false)
  })

  it('survives the fall-back day', () => {
    const before: StreakState = {
      current: 88, longest: 88, lastActiveDate: '2026-10-24', freezesHeld: 0,
    }
    const s = applyActivity(before, at('2026-10-25T12:00:00Z'), STOCKHOLM)
    expect(s.current).toBe(89)
    expect(s.reset).toBe(false)
  })

  it('survives a late-night session followed by an early-morning one', () => {
    // 23:50 then 00:10 is two calendar days and a legitimate extension, even
    // though only twenty minutes passed.
    const late = applyActivity(fresh, at('2026-07-14T21:50:00Z'), STOCKHOLM) // 23:50 local
    const early = applyActivity(late, at('2026-07-14T22:10:00Z'), STOCKHOLM) // 00:10 local
    expect(late.lastActiveDate).toBe('2026-07-14')
    expect(early.lastActiveDate).toBe('2026-07-15')
    expect(early.current).toBe(2)
  })

  it('consumes a freeze to cover exactly one missed day', () => {
    const before: StreakState = {
      current: 30, longest: 30, lastActiveDate: '2026-07-14', freezesHeld: 2,
    }
    const s = applyActivity(before, at('2026-07-16T10:00:00Z'), STOCKHOLM)
    expect(s.current).toBe(31)
    expect(s.freezeUsed).toBe(true)
    expect(s.freezesHeld).toBe(1)
    expect(s.reset).toBe(false)
  })

  it('resets after a missed day with no freeze', () => {
    const before: StreakState = {
      current: 30, longest: 30, lastActiveDate: '2026-07-14', freezesHeld: 0,
    }
    const s = applyActivity(before, at('2026-07-16T10:00:00Z'), STOCKHOLM)
    expect(s.current).toBe(1)
    expect(s.reset).toBe(true)
  })

  it('remembers the longest streak forever', () => {
    // A lost run still leaves an achievement behind rather than an erased year.
    const before: StreakState = {
      current: 120, longest: 120, lastActiveDate: '2026-07-01', freezesHeld: 0,
    }
    const s = applyActivity(before, at('2026-07-20T10:00:00Z'), STOCKHOLM)
    expect(s.current).toBe(1)
    expect(s.longest).toBe(120)
  })

  it('does not stretch a freeze across two missed days', () => {
    const before: StreakState = {
      current: 30, longest: 30, lastActiveDate: '2026-07-14', freezesHeld: 2,
    }
    const s = applyActivity(before, at('2026-07-17T10:00:00Z'), STOCKHOLM)
    expect(s.reset).toBe(true)
    expect(s.freezesHeld).toBe(2) // untouched, not wasted
  })

  it('follows the user when they travel', () => {
    // Flying Stockholm to Auckland must not cost a streak.
    const day1 = applyActivity(fresh, at('2026-07-14T10:00:00Z'), STOCKHOLM)
    expect(day1.lastActiveDate).toBe('2026-07-14')
    const day2 = applyActivity(day1, at('2026-07-14T22:00:00Z'), AUCKLAND) // 15th local
    expect(day2.current).toBe(2)
  })

  it('runs a full year without drifting across either DST change', () => {
    let state: StreakState = fresh
    // One activity a day, at a fixed UTC time, for 400 days across two transitions.
    let day = at('2026-01-01T12:00:00Z')
    for (let i = 0; i < 400; i++) {
      state = applyActivity(state, day, STOCKHOLM)
      day += 86_400_000
    }
    expect(state.current).toBe(400)
    expect(state.longest).toBe(400)
  })
})

describe('milestones', () => {
  it('fires on the documented days only', () => {
    expect(isMilestone(7)).toBe(true)
    expect(isMilestone(30)).toBe(true)
    expect(isMilestone(100)).toBe(true)
    expect(isMilestone(365)).toBe(true)
    expect(isMilestone(8)).toBe(false)
    expect(isMilestone(0)).toBe(false)
  })

  it('points at the next milestone from anywhere below it', () => {
    expect(nextMilestone(0)).toBe(7)
    expect(nextMilestone(6)).toBe(7)
    expect(nextMilestone(8)).toBe(30)
    expect(nextMilestone(99)).toBe(100)
  })

  it('looks past the one you are standing on', () => {
    // Strictly greater than. On the day you reach 7 the screen should say "you did it",
    // not "23 days to go" — and it decides that by asking `isMilestone` first, which
    // only works if this does not also return 7.
    expect(nextMilestone(7)).toBe(30)
    expect(nextMilestone(365)).toBeNull()
  })

  it('returns null past the last funded milestone rather than inventing one', () => {
    // The balance table pays for 7/30/100/365 and nothing else. A fifth number here
    // would promise a reward no ledger entry honours.
    expect(nextMilestone(400)).toBeNull()
  })
})
