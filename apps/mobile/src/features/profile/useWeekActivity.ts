/**
 * Lessons per day for the last seven days, oldest first.
 *
 * Read from the device, not the server. A user who opens Profile on a plane should
 * still see the week they just had — and the local log is the one that is already
 * correct the instant a lesson ends, rather than after a sync.
 *
 * Always seven entries, including days with nothing. A chart of "days with activity"
 * would render a two-day week as a full bar chart, which flatters the user by lying
 * about the shape of their week.
 */

import { useMemo } from 'react'
import { readJson, writeJson } from '../../lib/storage.js'

/** `YYYY-MM-DD` → lessons completed. Written by the lesson runner on completion. */
const KEY = 'activity.byDay.v1'

export type WeekDay = { readonly day: string; readonly count: number }

/**
 * `YYYY-MM-DD` in the user's OWN day, not in UTC.
 *
 * It was `at.toISOString().slice(0, 10)`, and `toISOString` converts to UTC first — so
 * for everyone west of Greenwich the log's day boundary sat in the middle of their
 * afternoon. In California a lesson finished at 5pm was recorded against tomorrow: the
 * daily-goal line on Home reset while the user was still using the app, and Profile's
 * week chart put Monday evening's work on Tuesday's bar. `useWeekActivity` made it
 * visible by mixing the two — it walks back seven days with `setDate`, which is local,
 * and then formatted each one through this, which was not.
 *
 * Built from the local getters rather than `toLocaleDateString`, which needs a locale
 * whose calendar is Gregorian and whose digits are ASCII to produce this shape at all.
 *
 * Existing logs are not migrated. The values are the same shape and this is an activity
 * chart rather than a ledger, so the worst case is one historical bar sitting a day off
 * for a user who has already been counted wrong all along.
 */
const isoDay = (at: Date): string =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`

/** The same day key, for anything else that needs to ask "is this today?". */
export const localDay = isoDay

export function useWeekActivity(): readonly WeekDay[] {
  return useMemo(() => {
    const log = readJson<Record<string, number>>(KEY) ?? {}
    const today = new Date()

    return Array.from({ length: 7 }, (_, i) => {
      const at = new Date(today)
      at.setDate(today.getDate() - (6 - i))
      return {
        // One letter in the user's locale — seven full weekday names do not fit, and
        // hardcoding "M T W T F S S" is an English-only chart.
        day: at.toLocaleDateString(undefined, { weekday: 'narrow' }),
        count: log[isoDay(at)] ?? 0,
      }
    })
  }, [])
}

/**
 * Lessons finished today.
 *
 * Read straight from the same local log the weekly chart uses, so the daily-goal
 * line on Home and the bars on Profile can never disagree — and so both are right
 * the instant a lesson ends rather than after a sync.
 */
export function lessonsToday(now: Date = new Date()): number {
  const log = readJson<Record<string, number>>(KEY) ?? {}
  return log[isoDay(now)] ?? 0
}

/** Called when a lesson finishes. Idempotent per call, not per lesson id. */
export function recordLessonCompleted(now: Date = new Date()): void {
  const log = readJson<Record<string, number>>(KEY) ?? {}
  const day = isoDay(now)
  log[day] = (log[day] ?? 0) + 1

  // Keep a month, not forever. Nothing reads past seven days, and an unbounded map in
  // device storage is a slow leak that only shows up on a two-year-old install.
  const cutoff = new Date(now)
  cutoff.setDate(now.getDate() - 31)
  for (const key of Object.keys(log)) if (key < isoDay(cutoff)) delete log[key]

  writeJson(KEY, log)
}
