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

import { useEffect, useMemo, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { lessonsPerDay } from '@worldquest/engines'
import { peekJson, writeJson } from '../../lib/storage.js'
import { lessonsToday } from '../profile/useWeekActivity.js'
import { localDay } from '../../lib/day.js'
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
 * The target already decided for `day`, or `null` when today has not been decided.
 *
 * Split out from `goalTargetFor` so that reading and writing are separable: the read
 * happens during render, the write happens in an effect, and nothing has to do both.
 */
function storedTargetFor(day: string, minutes: number): number | null {
  // `peekJson`, not `readJson`: this runs inside a `useMemo`, and `readJson` DELETES an
  // entry it cannot parse. A corrupt `goal.today.v1` therefore mutated storage from the
  // render path — the one thing the split below exists to prevent. A corrupt entry now
  // reads as "today is not decided", and the effect's write repairs it by overwriting,
  // which is a repair that happens after the render has committed.
  const { value } = peekJson<StoredGoal>(KEY)
  if (value === null || value.day !== day || value.minutes !== minutes) return null
  return value.target
}

/**
 * The target for `day` — the stored one if today has been decided, a fresh one if not.
 *
 * Exported and parameterised so it is testable without a clock or a React tree — the
 * date and the pace both come in, which is the same discipline `packages/engines` is
 * held to even though this file may touch storage.
 *
 * **Reads storage; never writes it.** It used to persist the decision inline, which made
 * it a side effect in the middle of a `useMemo` — work React is explicitly allowed to
 * throw away and re-run, so under StrictMode or a discarded concurrent render the day's
 * target could be written from a render that never committed. Persisting is now
 * `useDailyGoal`'s job, in an effect, after the render it belongs to has actually landed.
 */
export function goalTargetFor(day: string, minutes: number, itemMs: number): number {
  return storedTargetFor(day, minutes) ?? lessonsPerDay(minutes, itemMs)
}

export function useDailyGoal(): DailyGoal {
  const { preferences } = usePreferences()
  const itemMs = useItemPace()
  const minutes = preferences.dailyGoalMinutes

  // `done` is read every render on purpose — that number SHOULD move the instant a
  // lesson ends. It is the target that must hold still.
  const done = lessonsToday()

  // State with two triggers, not a value computed on render.
  //
  // Computing it on render fixed the first half of this: the date no longer hid inside a
  // memo, so any re-render picked up the new day. It did nothing for the second half —
  // a phone left on Home over midnight does not re-render, so `done` and `target` both
  // stayed on yesterday until something unrelated happened to touch the screen. The
  // first lesson of the new day then counted towards a goal that had already been met.
  //
  // Both triggers are needed and neither covers the other. The timer handles the phone
  // that is awake and on this screen at midnight; `AppState` handles the far commoner
  // case of a phone that was asleep through midnight and is picked up at breakfast,
  // where the timer may never have fired at all.
  const [day, setDay] = useState(() => localDay(new Date()))

  useEffect(() => {
    const tick = (): void => setDay(localDay(new Date()))

    // Re-armed on every `day` change rather than set once: an interval would drift, and
    // one timeout to the NEXT local midnight is exact. The extra second keeps it on the
    // right side of the boundary — firing at 23:59:59.999 would read yesterday's date
    // and re-arm for a millisecond later.
    const now = new Date()
    const midnight = new Date(now)
    midnight.setHours(24, 0, 1, 0)
    const timer = setTimeout(tick, midnight.getTime() - now.getTime())

    // Optional-chained on removal for the reason `useLesson` and `screenReader` both
    // state where they do the same: react-native-web has returned `undefined` from
    // `addEventListener` before, and an unguarded `.remove()` throws on every unmount.
    // This is Home — the screen mounted and unmounted more than any other — and it was
    // the one of the three left unguarded.
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') tick()
    }) as { remove?: () => void } | undefined

    return () => {
      clearTimeout(timer)
      subscription?.remove?.()
    }
  }, [day])

  const target = useMemo(
    () => goalTargetFor(day, minutes, itemMs),
    // `itemMs` is in the deps because it is read, and it is deliberately almost never
    // used: once the day is decided, `goalTargetFor` returns the stored number and the
    // pace is ignored until tomorrow. Leaving it out would be a lie about what this
    // depends on the one time per day it matters.
    [day, minutes, itemMs],
  )

  // The write, after the render that decided it committed. Guarded so a re-render does
  // not rewrite an identical row on every pass — and guarded on storage rather than on
  // a ref, because the decision has to survive the component unmounting, which is the
  // whole reason it is stored at all.
  useEffect(() => {
    if (storedTargetFor(day, minutes) !== null) return
    writeJson(KEY, { day, minutes, target } satisfies StoredGoal)
  }, [day, minutes, target])

  return { done, target }
}
