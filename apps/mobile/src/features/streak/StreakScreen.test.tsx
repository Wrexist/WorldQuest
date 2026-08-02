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
