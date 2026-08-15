import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { standings, type LeagueRank } from '@worldquest/engines'
import { LeagueScreen } from './LeagueScreen.js'

const RANK: LeagueRank = { tier: 'gold', division: 2 }

/** A cohort where the reader sits 12th — outside the promotion zone, safely mid-table. */
const cohort = standings(
  [
    ...Array.from({ length: 11 }, (_, i) => ({
      handle: `Swift Glacier ${10 + i}`,
      weeklyXp: 900 - i * 50,
    })),
    { handle: 'Quiet Harbour 42', weeklyXp: 300, isYou: true },
    ...Array.from({ length: 8 }, (_, i) => ({
      handle: `Bright Canyon ${20 + i}`,
      weeklyXp: 200 - i * 10,
    })),
  ],
  RANK,
)

const props = {
  rows: cohort,
  rank: RANK,
  status: 'ready' as const,
  onBack: vi.fn(),
  onRetry: vi.fn(),
}

describe('League — the kindness rules', () => {
  it('says how far there is to climb, and has no way to say how far there is to fall', () => {
    // social-and-leagues.md §4: "The league screen never shows how far behind the bottom
    // you are." Enforced by there being no string, no prop and no branch that could.
    render(<LeagueScreen {...props} />)
    expect(screen.getAllByText(/XP to move up/).length).toBeGreaterThan(0)

    const shown = document.body.textContent ?? ''
    expect(shown).not.toMatch(/relegat/i)
    expect(shown).not.toMatch(/drop|demot|behind|last place/i)
  })

  it('states the promotion rule and stays silent about the other end', () => {
    render(<LeagueScreen {...props} />)
    expect(screen.getAllByText(/top 7 move up/i).length).toBeGreaterThan(0)
    expect(document.body.textContent ?? '').not.toMatch(/move down|bottom \d/i)
  })

  it('leaves out the people who had a hard week', () => {
    // "Inactive users (0 XP for the week) are removed from the cohort rather than shown
    // at the bottom — nobody's absence becomes someone else's leaderboard."
    const withIdle = standings(
      [
        { handle: 'Swift Glacier 10', weeklyXp: 500 },
        { handle: 'Quiet Harbour 42', weeklyXp: 0 },
      ],
      RANK,
    )
    render(<LeagueScreen {...props} rows={withIdle} />)
    expect(screen.queryByText('Quiet Harbour 42')).toBeNull()
  })

  it('keeps YOUR row even at zero', () => {
    // A leaderboard you are in that does not contain you reads as a bug, and it is the
    // one row where a zero is information rather than an exposure.
    const you = standings([{ handle: 'Quiet Harbour 42', weeklyXp: 0, isYou: true }], RANK)
    render(<LeagueScreen {...props} rows={you} />)
    expect(screen.getAllByText('You').length).toBeGreaterThan(0)
  })

  it('never counts down in seconds', () => {
    render(<LeagueScreen {...props} hoursLeft={9} />)
    expect(screen.getAllByText(/9 hours left/).length).toBeGreaterThan(0)
    expect(document.body.textContent ?? '').not.toMatch(/\d+:\d\d/)
  })
})

describe('League — privacy by shape', () => {
  it('shows an assigned handle and nothing else about a person', () => {
    render(<LeagueScreen {...props} />)
    // The handle is `Word Word NN`, generated from the user id — there is no name, no
    // avatar and no profile to reach, because the row carries none of them.
    // A row announces exactly three things and cannot announce a fourth. Asserting the
    // whole label rather than hunting for an `<img>`: the first version of this test
    // did that and failed on the promotion arrow, which is an icon and is not a person.
    // What matters is that the row carries no name, no avatar and no profile — and the
    // label is the complete inventory of what it carries.
    expect(screen.getByLabelText('1. Swift Glacier 10, 900 XP')).toBeTruthy()
  })

  it('gives no row anywhere to go', () => {
    // Every destination a leaderboard row could have is a person, and this product has
    // no screen where one user looks at another.
    const { container } = render(<LeagueScreen {...props} />)
    const rowButtons = Array.from(container.querySelectorAll('[role="button"]')).filter((el) =>
      /Swift Glacier|Bright Canyon|Quiet Harbour/.test(el.textContent ?? ''),
    )
    expect(rowButtons).toHaveLength(0)
  })

  it('marks your own row without naming you to anybody', () => {
    render(<LeagueScreen {...props} />)
    expect(screen.getAllByText('You').length).toBeGreaterThan(0)
    expect(screen.queryByText('Quiet Harbour 42')).toBeNull()
  })
})

describe('League — the five states', () => {
  it('shows rows rather than a spinner while loading', () => {
    const { container } = render(<LeagueScreen {...props} rows={null} rank={null} status="loading" />)
    expect(container.querySelectorAll('[aria-label="Loading"]').length).toBeGreaterThan(0)
  })

  it('treats "no league yet" as ordinary, not as a failure', () => {
    // The server places people weekly; until it has, nobody is in one. That is the
    // normal state for most of this app's life and it must not read as broken.
    render(<LeagueScreen {...props} rows={null} rank={null} />)
    expect(screen.getByText('No league yet')).toBeTruthy()
    expect(document.body.textContent ?? '').not.toMatch(/error|wrong|failed/i)
  })

  it('promises the XP is safe when the leaderboard will not load', () => {
    // The thing a user actually fears when a screen full of numbers fails.
    render(<LeagueScreen {...props} rows={null} rank={null} status="error" />)
    expect(screen.getAllByText(/Your XP is safe/).length).toBeGreaterThan(0)
  })

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = render(<LeagueScreen {...props} hoursLeft={3} />)
    const shown = container.textContent ?? ''
    expect(shown).not.toMatch(/league:/)
    expect(shown).not.toMatch(/\{\w+\}/)
  })
})

describe('League — offline', () => {
  it('still shows the standings it already has, and says which they are', () => {
    // A leaderboard from an hour ago is most of the answer — you are still twelfth, and
    // the people above you are still the same people. Hiding it would be the app
    // withholding what it already knows.
    render(<LeagueScreen {...props} offline />)
    expect(screen.getAllByText('Swift Glacier 10').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/may be behind/).length).toBeGreaterThan(0)
  })

  it('promises the XP still counts when there is nothing cached to show', () => {
    // The real worry when a leaderboard will not load offline is not the leaderboard.
    render(<LeagueScreen {...props} rows={null} rank={null} offline />)
    expect(screen.getAllByText(/XP is still counting/).length).toBeGreaterThan(0)
  })
})
