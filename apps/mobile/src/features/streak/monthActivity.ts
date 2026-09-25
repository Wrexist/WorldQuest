/**
 * This month, one entry a day, laid out for the streak screen's calendar.
 *
 * It reads the same on-device lesson log as the week chart on Profile, so the two can
 * never disagree about a day. That log keeps 31 days, which always covers the current
 * month: today is at most the 31st, and the 1st is then 30 days back.
 *
 * Pure apart from the hook at the bottom, so the layout (where the 1st falls and how
 * the weeks break) is tested without a device.
 */

import { useMemo } from 'react'
import { localDay } from '../../lib/day.js'
import { firstWeekday } from '../../lib/week.js'
import { readActivityLog } from '../profile/useWeekActivity.js'

export type MonthCell = {
  readonly dayOfMonth: number
  /** Lessons finished that day. */
  readonly count: number
  readonly isToday: boolean
}

export type MonthActivity = {
  /** "September 2026", in the user's language. */
  readonly title: string
  /** One-letter weekday names, in the order the columns run. */
  readonly weekdays: readonly string[]
  /** Weeks of seven. `null` pads the days before the 1st and after the last. */
  readonly weeks: readonly (readonly (MonthCell | null)[])[]
  /** Days this month with at least one finished lesson. */
  readonly learnedDays: number
}

/** A known Sunday: adding n days to it gives the weekday n places after Sunday. */
const A_SUNDAY = new Date(2026, 0, 4)

/**
 * The calendar for the month `today` falls in.
 *
 * `firstWeekday` uses `expo-localization`'s numbering: 1 is Sunday, 2 is Monday.
 * `locale` is for tests; the app passes nothing and gets the device's.
 */
export function monthActivity(
  log: Readonly<Record<string, number>>,
  today: Date,
  firstWeekday: number,
  locale?: string,
): MonthActivity {
  const year = today.getFullYear()
  const month = today.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const start = firstWeekday - 1

  const weekdays = Array.from({ length: 7 }, (_, column) => {
    const at = new Date(A_SUNDAY)
    at.setDate(A_SUNDAY.getDate() + ((start + column) % 7))
    return at.toLocaleDateString(locale, { weekday: 'narrow' })
  })

  const cells: (MonthCell | null)[] = Array.from(
    { length: (new Date(year, month, 1).getDay() - start + 7) % 7 },
    () => null,
  )
  let learnedDays = 0
  for (let day = 1; day <= daysInMonth; day++) {
    const count = log[localDay(new Date(year, month, day))] ?? 0
    if (count > 0) learnedDays++
    cells.push({ dayOfMonth: day, count, isToday: day === today.getDate() })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  return {
    title: today.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
    weekdays,
    weeks: Array.from({ length: cells.length / 7 }, (_, week) =>
      cells.slice(week * 7, week * 7 + 7),
    ),
    learnedDays,
  }
}

/** This month from the device's lesson log, in the user's week. */
export function useMonthActivity(): MonthActivity {
  return useMemo(() => monthActivity(readActivityLog(), new Date(), firstWeekday()), [])
}
