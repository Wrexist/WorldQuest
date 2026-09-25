import { describe, expect, it } from 'vitest'
import { monthActivity } from './monthActivity.js'

// 1 September 2026 is a Tuesday; the month has 30 days.
const TODAY = new Date(2026, 8, 25, 12)
const SUNDAY = 1
const MONDAY = 2

const days = (month: ReturnType<typeof monthActivity>) =>
  month.weeks.flat().filter((cell) => cell !== null)

describe('the month calendar', () => {
  it('starts the week where the user does, and puts the 1st under the right day', () => {
    const monday = monthActivity({}, TODAY, MONDAY, 'en-US')
    expect(monday.weekdays).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S'])
    expect(monday.weeks[0]?.[1]?.dayOfMonth).toBe(1)

    const sunday = monthActivity({}, TODAY, SUNDAY, 'en-US')
    expect(sunday.weekdays).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S'])
    expect(sunday.weeks[0]?.[2]?.dayOfMonth).toBe(1)
  })

  it('draws every day of the month once, in whole weeks', () => {
    const month = monthActivity({}, TODAY, MONDAY, 'en-US')
    expect(days(month).map((cell) => cell.dayOfMonth)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    )
    for (const week of month.weeks) expect(week).toHaveLength(7)
    expect(month.title).toBe('September 2026')
  })

  it('counts the learned days of this month only, and marks today', () => {
    const log = { '2026-09-23': 1, '2026-09-24': 3, '2026-09-25': 1, '2026-08-31': 2 }
    const month = monthActivity(log, TODAY, MONDAY, 'en-US')
    expect(month.learnedDays).toBe(3)
    expect(days(month).filter((cell) => cell.count > 0).map((cell) => cell.dayOfMonth)).toEqual([
      23, 24, 25,
    ])
    expect(days(month).filter((cell) => cell.isToday).map((cell) => cell.dayOfMonth)).toEqual([25])
  })

  it('handles a month that starts on the first day of the week', () => {
    // 1 February 2026 is a Sunday: no padding before it in a Sunday-first week.
    const month = monthActivity({}, new Date(2026, 1, 10), SUNDAY, 'en-US')
    expect(month.weeks[0]?.[0]?.dayOfMonth).toBe(1)
    expect(days(month)).toHaveLength(28)
    expect(month.weeks).toHaveLength(4)
  })
})
