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
import { localDay } from '../../lib/day.js'

/** `YYYY-MM-DD` → lessons completed. Written by the lesson runner on completion. */
const KEY = 'activity.byDay.v1'

export type WeekDay = { readonly day: string; readonly count: number }

// The local name this file has always used. `localDay` moved to `lib/day.ts` when a
// fourth caller needed it — see the note there about who should own "today".
const isoDay = localDay

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
