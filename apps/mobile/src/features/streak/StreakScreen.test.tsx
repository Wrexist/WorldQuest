import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FREEZE_PRICE, MAX_FREEZES, REPAIR_PRICE } from '@worldquest/engines'
import { StreakScreen, type StreakScreenProps } from './StreakScreen.js'

const NOW = Date.parse('2026-08-02T12:00:00Z')

const props = (over: Partial<StreakScreenProps> = {}): StreakScreenProps => ({
  current: 12,
  longest: 40,
  freezesHeld: 0,
  coins: 5000,
  repair: { available: false, reason: 'not-broken' },
  restoreTo: 40,
  now: NOW,
  onBuyFreeze: vi.fn(),
  onRepair: vi.fn(),
  ...over,
})

describe('StreakScreen', () => {
  it('shows the streak and the record', () => {
    render(<StreakScreen {...props()} />)
    expect(screen.getByText(/12 days/)).toBeTruthy()
    expect(screen.getByText(/Longest: 40 days/)).toBeTruthy()
  })

  it('names the next milestone as something to reach, not something to lose', () => {
    // The gap this closed: `isMilestone` and the +50/+200/+500/+1000 payouts existed
    // in the engine and the balance table, and no screen ever mentioned them — so the
    // reward arrived unexplained and the goal earning it was invisible.
    render(<StreakScreen {...props({ current: 12 })} />)
    expect(screen.getByText(/18 days to your next milestone/)).toBeTruthy()
  })

  it('celebrates the day you arrive, without pointing at the next one', () => {
    // Today is for arriving. Naming day 30 on the day someone reaches day 7 turns "you
    // did it" into "keep going", which is the one day it must not be.
    render(<StreakScreen {...props({ current: 7 })} />)
    expect(screen.getByText(/7 days — that's a milestone/)).toBeTruthy()
    expect(screen.queryByText(/to your next milestone/)).toBeNull()
  })

  it('says nothing past the last milestone the balance table funds', () => {
    // 7/30/100/365 and no more. A fifth target would promise a reward no ledger
    // honours, which the user finds out about on the day they reach it.
    render(<StreakScreen {...props({ current: 400, longest: 400 })} />)
    expect(screen.queryByText(/milestone/i)).toBeNull()
  })

  it('does not dangle a milestone at someone whose streak just broke', () => {
    // "3 days to your next milestone" beside "Your streak ended" reads as a taunt.
    render(
      <StreakScreen
        {...props({
          current: 0,
          repair: { available: true, price: REPAIR_PRICE, expiresAt: NOW + 3_600_000 },
        })}
      />,
    )
    expect(screen.queryByText(/milestone/i)).toBeNull()
  })

  it('hides the repair card while the streak is intact', () => {
    render(<StreakScreen {...props()} />)
    expect(screen.queryByText(/Your streak ended/i)).toBeNull()
  })

  it('reports a break plainly, with no alarm and no blame', () => {
    // "You LOST your streak!" aimed at a ten-year-old is a small cruelty that also
    // does not work. See docs/design/voice-and-tone.md.
    const { container } = render(
      <StreakScreen
        {...props({
          repair: { available: true, price: REPAIR_PRICE, expiresAt: NOW + 10 * 3_600_000 },
        })}
      />,
    )
    expect(screen.getByText(/Your streak ended/i)).toBeTruthy()
    expect(container.textContent).not.toMatch(/lost|don't lose|hurry|last chance|expires soon/i)
    expect(container.textContent).toMatch(/It happens/i)
  })

  it('names exactly what a repair restores, so the price can be judged', () => {
    render(
      <StreakScreen
        {...props({
          restoreTo: 40,
          repair: { available: true, price: REPAIR_PRICE, expiresAt: NOW + 10 * 3_600_000 },
        })}
      />,
    )
    expect(screen.getByRole('button', { name: new RegExp(`Restore 40 days.*${REPAIR_PRICE}`) })).toBeTruthy()
  })

  it('states the window in whole hours and never counts down', () => {
    // A ticking clock on a purchase is pressure, and pressure aimed at a child is the
    // thing this product does not do.
    const { container } = render(
      <StreakScreen
        {...props({
          repair: { available: true, price: REPAIR_PRICE, expiresAt: NOW + 10 * 3_600_000 },
        })}
      />,
    )
    expect(screen.getByText(/10 more hours/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/\d+:\d\d|seconds? left/i)
  })

  it('says when repair returns instead of just refusing', () => {
    // "Not available" makes a user tap again tomorrow. A number ends the question.
    render(
      <StreakScreen
        {...props({ repair: { available: false, reason: 'cooldown', availableInDays: 12 } })}
      />,
    )
    expect(screen.getByText(/available again in 12 days/i)).toBeTruthy()
  })

  it('does not offer a freeze the user could not receive', () => {
    // Selling a third freeze at the cap takes coins for nothing.
    render(<StreakScreen {...props({ freezesHeld: MAX_FREEZES })} />)
    expect(screen.queryByRole('button', { name: /Buy a freeze/i })).toBeNull()
    expect(screen.getByText(/holding the maximum/i)).toBeTruthy()
  })

  it('states the shortfall once and offers no way to buy coins', () => {
    // Coins are earned. A "get more coins" link here would make that sentence a lie.
    const { container } = render(<StreakScreen {...props({ coins: FREEZE_PRICE - 100 })} />)
    expect(screen.getByText(/You need 100 more/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/buy coins|get coins|top up|store/i)
    expect(screen.getByRole('button', { name: /Buy a freeze/i }).getAttribute('aria-disabled')).toBe(
      'true',
    )
  })

  it('keeps the promise that coins are never bought with money', () => {
    const { container } = render(<StreakScreen {...props()} />)
    expect(container.textContent).toMatch(/never from money/i)
  })

  it('sells nothing that confers an advantage at learning', () => {
    // xp-economy.md: coins buy delight, never advantage. Nothing here may sell
    // content, lessons, difficulty skips, league position or XP.
    const { container } = render(
      <StreakScreen
        {...props({
          repair: { available: true, price: REPAIR_PRICE, expiresAt: NOW + 3_600_000 },
        })}
      />,
    )
    expect(container.textContent).not.toMatch(/skip|unlock (a )?(lesson|country|content)|extra xp|double xp/i)
  })

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = render(<StreakScreen {...props()} />)
    expect(container.textContent).not.toMatch(/\bstreak:[a-z]/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})

describe('StreakScreen — offline (H7, scoped)', () => {
  const REPAIRABLE = { available: true, price: REPAIR_PRICE, expiresAt: NOW + 3_600_000 } as const

  it('will not sell a freeze it cannot deliver', () => {
    // Freezes are a spend against a server-authoritative balance (ADR 0006). Letting
    // the button work offline either lies to the user or takes their coins twice when
    // the queue replays.
    render(<StreakScreen {...props({ offline: true })} />)
    const buy = screen.getByRole('button', { name: new RegExp(`${FREEZE_PRICE}`) })
    expect(buy.getAttribute('aria-disabled')).toBe('true')
  })

  it('will not sell a repair it cannot deliver', () => {
    render(<StreakScreen {...props({ offline: true, repair: REPAIRABLE })} />)
    const repair = screen.getByRole('button', { name: /Restore/i })
    expect(repair.getAttribute('aria-disabled')).toBe('true')
  })

  it('says the connection is why, and that everything else still works', () => {
    // A greyed-out button with no reason is a bug as far as the user is concerned.
    render(<StreakScreen {...props({ offline: true })} />)
    expect(screen.getAllByText(/needs a connection/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Everything else still works/i).length).toBeGreaterThan(0)
  })

  it('blames the connection before the coins', () => {
    // A user who is offline AND short would otherwise be told to go find coins that
    // would not have helped.
    const { container } = render(<StreakScreen {...props({ offline: true, coins: 0 })} />)
    expect(container.textContent).toMatch(/needs a connection/i)
    expect(container.textContent).not.toMatch(/short/i)
  })

  it('does not turn a lost connection into an alarm', () => {
    // Offline is a "not yet", not a failure, and this app works in a tunnel.
    const { container } = render(<StreakScreen {...props({ offline: true })} />)
    expect(container.textContent).not.toMatch(
      /error|failed|check your|no internet|cannot|unavailable|try again later/i,
    )
  })

  it('leaves everything that does not need a server alone', () => {
    render(<StreakScreen {...props({ offline: true })} />)
    expect(screen.getByText(/12 days/)).toBeTruthy()
    expect(screen.getByText(/Longest: 40 days/)).toBeTruthy()
  })

  it('says none of it when the connection is fine', () => {
    const { container } = render(<StreakScreen {...props()} />)
    expect(container.textContent).not.toMatch(/needs a connection/i)
  })

  it('and the same buttons are live when the connection is fine', () => {
    // Without this the two disabled assertions above prove nothing: a button that is
    // disabled for some other reason would satisfy them just as well.
    render(<StreakScreen {...props({ repair: REPAIRABLE })} />)
    expect(
      screen.getByRole('button', { name: new RegExp(`${FREEZE_PRICE}`) }).getAttribute('aria-disabled'),
    ).not.toBe('true')
    expect(
      screen.getByRole('button', { name: /Restore/i }).getAttribute('aria-disabled'),
    ).not.toBe('true')
  })
})
