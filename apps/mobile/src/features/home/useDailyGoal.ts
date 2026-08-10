/**
 * Today's goal: how many lessons, and how many of them are done.
 *
 * ## What reads this now
 *
 * One thing, and it renders no number: Home asks whether to offer another lesson AFTER
 * the daily quest is finished. The quest replaced this as the card's subject — five
 * tasks, about ten minutes, the same for everybody — and two answers to "how much per
 * day" on one screen was the duplication the whole rebuild removed.
 *
 * It is kept rather than deleted because deleting it would orphan the setting: the goal
 * is asked for in onboarding and shown in Settings, and a preference read by nothing is
 * the precise bug this file was written to fix in the first place. Reduced to one
 * decision it stays honest — somebody who asked for five minutes a day and finished the
 * quest is done; somebody who asked for twenty wants the offer.
 *
 * ## The bug this exists to close
 *
 * The target was recomputed on every render from `lessonsPerDay(goalMinutes, itemPace)`,
 * and `itemPace` is the median of the user's own recent answers — which changes the
 * moment a lesson ends. So finishing a lesson could make the day's target BIGGER, and
 * Home's bar, which had been filling, got longer instead.
 *
 * Caught by the `played-*` pass in `pnpm design:shots`: Home read "0 of 5 lessons today"
 * before a lesson and "1 of 30" after it. That harness answers every question in about
 * half a second so the swing is extreme, but the direction is the same on a device, and
 * the direction is the whole problem. A goal that grows when you make progress is not a
 * goal — it is the app moving the finish line while the user is running at it.
 *
 * ## The fix, and what it deliberately does not touch
 *
 * A target is a promise about TODAY, so it is decided once per local day and then held.
 * Pace measured today shapes tomorrow's target, which is when a person would expect their
 * pace to count anyway.
 *
 * Nothing about lesson SIZE changes. `lessonLength()` still adapts to the measured pace on
 * every lesson — that is the mechanic that keeps "five minutes a day" a real promise, and
 * it has no finish line to move. Only the count of lessons in a day is pinned, because
 * only the count is shown to the user as something to reach.
 *
 * ## Why it re-decides when the user changes their goal
 *
 * Someone who moves the Settings slider from 5 minutes to 20 has asked for a different
 * day, and making them wait until midnight for the number to agree with the switch they
 * just flipped would read as the setting being broken — the same complaint that got
 * `lessonsPerDay` wired up in the first place. So the stored record carries the minutes it
 * was computed from, and disagreeing with the current preference re-decides it.
 */

import { useMemo } from 'react'
import { lessonsPerDay } from '@worldquest/engines'
import { readJson, writeJson } from '../../lib/storage.js'
import { lessonsToday, localDay } from '../profile/useWeekActivity.js'
import { useItemPace } from '../lesson/usePace.js'
import { usePreferences } from '../settings/usePreferences.js'

const KEY = 'goal.today.v1'

type StoredGoal = {
  /** The local day this target was decided for. */
  readonly day: string
  /** The preference it was decided from, so changing the setting re-decides it. */
  readonly minutes: number
  readonly target: number
}

export type DailyGoal = {
  readonly done: number
  readonly target: number
}

/**
 * The target for `day`, deciding and storing it if it has not been decided yet.
 *
 * Exported and parameterised so it is testable without a clock or a React tree — the
 * date and the pace both come in, which is the same discipline `packages/engines` is
 * held to even though this file may touch storage.
 */
export function goalTargetFor(day: string, minutes: number, itemMs: number): number {
  const stored = readJson<StoredGoal>(KEY)
  if (stored !== null && stored.day === day && stored.minutes === minutes) return stored.target

  const target = lessonsPerDay(minutes, itemMs)
  writeJson(KEY, { day, minutes, target } satisfies StoredGoal)
  return target
}

export function useDailyGoal(): DailyGoal {
  const { preferences } = usePreferences()
  const itemMs = useItemPace()
  const minutes = preferences.dailyGoalMinutes

  // `done` is read every render on purpose — that number SHOULD move the instant a
  // lesson ends. It is the target that must hold still.
  const done = lessonsToday()

  const target = useMemo(
    () => goalTargetFor(localDay(new Date()), minutes, itemMs),
    // `itemMs` is in the deps because it is read, and it is deliberately almost never
    // used: once the day is decided, `goalTargetFor` returns the stored number and the
    // pace is ignored until tomorrow. Leaving it out would be a lie about what this
    // depends on the one time per day it matters.
    [minutes, itemMs],
  )

  return { done, target }
}
