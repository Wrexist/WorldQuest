import { describe, expect, it } from 'vitest'
import { REPAIR_COOLDOWN_DAYS, REPAIR_PRICE } from '@worldquest/engines'
import { streakNotice, type StreakNoticeInput } from './streakNotice.js'

const DAY = 86_400_000
const today = '2026-09-25'
const now = Date.parse('2026-09-25T10:00:00Z')

/** A streak that is simply alive: active yesterday, nothing to say. */
const alive: StreakNoticeInput = {
  streak: 12,
  lastActiveDate: '2026-09-24',
  freezesHeld: 1,
  freezeUsedOn: null,
  brokenOn: null,
  lastRepairAt: null,
  longestStreak: 12,
  restoreTo: null,
  coins: 2000,
  today,
  now,
  timeZone: 'UTC',
  dismissed: [],
}

/** Broken yesterday, repairable, affordable. */
const broken: StreakNoticeInput = {
  ...alive,
  streak: 0,
  lastActiveDate: '2026-09-22',
  freezesHeld: 0,
  brokenOn: '2026-09-24',
  restoreTo: 10,
}

describe('streakNotice — nothing to say', () => {
  it('stays hidden for a streak that is simply alive', () => {
    expect(streakNotice(alive)).toBeNull()
  })

  it('stays hidden when there is no streak at all', () => {
    expect(streakNotice({ ...alive, streak: 0, lastActiveDate: null })).toBeNull()
  })
})

describe('streakNotice — a freeze that did its job', () => {
  it('says so the day after, on D1, where the next lesson spends the held freeze', () => {
    // Last active two days ago, a freeze held: the streak is alive only because of it.
    expect(streakNotice({ ...alive, lastActiveDate: '2026-09-23' })).toEqual({
      kind: 'freeze',
      id: 'freeze:2026-09-24',
      streak: 12,
    })
  })

  it('says so on the legacy backend, from the day the hourly job recorded', () => {
    // The job moved the last active day to the missed one and spent the freeze.
    expect(
      streakNotice({ ...alive, lastActiveDate: '2026-09-24', freezesHeld: 0, freezeUsedOn: '2026-09-24' }),
    ).toEqual({ kind: 'freeze', id: 'freeze:2026-09-24', streak: 12 })
  })

  it('does not claim a freeze that nothing shows was used', () => {
    // Two days back with no freeze held is a break, not a save.
    expect(streakNotice({ ...alive, lastActiveDate: '2026-09-23', freezesHeld: 0 })).toBeNull()
    // A freeze used last week is not today's news.
    expect(streakNotice({ ...alive, freezeUsedOn: '2026-09-18' })).toBeNull()
  })

  it('goes once a lesson today has spent it — the streak beat already said the rest', () => {
    expect(streakNotice({ ...alive, lastActiveDate: today })).toBeNull()
  })

  it('never comes back once dismissed', () => {
    expect(
      streakNotice({ ...alive, lastActiveDate: '2026-09-23', dismissed: ['freeze:2026-09-24'] }),
    ).toBeNull()
  })
})

describe('streakNotice — a streak that can be brought back', () => {
  it('names the length the server says a repair restores, and its price', () => {
    expect(streakNotice(broken)).toEqual({
      kind: 'repair',
      id: 'repair:2026-09-24',
      streak: 10,
      price: REPAIR_PRICE,
    })
  })

  it('never guesses the length — no stated number, no card', () => {
    // A cache from before the field existed. "Bring back your 214-day streak" with the
    // wrong number is a wrong price per day.
    expect(streakNotice({ ...broken, restoreTo: undefined })).toBeNull()
    expect(streakNotice({ ...broken, restoreTo: null })).toBeNull()
    expect(streakNotice({ ...broken, restoreTo: 1 })).toBeNull()
  })

  it('does not advertise a repair the learner cannot afford', () => {
    expect(streakNotice({ ...broken, coins: REPAIR_PRICE - 1 })).toBeNull()
  })

  it('goes quietly when the window closes, and during the cooldown', () => {
    expect(streakNotice({ ...broken, now: Date.parse('2026-09-26T00:00:01Z') })).toBeNull()
    expect(streakNotice({ ...broken, lastRepairAt: now - (REPAIR_COOLDOWN_DAYS - 1) * DAY })).toBeNull()
  })

  it('never carries a clock — there is nothing on it to count down', () => {
    const notice = streakNotice(broken)
    expect(notice).not.toBeNull()
    expect(Object.keys(notice!).sort()).toEqual(['id', 'kind', 'price', 'streak'])
  })

  it('never comes back once dismissed, and is never shown alongside a freeze card', () => {
    expect(streakNotice({ ...broken, dismissed: ['repair:2026-09-24'] })).toBeNull()
    // Broken wins: a freeze signal on a broken streak is history, not news.
    expect(streakNotice({ ...broken, freezeUsedOn: '2026-09-24', freezesHeld: 1 })?.kind).toBe('repair')
  })
})
