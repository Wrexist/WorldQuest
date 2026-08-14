/**
 * When — and whether — the daily reminder fires.
 *
 * ## Why this is an engine and not a hook
 *
 * `docs/systems/notifications.md` §2 states the frequency budget and then says the
 * thing that matters: "**Enforced in the scheduling service, not by convention.** The
 * budget is a rate limiter in code; a new notification type cannot bypass it." A rule
 * that lives in the screen that happens to schedule is a rule the next screen skips.
 * So the decision is a pure function of state, tested here, and the app layer's whole
 * job is to hand it the state and carry out the answer.
 *
 * Pure by the package's rules: no `Date.now()`, no `Math.random()`, no I/O. Every
 * instant and every timezone arrives as an argument.
 *
 * ## What is in scope for v1.0
 *
 * The **daily reminder** only — the one row of §3's table that needs no server. It is a
 * repeating local notification at an hour the user picks, which means it works offline,
 * needs no push infrastructure, and cannot be sent by anybody but the user's own phone.
 *
 * The other nine types in that table are triggered by state the device does not know
 * (a friend passing you, a league boundary, an event starting) or by absence (comeback
 * after 3/7/14/30 days), and absence is precisely what a local scheduler cannot
 * observe. They need the push service, and shipping a hollow version of them here
 * would be the dead-shell pattern this repo has already removed twice.
 *
 * "Streak at risk" is the interesting near-miss: it is local-only in principle — 3h
 * before local midnight, streak ≥ 3, nothing done today. But "nothing done today" is
 * knowable only at fire time, and a local notification's content is fixed when it is
 * scheduled. Firing it and then discovering the user already practised is exactly the
 * guilt-trip the spec forbids. It needs the server, and it is listed as such.
 */

import { localDate } from '../time/index.js'

/**
 * Quiet hours: 21:00 – 08:00 local, "no exceptions" (§2).
 *
 * Stated as the first and last hour that are ALLOWED, because that is what the picker
 * and the validator both need and deriving it twice is how they come to disagree.
 */
export const EARLIEST_HOUR = 8
export const LATEST_HOUR = 20

/** Child accounts: one a day at most, and never after 19:00 (§2). */
export const CHILD_LATEST_HOUR = 18

/** Used when there is no session history to learn from (§6). */
export const FALLBACK_HOUR = 19

/** Sessions needed before the ask, so it lands in context rather than on launch (§1). */
export const LESSONS_BEFORE_ASK = 3

/** How long we wait before asking a second and final time after a refusal (§1). */
export const REASK_AFTER_DAYS = 90

/** The hours a reminder may be scheduled at, for this account. */
export function allowedHours(isChild: boolean): readonly number[] {
  const last = isChild ? CHILD_LATEST_HOUR : LATEST_HOUR
  return Array.from({ length: last - EARLIEST_HOUR + 1 }, (_, i) => EARLIEST_HOUR + i)
}

/**
 * Pull an hour into the allowed range rather than rejecting it.
 *
 * A user who picked 20:00 as an adult and is then moved onto a child account must not
 * end up with a reminder that never fires and no explanation. Clamping is the honest
 * repair: the reminder still happens, an hour earlier, and Settings shows the hour it
 * will actually use.
 */
export function clampHour(hour: number, isChild: boolean): number {
  const last = isChild ? CHILD_LATEST_HOUR : LATEST_HOUR
  if (!Number.isFinite(hour)) return FALLBACK_HOUR
  return Math.min(Math.max(Math.round(hour), EARLIEST_HOUR), last)
}

/**
 * The hour to suggest, learned from when this person actually practises (§6).
 *
 * The MEDIAN of the last sessions, not the mean: one 02:00 session on a flight would
 * drag a mean far enough to move the suggestion by hours, and the whole value of the
 * suggestion is that it is when they usually are free.
 *
 * Rounded DOWN to the hour, then clamped. Someone who practises at 19:50 is offered
 * 19:00 rather than 20:00 — early is a reminder they can act on, late is one that
 * arrives after the moment has passed.
 */
export function suggestedHour(sessionHours: readonly number[], isChild: boolean): number {
  const usable = sessionHours.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
  if (usable.length === 0) return clampHour(FALLBACK_HOUR, isChild)

  const sorted = [...usable].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  // Even counts take the LOWER of the two middles, for the same reason as the rounding
  // above, and because it keeps the function total — an average of the pair could land
  // on a half hour that the picker cannot express.
  const median = sorted.length % 2 === 1 ? sorted[middle]! : sorted[middle - 1]!
  return clampHour(median, isChild)
}

/** Everything the ask decision depends on. */
export type AskSituation = {
  /** Lessons finished, ever. The ask waits for the third (§1). */
  readonly lessonsCompleted: number
  /** Whether the OS has already been asked, by us or by anyone. */
  readonly permissionAsked: boolean
  /** Whether the OS says yes right now. */
  readonly granted: boolean
  /** When we last put the in-context ask on screen, or null. */
  readonly lastAskedAt: number | null
  readonly now: number
  readonly timeZone: string
}

/**
 * Should the in-context "Want a nudge?" card appear?
 *
 * Never on first launch, never before the third lesson, and — after a refusal — once
 * more at ninety days and then never again (§1). Two asks, total, for the lifetime of
 * the install. Anything more is the nagging the spec exists to prevent.
 */
export function shouldAskForReminder(situation: AskSituation): boolean {
  if (situation.granted) return false
  if (situation.lessonsCompleted < LESSONS_BEFORE_ASK) return false
  if (situation.lastAskedAt === null) return true
  // The second and final ask. `permissionAsked` distinguishes "they dismissed our card"
  // from "they told the OS no": only a real refusal spends the one retry.
  if (!situation.permissionAsked) return true

  const days = daysApart(situation.lastAskedAt, situation.now, situation.timeZone)
  return days >= REASK_AFTER_DAYS && days < REASK_AFTER_DAYS * 2
}

/**
 * Calendar days between two instants in the user's own zone.
 *
 * Not a millisecond division: the same reason `time/index.ts` refuses to count
 * 86,400,000 — a local day is 23 or 25 hours twice a year, and this decides whether a
 * ninety-day silence is over.
 */
function daysApart(from: number, to: number, timeZone: string): number {
  const a = localDate(from, timeZone)
  const b = localDate(to, timeZone)
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number]
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** What the app layer should have scheduled with the OS, right now. */
export type ReminderPlan =
  | { readonly kind: 'none'; readonly reason: ReminderSuppression }
  | { readonly kind: 'daily'; readonly hour: number; readonly minute: 0 }

/** Why nothing is scheduled. Named so Settings can say something true about it. */
export type ReminderSuppression = 'off' | 'no-permission'

/** The stored state a reminder is planned from. */
export type ReminderSettings = {
  /** The Settings toggle. On by default (§3), and the user's word is final. */
  readonly enabled: boolean
  readonly granted: boolean
  readonly isChild: boolean
  /** The chosen hour, or null to use the suggestion. */
  readonly hour: number | null
  /** Local hours of recent sessions, for the suggestion. */
  readonly sessionHours: readonly number[]
}

/**
 * The whole scheduling decision, in one pure call.
 *
 * There is deliberately no way for a caller to schedule an hour this did not return.
 * The app layer cancels everything and re-schedules from this plan on every change,
 * which is what makes the budget a rate limiter rather than an intention: exactly one
 * daily reminder can exist, at exactly one allowed hour, or none.
 */
export function reminderPlan(settings: ReminderSettings): ReminderPlan {
  if (!settings.enabled) return { kind: 'none', reason: 'off' }
  if (!settings.granted) return { kind: 'none', reason: 'no-permission' }

  const hour =
    settings.hour === null
      ? suggestedHour(settings.sessionHours, settings.isChild)
      : clampHour(settings.hour, settings.isChild)

  // On the hour. The spec's budget is per day, so the minute is not a product decision
  // — and a reminder at 19:07 reads as an app that could not decide.
  return { kind: 'daily', hour, minute: 0 }
}

/**
 * The notification types that still need the push service, and why.
 *
 * Kept in code rather than only in the doc because this is the list somebody will
 * reach for when they wire the server, and a list that lives only in prose is a list
 * that goes stale. Exported so the reachability check has something to point at and
 * `notifications.test.ts` can assert none of them has quietly grown a local
 * implementation that cannot possibly be correct.
 */
export const NEEDS_PUSH: Readonly<Record<string, string>> = {
  'streak-at-risk':
    'whether the user has practised today is knowable only at fire time, and a local ' +
    "notification's content is fixed when it is scheduled — firing it and then finding " +
    'they already practised is the guilt-trip the spec forbids',
  'almost-mastered': 'depends on the scheduler’s view of every fact, which lives server-side',
  'review-due': 'the due count is the server’s, and the device’s copy can be days stale',
  comeback: 'triggered by absence, which a device that is not being opened cannot observe',
  event: 'an event starting is a server fact',
  league: 'a boundary is a fact about thirty other people',
} as const
