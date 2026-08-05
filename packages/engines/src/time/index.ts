/**
 * Local-day arithmetic.
 *
 * Streaks, daily quests and the XP soft cap are all *daily* rules, and "a day" is
 * the user's own — a learner in Europe/Stockholm does not roll over at UTC midnight.
 * Twice a year their local day is 23 or 25 hours long, which is the classic streak
 * bug: someone loses a 200-day streak to a clock change and never comes back.
 *
 * So none of this counts 86,400,000ms. It asks Intl what the local wall clock says.
 * Pure — the clock is injected.
 */

import { BALANCE } from '../xp/balance.js'

export type IsoDate = string // YYYY-MM-DD

/** The user's local calendar date for an instant. */
export function localDate(at: number, timeZone: string): IsoDate {
  // en-CA formats as YYYY-MM-DD, which sorts and compares correctly.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at))
}

/** A zone's UTC offset in milliseconds at a given instant. */
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(instant))

  const get = (type: string): number => {
    const n = Number(parts.find((p) => p.type === type)?.value ?? '0')
    // Some runtimes emit "24" for midnight.
    return type === 'hour' && n === 24 ? 0 : n
  }

  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return asIfUtc - Math.floor(instant / 1000) * 1000
}

/**
 * Midnight that began the user's current local day, as an epoch ms.
 *
 * Subtracting the elapsed wall-clock time from the instant looks correct and is
 * wrong: on a spring-forward day the offset at 22:00 local is not the offset that
 * applied at midnight, so it overshoots by an hour and reports the previous day.
 * Instead we resolve the offset *at the candidate midnight*, then refine once —
 * one pass is always enough, because a transition moves the answer by at most the
 * transition size.
 */
export function startOfLocalDay(at: number, timeZone: string): number {
  const date = localDate(at, timeZone)
  const naiveMidnightUtc = Date.parse(`${date}T00:00:00Z`)

  let candidate = naiveMidnightUtc - offsetAt(at, timeZone)
  candidate = naiveMidnightUtc - offsetAt(candidate, timeZone)

  // Spring-forward can skip 00:00 entirely in a few zones (e.g. America/Santiago).
  // Step forward until we are genuinely inside the right local day.
  if (localDate(candidate, timeZone) !== date) {
    candidate = naiveMidnightUtc - offsetAt(candidate + 3_600_000, timeZone)
  }

  return candidate
}

/** Calendar days between two local dates. Never a millisecond division. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number]
  // UTC arithmetic on the calendar values themselves is immune to DST, because
  // the values are already wall-clock dates rather than instants.
  const a = Date.UTC(fy, fm - 1, fd)
  const b = Date.UTC(ty, tm - 1, td)
  return Math.round((b - a) / 86_400_000)
}

export type StreakState = {
  readonly current: number
  readonly longest: number
  readonly lastActiveDate: IsoDate | null
  readonly freezesHeld: number
}

export type StreakOutcome = StreakState & {
  /** Whether this activity extended the streak (drives the celebration). */
  readonly extended: boolean
  /** Whether a freeze was consumed to save it. */
  readonly freezeUsed: boolean
  /** Whether the streak reset. Stated plainly to the user, never mourned. */
  readonly reset: boolean
}

/**
 * Apply a day's activity to a streak.
 *
 * The kindness rules live here, not in the UI: a freeze is consumed automatically,
 * a reset is stated rather than punished, and the longest streak is remembered
 * forever so a lost run still leaves an achievement behind.
 */
export function applyActivity(
  state: StreakState,
  activeAt: number,
  timeZone: string,
): StreakOutcome {
  const today = localDate(activeAt, timeZone)

  if (state.lastActiveDate === null) {
    return {
      current: 1,
      longest: Math.max(1, state.longest),
      lastActiveDate: today,
      freezesHeld: state.freezesHeld,
      extended: true,
      freezeUsed: false,
      reset: false,
    }
  }

  const gap = daysBetween(state.lastActiveDate, today)

  // Same day — already counted. Doing five lessons does not make a five-day streak.
  if (gap <= 0) {
    return { ...state, extended: false, freezeUsed: false, reset: false }
  }

  // Consecutive day.
  if (gap === 1) {
    const current = state.current + 1
    return {
      current,
      longest: Math.max(current, state.longest),
      lastActiveDate: today,
      freezesHeld: state.freezesHeld,
      extended: true,
      freezeUsed: false,
      reset: false,
    }
  }

  // Exactly one day missed, and a freeze is held — spend it silently.
  if (gap === 2 && state.freezesHeld > 0) {
    const current = state.current + 1
    return {
      current,
      longest: Math.max(current, state.longest),
      lastActiveDate: today,
      freezesHeld: state.freezesHeld - 1,
      extended: true,
      freezeUsed: true,
      reset: false,
    }
  }

  // Reset. The longest streak survives — a lost run still leaves something behind.
  return {
    current: 1,
    longest: state.longest,
    lastActiveDate: today,
    freezesHeld: state.freezesHeld,
    extended: false,
    freezeUsed: false,
    reset: true,
  }
}

/** Milestones that award XP and coins. */
export const STREAK_MILESTONES = [7, 30, 100, 365] as const

export const isMilestone = (streak: number): boolean =>
  (STREAK_MILESTONES as readonly number[]).includes(streak)

/**
 * The next milestone this streak is working towards, or null past the last one.
 *
 * Null rather than a fifth invented milestone. Someone on day 400 has passed everything
 * the balance table pays for, and inventing "500" here would promise a reward that
 * `xp-economy.md` does not fund — a number in the UI that nothing in the ledger honours
 * is a lie the user finds out about on the day they reach it.
 *
 * Strictly greater than, so the day you ARRIVE at a milestone the screen celebrates it
 * rather than immediately pointing at the next one. That ordering is the whole
 * difference between "you did it" and "keep going", on the one day it should be the
 * first of those.
 */
export const nextMilestone = (streak: number): number | null =>
  STREAK_MILESTONES.find((m) => m > streak) ?? null

/** What reaching a streak length is worth, from the balance table. */
export type StreakReward = { readonly xp: number; readonly coins: number }

/**
 * The bonus for arriving at a milestone day.
 *
 * `BALANCE.xp.streakMilestones` and `BALANCE.coins.streakMilestones` have been in the
 * balance table since it was written and nothing has ever read them — money the economy
 * promises and never spends. `isMilestone` existed to answer the question and had no
 * caller that paid anything.
 *
 * Paid on the day the streak REACHES the number, which is why the caller must pass the
 * outcome of `applyActivity` rather than the stored streak: a second lesson on day 7
 * returns `extended: false`, and paying on every lesson of a milestone day would make the
 * bonus a function of how many lessons somebody did rather than of the run they kept.
 *
 * XP and coins are looked up separately because the tables genuinely differ — there is an
 * XP milestone at 365 and no coin one, on the grounds that a year-long streak is a status
 * reward rather than a shopping trip.
 */
export function streakMilestoneReward(streak: number): StreakReward {
  const xpTable = BALANCE.xp.streakMilestones as Readonly<Record<number, number>>
  const coinTable = BALANCE.coins.streakMilestones as Readonly<Record<number, number>>
  return { xp: xpTable[streak] ?? 0, coins: coinTable[streak] ?? 0 }
}

/**
 * The streak as it stands RIGHT NOW, which is not always the number in the database.
 *
 * `streaks.current` is written when a lesson lands, so between lessons it is a claim
 * about the past. Somebody who reached day 30 and then missed two days still has 30 in
 * that column, and Home was showing it — a screen telling a user they have a
 * thirty-day streak they no longer have, until the next lesson resets it under them.
 *
 * `markBroken` exists for the other half of this — recording the break so the repair
 * window can start — and had no caller either. It still needs a server-side job to fire
 * on a day with no activity. This does not replace it; it makes the DISPLAY honest in
 * the meantime, from data the client already has, with no job and no clock skew.
 *
 * Pure, and deliberately the same arithmetic `applyActivity` uses, so the number shown
 * before a lesson and the number written after it cannot disagree:
 *
 *   · same local day, or yesterday → still alive
 *   · the day before that, with a freeze in hand → still alive, the freeze will be spent
 *   · anything older → zero
 */
export function currentStreak(
  state: Pick<StreakState, 'current' | 'lastActiveDate' | 'freezesHeld'>,
  now: number,
  timeZone: string,
): number {
  if (state.lastActiveDate === null || state.lastActiveDate === '') return 0
  const gap = daysBetween(state.lastActiveDate, localDate(now, timeZone))
  if (gap <= 1) return state.current
  if (gap === 2 && state.freezesHeld > 0) return state.current
  return 0
}
