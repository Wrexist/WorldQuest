/**
 * The daily reminder, as Settings sees it.
 *
 * Three things a screen needs and cannot get from a preference alone: what the OS
 * currently permits, what hour a reminder would actually fire at, and a way to change
 * either that re-schedules rather than just writing a boolean.
 *
 * ## Why the toggle asks for permission
 *
 * `notifications.md` §1 forbids a first-launch prompt and asks for the OS dialogue "in
 * context". Turning ON a switch labelled "Daily reminder" is the most in-context this
 * gets: the user has just said, in as many words, that they want the notification. So
 * the switch asks, and if the answer is no it goes back to off rather than sitting on
 * while nothing is scheduled — a toggle that stays on and does nothing is precisely the
 * lie this feature has been since the first week.
 */

import { useCallback, useEffect, useState } from 'react'
import { allowedHours, clampHour, suggestedHour } from '@worldquest/engines'
import {
  hasPermission,
  recentSessionHours,
  requestPermission,
  syncReminder,
  type ReminderCopy,
} from '../../lib/notifications.js'
import { readOnboarding } from '../onboarding/useOnboarding.js'
import { usePreferences } from './usePreferences.js'

export type UseReminder = {
  /** The toggle's value — the preference AND a permission that makes it real. */
  readonly enabled: boolean
  /** True when the user wants reminders and the OS refuses. Settings says so. */
  readonly blocked: boolean
  /** The hour it would fire at: chosen, or learned from recent sessions. */
  readonly hour: number
  /** Under-13, which caps the hour earlier and is why the help text differs. */
  readonly isChild: boolean
  /** Absent at the end of the range rather than wrapping — see `StepperRow`. */
  readonly earlier: (() => void) | undefined
  readonly later: (() => void) | undefined
  readonly setEnabled: (value: boolean) => void
}

export function useReminder(copy: ReminderCopy): UseReminder {
  const { preferences, set } = usePreferences()
  const [granted, setGranted] = useState(false)

  /**
   * Read ONCE, at mount, rather than on every render.
   *
   * `recentSessionHours()` reaches device storage, and this repo has already been bitten
   * by a hook that read storage during render: `readJson` deletes an entry it cannot
   * parse, React is allowed to throw a render away and run it again, and a delete from
   * in there is a side effect nobody asked for that StrictMode performs twice. The log
   * only changes when a lesson ends, and a lesson cannot end while Settings is open.
   */
  const [sessionHours] = useState(recentSessionHours)
  const isChild = readOnboarding().isChild === true

  // Asked on mount, and re-asked after any change, because the answer can move while
  // the app is backgrounded — a user can revoke this in iOS Settings and come straight
  // back to this screen, which would otherwise still be drawing a switch that is on.
  const refresh = useCallback(async (): Promise<void> => {
    setGranted(await hasPermission())
  }, [])

  /**
   * Re-schedule whenever anything the plan reads has changed.
   *
   * Including the copy, which changes with the language: the notification's words are
   * fixed when it is scheduled and then sit in the OS for months, so switching to
   * Swedish and not re-scheduling leaves an English reminder arriving every evening.
   */
  useEffect(() => {
    void syncReminder(copy).then(refresh)
  }, [preferences.reminder, preferences.reminderHour, copy.title, copy.body, refresh])

  const hours = allowedHours(isChild)
  const hour =
    preferences.reminderHour === null
      ? suggestedHour(sessionHours, isChild)
      : clampHour(preferences.reminderHour, isChild)

  const move = (by: number) => () => {
    // Writing the hour is also how "learn it for me" is opted out of — see the
    // `reminderHour` note in `usePreferences`. Stepping is an explicit choice.
    set('reminderHour', clampHour(hour + by, isChild))
  }

  const setEnabled = (value: boolean): void => {
    if (!value) {
      set('reminder', false)
      return
    }
    // On. Ask the OS if we have not been told yet, and only keep the switch on if the
    // answer was yes.
    void (async () => {
      const ok = (await hasPermission()) || (await requestPermission())
      setGranted(ok)
      set('reminder', ok)
    })()
  }

  return {
    // Both halves. A preference that says yes over a permission that says no is not an
    // enabled reminder, and drawing it as one is the original bug in a smaller box.
    enabled: preferences.reminder && granted,
    blocked: preferences.reminder && !granted,
    hour,
    isChild,
    earlier: hour > hours[0]! ? move(-1) : undefined,
    later: hour < hours[hours.length - 1]! ? move(1) : undefined,
    setEnabled,
  }
}
