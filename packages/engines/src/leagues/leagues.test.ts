import { describe, expect, it } from 'vitest'
import {
  BRONZE_III,
  COHORT_SIZE,
  LEAGUE_TIERS,
  PROMOTED,
  RELEGATED,
  outcomeFor,
  podiumCoins,
  promote,
  rankFromIndex,
  rankIndex,
  relegate,
  standings,
  weekEnd,
  weekId,
  weekStart,
  xpToPromotion,
  type LeagueMember,
} from './index.js'
import { HANDLE_SPACE, handleFor } from './handles.js'
import { BALANCE } from '../xp/balance.js'

const member = (handle: string, weeklyXp: number, isYou = false): LeagueMember =>
  isYou ? { handle, weeklyXp, isYou } : { handle, weeklyXp }

describe('the ladder', () => {
  it('is 21 rungs, lowest first, and round-trips through its index', () => {
    const top = LEAGUE_TIERS.length * 3 - 1
    expect(rankIndex(BRONZE_III)).toBe(0)
    expect(rankIndex({ tier: 'legend', division: 1 })).toBe(top)

    for (let i = 0; i <= top; i++) {
      expect(rankIndex(rankFromIndex(i))).toBe(i)
    }
  })

  it('climbs division-by-division before changing tier', () => {
    // Bronze III → Bronze II → Bronze I → Silver III. Getting this wrong makes the
    // ladder seven rungs instead of twenty-one, which nothing else would notice.
    expect(promote(BRONZE_III)).toEqual({ tier: 'bronze', division: 2 })
    expect(promote({ tier: 'bronze', division: 1 })).toEqual({ tier: 'silver', division: 3 })
  })

  it('never falls out of Bronze, and never climbs past Legend I', () => {
    // Both floors are kindness rules rather than balance ones — a ladder that only
    // ever says you are getting worse is one people leave.
    expect(relegate(BRONZE_III)).toEqual(BRONZE_III)
    const top = { tier: 'legend', division: 1 } as const
    expect(promote(top)).toEqual(top)
  })
})

describe('the week', () => {
  // A Wednesday, mid-morning UTC.
  const wednesday = Date.UTC(2026, 7, 12, 10, 30)

  it('runs Monday 00:00 UTC to the next Monday 00:00 UTC', () => {
    expect(new Date(weekStart(wednesday)).toISOString()).toBe('2026-08-10T00:00:00.000Z')
    expect(new Date(weekEnd(wednesday)).toISOString()).toBe('2026-08-17T00:00:00.000Z')
    expect(weekId(wednesday)).toBe('2026-08-10')
  })

  it('puts Sunday in the week that began the Monday before it', () => {
    // The off-by-one that matters: `getUTCDay()` is 0 on Sunday, so naive
    // Monday-arithmetic gives Sunday a one-day league of its own every seven days.
    const sunday = Date.UTC(2026, 7, 16, 23, 59)
    expect(weekId(sunday)).toBe('2026-08-10')
    // …and the following Monday starts the next one, at the instant it ticks over.
    expect(weekId(Date.UTC(2026, 7, 17, 0, 0))).toBe('2026-08-17')
  })

  it('is the same instant for every reader, whatever their zone', () => {
    // The whole reason this one boundary is UTC while every other day in the app is
    // local: thirty people in six zones are ranked against each other, so the week has
    // to close at one instant or whoever rolls last earns against a frozen board.
    const auckland = Date.UTC(2026, 7, 16, 11, 0) // Sunday 23:00 in UTC+12
    const losAngeles = Date.UTC(2026, 7, 16, 11, 0) // the same instant, Sunday 04:00
    expect(weekEnd(auckland)).toBe(weekEnd(losAngeles))
  })
})

describe('promotion and relegation', () => {
  it('promotes the top 7 and relegates the bottom 5 of a full cohort', () => {
    expect(outcomeFor(1, COHORT_SIZE, { tier: 'gold', division: 2 })).toBe('promoted')
    expect(outcomeFor(PROMOTED, COHORT_SIZE, { tier: 'gold', division: 2 })).toBe('promoted')
    expect(outcomeFor(PROMOTED + 1, COHORT_SIZE, { tier: 'gold', division: 2 })).toBe('held')
    expect(outcomeFor(COHORT_SIZE - RELEGATED, COHORT_SIZE, { tier: 'gold', division: 2 })).toBe(
      'held',
    )
    expect(outcomeFor(COHORT_SIZE, COHORT_SIZE, { tier: 'gold', division: 2 })).toBe('relegated')
  })

  it('measures the drop zone from the cohort it has, not from 30', () => {
    // Cohorts shrink when inactive members are removed. Against a hardcoded 30, a
    // cohort of 22 would relegate nobody — positions 26–30 do not exist in it.
    expect(outcomeFor(22, 22, { tier: 'silver', division: 1 })).toBe('relegated')
    expect(outcomeFor(17, 22, { tier: 'silver', division: 1 })).toBe('held')
  })

  it('tells somebody in Bronze III that they held, not that they fell', () => {
    // They cannot fall, so the screen must not say they did. Two different words for
    // two different things.
    expect(outcomeFor(COHORT_SIZE, COHORT_SIZE, BRONZE_III)).toBe('held')
  })

  it('pays the podium from the balance table', () => {
    expect(podiumCoins(1)).toBe(BALANCE.coins.leaguePodium[1])
    expect(podiumCoins(3)).toBe(BALANCE.coins.leaguePodium[3])
    expect(podiumCoins(4)).toBe(0)
  })
})

describe('standings', () => {
  it('orders by weekly XP and breaks ties stably', () => {
    const rows = standings(
      [member('Bold Fjord 01', 120), member('Amber Cove 02', 300), member('Zesty Reef 03', 120)],
      { tier: 'silver', division: 3 },
    )
    expect(rows.map((r) => r.handle)).toEqual(['Amber Cove 02', 'Bold Fjord 01', 'Zesty Reef 03'])
    // Re-sorting the same set must not shuffle the two on 120 — a board that reorders
    // itself between renders looks broken even when the numbers are right.
    const again = standings([...rows].reverse(), { tier: 'silver', division: 3 })
    expect(again.map((r) => r.handle)).toEqual(rows.map((r) => r.handle))
  })

  it('removes members who earned nothing, so an absence is not a leaderboard', () => {
    // The spec's kindness rule, and the one most easily lost in an implementation:
    // nobody's bad week becomes the thing twenty-nine people are beating.
    const rows = standings(
      [member('Bold Fjord 01', 120), member('Quiet Mesa 07', 0)],
      { tier: 'bronze', division: 1 },
    )
    expect(rows.map((r) => r.handle)).toEqual(['Bold Fjord 01'])
  })

  it('keeps YOUR row at zero, because a board you are in must contain you', () => {
    const rows = standings(
      [member('Bold Fjord 01', 120), member('Quiet Mesa 07', 0, true)],
      { tier: 'bronze', division: 1 },
    )
    expect(rows.map((r) => r.handle)).toEqual(['Bold Fjord 01', 'Quiet Mesa 07'])
  })

  it('says how far the promotion line is, and never how far the drop is', () => {
    const cohort = Array.from({ length: 12 }, (_, i) =>
      member(`Handle ${String(i).padStart(2, '0')}`, (12 - i) * 100),
    )
    const withYou = [...cohort.slice(0, 9), member('You Are Here 99', 150, true)]
    const rows = standings(withYou, { tier: 'gold', division: 3 })

    const you = rows.find((r) => r.isYou)!
    expect(you.position).toBeGreaterThan(PROMOTED)
    // One more XP than the person on the line — an actionable number, in the one
    // direction the spec allows this screen to point.
    expect(xpToPromotion(rows)).toBe(rows[PROMOTED - 1]!.weeklyXp - you.weeklyXp + 1)
  })

  it('asks nothing of somebody already in the promotion zone', () => {
    const rows = standings(
      [member('You Are Here 99', 900, true), member('Bold Fjord 01', 100)],
      { tier: 'gold', division: 3 },
    )
    expect(xpToPromotion(rows)).toBe(0)
  })
})

describe('handles', () => {
  it('is the same explorer on every device and after a reinstall', () => {
    expect(handleFor('user-abc')).toBe(handleFor('user-abc'))
    expect(handleFor('user-abc')).not.toBe(handleFor('user-abd'))
  })

  it('is three readable words, never free text', () => {
    // The whole safety argument in one assertion: nothing a user typed can reach this
    // string, so there is no user-generated content to moderate, report or block.
    expect(handleFor('user-abc')).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d{2}$/)
  })

  it('gives the server a way out of a collision', () => {
    expect(handleFor('user-abc', 1)).not.toBe(handleFor('user-abc'))
  })

  it('has a space large enough that a 30-person collision is a rounding error', () => {
    expect(HANDLE_SPACE).toBeGreaterThan(100_000)

    // And it actually spreads: 2,000 ids should not pile into a handful of names.
    const seen = new Set(Array.from({ length: 2000 }, (_, i) => handleFor(`user-${i}`)))
    expect(seen.size).toBeGreaterThan(1900)
  })
})
