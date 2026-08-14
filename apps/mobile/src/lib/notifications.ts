/**
 * The daily reminder — the one notification a phone can send itself.
 *
 * ## Why the toggle has been lying since week one
 *
 * `settings:reminder.label` has been in the Settings screen, defaulting to ON, since
 * the first week. `notifications.json` has carried the copy for four notification types
 * since not much later. Nothing scheduled anything. A user who left the toggle alone —
 * which is all of them, because it defaults on — was promised a daily nudge and got
 * silence, and no test, screenshot or review could see it: the row renders, the switch
 * animates, the preference persists.
 *
 * ## Local, not push
 *
 * A daily reminder at an hour the user picked is entirely knowable on the device. So it
 * is scheduled with the OS and needs no server, no push token, no APNs certificate, and
 * works with the radio off. The other nine types in `docs/systems/notifications.md` §3
 * genuinely need the push service — `NEEDS_PUSH` in the engine names each one and why.
 *
 * ## The rules live in the engine
 *
 * §2 says the budget is "enforced in the scheduling service, not by convention", so
 * every decision here — whether, and at what hour — comes from `reminderPlan()`, which
 * is pure and tested. This file cancels everything and re-schedules from that plan on
 * every change. That is what makes one-per-day a rate limiter rather than an intention:
 * there is no code path that can add a second notification, because there is no code
 * path that adds one at all.
 *
 * ## Never throws
 *
 * Same contract as `haptics.ts` and `review.ts`. Notification scheduling fails on a
 * simulator, on web, and on a device whose user revoked permission between two lines of
 * this file. None of that is worth a crash on a screen someone is looking at.
 */

import * as Notifications from 'expo-notifications'
import { reminderPlan, type ReminderPlan } from '@worldquest/engines'
import { readJson, writeJson } from './storage.js'
import { readOnboarding } from '../features/onboarding/useOnboarding.js'

/** The same key `usePreferences` writes. Read directly so any module can schedule. */
const PREFERENCES_KEY = 'preferences.v1'

/** Local hours of recent finished lessons, newest last. */
const SESSIONS_KEY = 'sessions.hours.v1'

/**
 * The words, handed in by a caller that has a `t`.
 *
 * Passed rather than looked up here, and that is the point: the notification is written
 * ONCE, when it is scheduled, and then sits in the OS for as long as the schedule
 * stands. So the language it is written in is the language at scheduling time — which
 * is exactly why `syncReminder` has to run again when the user changes language, and
 * why that call site is easier to get right when the copy is visibly an input.
 */
export type ReminderCopy = { readonly title: string; readonly body: string }

/** The identifier the one scheduled reminder carries, so it can be replaced. */
const REMINDER_ID = 'worldquest.daily-reminder'

/**
 * Sessions kept for the suggestion.
 *
 * `notifications.md` §6 says "the median hour of their last 14 sessions". Fourteen is
 * also roughly two weeks of a daily habit, which is the window in which someone's
 * routine is still the routine they have now.
 */
const SESSION_WINDOW = 14

type StoredPreferences = {
  reminder?: boolean
  /** The chosen hour, or absent/null to use the learned suggestion. */
  reminderHour?: number | null
}

const preferences = (): StoredPreferences => readJson<StoredPreferences>(PREFERENCES_KEY) ?? {}

/** Local hours of the last `SESSION_WINDOW` finished lessons. */
export function recentSessionHours(): readonly number[] {
  return readJson<number[]>(SESSIONS_KEY) ?? []
}

/**
 * Called when a lesson finishes, beside `recordLessonCompleted`.
 *
 * The LOCAL hour, from the device clock, because the whole point is what time it feels
 * like to the person holding it. A user who flies to Tokyo starts contributing Tokyo
 * hours, and after a fortnight the suggestion has followed them.
 */
export function recordSessionHour(now: Date = new Date()): void {
  const hours = [...recentSessionHours(), now.getHours()].slice(-SESSION_WINDOW)
  writeJson(SESSIONS_KEY, hours)
}

const isChild = (): boolean => readOnboarding().isChild === true

/** Whether the OS currently permits notifications. Never throws; false when unsure. */
export async function hasPermission(): Promise<boolean> {
  try {
    const { granted } = await Notifications.getPermissionsAsync()
    return granted
  } catch {
    return false
  }
}

/**
 * Ask the OS, once.
 *
 * Called only from the in-context card, never on launch — `shouldAskForReminder()` in
 * the engine owns when that card appears, and §1 is explicit that a first-launch prompt
 * is what drives opt-in rates from 60% down to 30%.
 */
export async function requestPermission(): Promise<boolean> {
  try {
    const { granted } = await Notifications.requestPermissionsAsync()
    return granted
  } catch {
    return false
  }
}

/**
 * Bring the OS's schedule in line with the plan.
 *
 * Cancel-then-schedule rather than diff-then-patch. The plan is cheap to compute and
 * the schedule is one entry, so replacing it wholesale removes the entire class of bug
 * where a stale reminder from a previous hour survives a change — which on this feature
 * means a notification arriving at a time the user explicitly moved away from, i.e. the
 * single most uninstall-worthy thing a reminder can do.
 *
 * Resolves to the plan it applied, so a caller can say something true about it.
 */
export async function syncReminder(copy: ReminderCopy): Promise<ReminderPlan> {
  const plan = reminderPlan({
    // Absent means on: §3 lists the daily reminder as default ON, and a preferences
    // file written before this key existed must behave like an untouched toggle.
    enabled: preferences().reminder !== false,
    granted: await hasPermission(),
    isChild: isChild(),
    hour: preferences().reminderHour ?? null,
    sessionHours: recentSessionHours(),
  })

  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID)
  } catch {
    // Nothing was scheduled. Cancelling an identifier the OS has never heard of is an
    // error on Android and a no-op on iOS, and both mean "already in the desired state".
  }

  if (plan.kind !== 'daily') return plan

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: {
        title: copy.title,
        body: copy.body,
        // Home, quest card focused (§5). A notification never starts a lesson: the user
        // always chooses to begin, and that one rule is most of the difference between
        // an invitation and a shove.
        data: { url: 'worldquest://' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: plan.hour,
        minute: plan.minute,
      },
    })
  } catch {
    // See the header. A phone that will not schedule is not an error the user can act
    // on, and Settings reads the OS's own answer rather than trusting this call.
  }

  return plan
}

