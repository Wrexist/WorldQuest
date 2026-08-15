/**
 * Leagues — weekly competitive cohorts.
 *
 * Spec: `docs/systems/social-and-leagues.md` §4. This module is the whole of the rules
 * and none of the plumbing: tiers, the week boundary, who goes up, who comes down, and
 * what a cohort looks like from inside it. No network, no clock, no randomness —
 * `packages/engines` stays pure, so every one of these is a function of its arguments.
 *
 * ## The one thing that is UTC on purpose
 *
 * Everything else about a day in this app is the user's own local day: streaks, quests
 * and the soft cap all roll at local midnight, and `time/index.ts` explains at length why
 * counting 86,400,000 ms is the classic streak bug.
 *
 * A league week is the exception, and it has to be. Thirty people in six time zones are
 * being ranked against each other, so the week must end at the same INSTANT for all of
 * them — a local week would close Sunday evening in Auckland and Sunday evening in Los
 * Angeles twenty-one hours apart, and whoever rolled last would have a day of extra
 * earning against a frozen board. The spec says Monday 00:00 UTC → Sunday 23:59 UTC, and
 * that is a fairness rule rather than a convenience.
 *
 * The consequence is worth stating rather than discovering: for a user in UTC+13 the
 * league resets on Monday at 1pm. The screen says when the week ends in their own time,
 * which is the honest way to present a global boundary.
 *
 * ## What is NOT here
 *
 * Placement. The server decides who is in which cohort and what everybody scored (ADR
 * 0006) — a client that could compute its own rank could claim one. What the client does
 * with this module is read a standing it was handed and describe it.
 */

import { BALANCE } from '../xp/balance.js'

/**
 * The seven names, lowest first.
 *
 * Order is the API: promotion is "the next one up", so the array position IS the rank and
 * a reordering here is a gameplay change rather than a cosmetic one. Written out rather
 * than derived from an object's keys, for the reason `LEVEL_STOPS` gives in onboarding —
 * key order is insertion order, and a tier inserted in the middle would silently reorder
 * everyone's ladder.
 */
export const LEAGUE_TIERS = [
  'bronze',
  'silver',
  'gold',
  'sapphire',
  'ruby',
  'diamond',
  'legend',
] as const

export type LeagueTier = (typeof LEAGUE_TIERS)[number]

/** Each tier has three divisions, hardest last: Bronze III → Bronze II → Bronze I. */
export const DIVISIONS = [3, 2, 1] as const
export type Division = (typeof DIVISIONS)[number]

/**
 * Where a user sits on the ladder.
 *
 * Tier plus division rather than a single number, because that is what the screen shows
 * and what the user says out loud. `rankIndex` below is the flattened form, for the
 * arithmetic that has to know whether one rung is above another.
 */
export type LeagueRank = {
  readonly tier: LeagueTier
  readonly division: Division
}

export const BRONZE_III: LeagueRank = { tier: 'bronze', division: 3 }

/** Cohort size, and the two cut lines. Spec §4. */
export const COHORT_SIZE = 30
export const PROMOTED = 7
export const RELEGATED = 5

/**
 * A rank as a single ascending number, so two ranks can be compared.
 *
 * Bronze III is 0 and Legend I is 20. Nothing outside this module should care what the
 * number is — it exists so `promote` and `relegate` can be arithmetic instead of a table.
 */
export function rankIndex({ tier, division }: LeagueRank): number {
  return LEAGUE_TIERS.indexOf(tier) * DIVISIONS.length + (DIVISIONS.length - division)
}

/** The inverse of `rankIndex`, clamped to the ladder at both ends. */
export function rankFromIndex(index: number): LeagueRank {
  const top = LEAGUE_TIERS.length * DIVISIONS.length - 1
  const clamped = Math.max(0, Math.min(top, Math.trunc(index)))
  const tier = LEAGUE_TIERS[Math.floor(clamped / DIVISIONS.length)]!
  const division = (DIVISIONS.length - (clamped % DIVISIONS.length)) as Division
  return { tier, division }
}

/** One rung up, or the same rung at the top of the ladder. */
export const promote = (rank: LeagueRank): LeagueRank => rankFromIndex(rankIndex(rank) + 1)

/**
 * One rung down — and never out of Bronze.
 *
 * The floor is in the spec and it is a kindness rule, not a balance one: somebody having
 * a bad month should stop falling, because the alternative is a ladder that only ever
 * says you are getting worse.
 */
export const relegate = (rank: LeagueRank): LeagueRank => rankFromIndex(rankIndex(rank) - 1)

/**
 * What the end of the week does to one member, given where they finished.
 *
 * `position` is 1-based. Inactive members are not passed in at all — see `standings`.
 */
export type WeekOutcome = 'promoted' | 'held' | 'relegated'

export function outcomeFor(position: number, cohortSize: number, rank: LeagueRank): WeekOutcome {
  if (position <= PROMOTED) return 'promoted'
  // Measured from the bottom of THIS cohort rather than from 30. A cohort that lost
  // members to inactivity is smaller, and relegating "positions 26-30" out of a cohort
  // of 22 would relegate nobody at all.
  if (position > cohortSize - RELEGATED) {
    // Bronze III has nowhere to fall, so the outcome is `held` rather than a
    // `relegated` that does not move anybody. The screen says different words for
    // those two, and saying "you were relegated" to somebody who was not is worse
    // than saying nothing.
    return rankIndex(rank) === 0 ? 'held' : 'relegated'
  }
  return 'held'
}

/** The coins a podium finish pays, or 0. Read from the balance table, never typed. */
export function podiumCoins(position: number): number {
  const podium = BALANCE.coins.leaguePodium as Readonly<Record<number, number>>
  return podium[position] ?? 0
}

// ── the week ─────────────────────────────────────────────────────────────────

/** Milliseconds, named so the arithmetic below reads as time rather than as digits. */
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS

/**
 * The instant the league week containing `at` began: the most recent Monday, 00:00 UTC.
 *
 * `getUTCDay()` is 0 for Sunday, so Monday-based arithmetic needs the `+ 6) % 7` shift —
 * the classic off-by-one here makes Sunday its own week, which would give everyone a
 * one-day league once every seven days.
 */
export function weekStart(at: number): number {
  const date = new Date(at)
  const midnightUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const daysSinceMonday = (date.getUTCDay() + 6) % 7
  return midnightUtc - daysSinceMonday * DAY_MS
}

/** The instant the current league week ends — the next Monday, 00:00 UTC. */
export const weekEnd = (at: number): number => weekStart(at) + WEEK_MS

/**
 * A stable id for a league week, for keying a cohort and for comparing two weeks.
 *
 * The Monday's own date in `YYYY-MM-DD`, which sorts chronologically as a string and is
 * readable in a database row — the same reasoning `IsoDate` gives for using en-CA
 * formatting everywhere else in this repo.
 */
export function weekId(at: number): string {
  return new Date(weekStart(at)).toISOString().slice(0, 10)
}

// ── reading a cohort ─────────────────────────────────────────────────────────

/** One row of a cohort, as the server reports it. */
export type LeagueMember = {
  /** Stable, opaque, and not a user id — see `handles.ts`. */
  readonly handle: string
  readonly weeklyXp: number
  /** True for the reader's own row, so a screen can mark it without knowing who they are. */
  readonly isYou?: boolean
}

/** A member with their position worked out, and what the week would do to them. */
export type Standing = LeagueMember & {
  readonly position: number
  readonly outcome: WeekOutcome
}

/**
 * The cohort, ordered, with positions and outcomes attached.
 *
 * ## Inactive members are removed, not sorted to the bottom
 *
 * A kindness rule from the spec, and the one most easily lost in an implementation:
 * "inactive users (0 XP for the week) are removed from the cohort rather than shown at
 * the bottom — nobody's absence becomes someone else's leaderboard." Somebody who had a
 * hard week should not appear as the thing thirty people are beating.
 *
 * The reader is the exception. Your own row stays even at zero, because a leaderboard you
 * are in that does not contain you reads as a bug — and it is the one row where a zero is
 * information rather than an exposure.
 *
 * ## Ties
 *
 * Broken by handle, which is arbitrary and stable. Arbitrary is fine; UNSTABLE is not —
 * two users on the same XP must not swap places every time the screen re-renders.
 */
export function standings(members: readonly LeagueMember[], rank: LeagueRank): readonly Standing[] {
  const active = members.filter((m) => m.weeklyXp > 0 || m.isYou === true)
  const ordered = [...active].sort(
    (a, b) => b.weeklyXp - a.weeklyXp || a.handle.localeCompare(b.handle),
  )

  return ordered.map((member, i) => ({
    ...member,
    position: i + 1,
    outcome: outcomeFor(i + 1, ordered.length, rank),
  }))
}

/**
 * How far ahead of the reader the promotion line is, in XP. Never how far behind.
 *
 * The spec's kindness rule is explicit: "the league screen never shows how far behind the
 * bottom you are." So this answers one direction only. A user already inside the
 * promotion zone gets 0 — they are not behind anything.
 */
export function xpToPromotion(rows: readonly Standing[]): number {
  const you = rows.find((r) => r.isYou === true)
  if (you === undefined || you.position <= PROMOTED) return 0
  const line = rows[PROMOTED - 1]
  return line === undefined ? 0 : Math.max(0, line.weeklyXp - you.weeklyXp + 1)
}
