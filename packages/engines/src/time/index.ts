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
