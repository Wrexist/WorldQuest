/**
 * How long today has left, formatted, ticking once a minute.
 *
 * ## Why a hook and not a line in each screen
 *
 * Two screens ask the same question — Home's quest card and the Quests tab both count
 * down to the same moment — and the answer needs three things a pure screen must not
 * have: a clock, a locale, and a timer. Written twice, the two would drift the first
 * time somebody decided the day ends at 04:00 instead of midnight, and they would drift
 * silently, because nothing renders them side by side.
 *
 * ## Local midnight, not UTC
 *
 * `setHours(24, 0, 0, 0)` is the next local midnight, which is the same day boundary
 * `isoDay` means everywhere else in this app. Getting that wrong is not academic: this
 * repo has already shipped a UTC day boundary once, and for everyone west of Greenwich
 * it reset the daily goal in the middle of their afternoon.
 *
 * ## It returns numbers, not a sentence
 *
 * It used to return the finished string, and the two callers wanted different sentences
 * around the same duration — "19h 41m left" on the card, "New quests in 19h 41m" under
 * the list. One of them ended up interpolating the other's, and the screen read "New
 * quests in 19h 41m left". Nesting one translated string inside another is the
 * concatenation rule wearing a placeholder's clothes: the wrapper cannot know whether
 * what it is wrapping already carries a verb. Two numbers, and each screen writes its own
 * whole sentence.
 *
 * ## A minute, not a second
 *
 * The reference shows hours and minutes, so a per-second tick would be a re-render a
 * second to redraw a number that changes once in sixty. The first render is exact and
 * every later one lands within a minute of the truth, which is all the copy can express.
 */

import { useEffect, useState } from 'react'

/** Named, because `1000 * 60 * 60` inside a countdown reads as a magic number. */
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/** Whole hours and whole minutes until the next local midnight. */
export type DayCountdown = { readonly hours: number; readonly minutes: number }

export function useDayCountdown(): DayCountdown {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), MINUTE_MS)
    return () => clearInterval(id)
  }, [])

  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  const left = Math.max(0, midnight.getTime() - now)

  return {
    hours: Math.floor(left / HOUR_MS),
    minutes: Math.floor((left % HOUR_MS) / MINUTE_MS),
  }
}
