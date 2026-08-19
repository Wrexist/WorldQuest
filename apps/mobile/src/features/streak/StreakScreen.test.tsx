import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FREEZE_PRICE, MAX_FREEZES, REPAIR_PRICE, STREAK_MILESTONES } from '@worldquest/engines'
import { StreakScreen, type StreakScreenProps } from './StreakScreen.js'

const NOW = Date.parse('2026-08-02T12:00:00Z')

const props = (over: Partial<StreakScreenProps> = {}): StreakScreenProps => ({
  current: 12,
  longest: 40,
  freezesHeld: 0,
  coins: 5000,
  repairOffer: { available: false, reason: 'not-broken' },
  restoreTo: 40,
  now: NOW,
  onBuyFreeze: vi.fn(),
  onRepair: vi.fn(),
  ...over,
})

describe('StreakScreen', () => {
  it('says nothing about a personal best when there is not one yet', () => {
    // At zero the screen already says "No days yet" as its heading and "Finish a lesson
    // today to start one" below it. "Longest: 0 days" between the two was the third
    // statement of the same nothing. Same rule as the welcome screen's STILL YOURS card.
    const { container } = render(<StreakScreen {...props({ current: 0, longest: 0 })} />)
    expect(container.textContent).not.toContain('Longest: 0 days')
    expect(container.textContent).toMatch(/no days yet/i)
  })

  it('does not colour a freeze count of zero as though it were progress', () => {
    // The same lie the lesson summary told with 35 % accuracy in success green: the
    // colour said good while the number said none. Asserted as "these differ" rather
    // than against a hex, so a theme change is not a regression.
    // One held, not the cap: at `MAX_FREEZES` the card swaps to "holding the maximum"
    // and the line under test is a different branch.
    const heldLine = (heldCount: number) => {
      const { container } = render(<StreakScreen {...props({ freezesHeld: heldCount })} />)
      const wanted = `${heldCount} of ${MAX_FREEZES} held`
      const el = Array.from(container.querySelectorAll('*')).find(
        (node) => node.textContent === wanted && node.children.length === 0,
      )
      expect(el, `no element rendering ${JSON.stringify(wanted)}`).toBeTruthy()
      // `className`, not `style`: react-native-web compiles a static StyleSheet entry
      // to a generated class and leaves the inline style attribute null, so comparing
      // `style` here compares null with null and passes no matter what the colours are.
      return el?.getAttribute('class')
    }
    expect(heldLine(0)).not.toBe(heldLine(1))
  })

  it('shows the streak and the record', () => {
    // `textContent` for the record: its digits are styled apart from its words.
    const { container } = render(<StreakScreen {...props()} />)
    expect(screen.getByText(/12 days/)).toBeTruthy()
    expect(container.textContent).toContain('Longest: 40 days')
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

  it('names no target past the last milestone the balance table funds', () => {
    // 7/30/100/365 and no more. A fifth target would promise a reward no ledger
    // honours, which the user finds out about on the day they reach it.
    //
    // This asserted "no text matching /milestone/i" and therefore also forbade the
    // LADDER, which arrived later and shows the same four days as a list. Four rungs all
    // ticked is a record of what somebody did, not a target dangled at them, so the
    // assertion now says what the rule always meant: no fifth rung, and nothing counting
    // down to one.
    render(<StreakScreen {...props({ current: 400, longest: 400 })} />)
    expect(screen.queryByText(/to your next milestone/)).toBeNull()
    for (const day of STREAK_MILESTONES) {
      expect(screen.getByText(new RegExp(`^${day} days$`))).toBeTruthy()
    }
    expect(screen.getAllByLabelText(/Reached/)).toHaveLength(STREAK_MILESTONES.length)
  })

  it('does not dangle a milestone at someone whose streak just broke', () => {
    // "3 days to your next milestone" beside "Your streak ended" reads as a taunt.
    render(
      <StreakScreen
        {...props({
          current: 0,
          repairOffer: { available: true, price: REPAIR_PRICE, expiresAt: NOW + 3_600_000 },
        })}
      />,
    )
    expect(screen.queryByText(/milestone/i)).toBeNull()
    // The ladder goes with it. A list of the four things you no longer have, each with
    // its price in days, is the same taunt at four times the length.
    expect(screen.queryByText(/Milestones/)).toBeNull()
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
          repairOffer: { available: true, price: REPAIR_PRICE, expiresAt: NOW + 10 * 3_600_000 },
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
          repairOffer: { available: true, price: REPAIR_PRICE, expiresAt: NOW + 10 * 3_600_000 },
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
          repairOffer: { available: true, price: REPAIR_PRICE, expiresAt: NOW + 10 * 3_600_000 },
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
        {...props({ repairOffer: { available: false, reason: 'cooldown', availableInDays: 12 } })}
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
          repairOffer: { available: true, price: REPAIR_PRICE, expiresAt: NOW + 3_600_000 },
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

describe('StreakScreen — the repair actually happens', () => {
  const broken = (over: Partial<StreakScreenProps> = {}): StreakScreenProps =>
    props({
      current: 1,
      longest: 214,
      restoreTo: 214,
      repairOffer: { available: true, price: REPAIR_PRICE, expiresAt: NOW + 10 * 3_600_000 },
      ...over,
    })

  it('offers a button that can be pressed', () => {
    // The whole reason this block exists. `app/streak.tsx` passed `onRepair={undefined}`,
    // and once `expire_streaks()` started recording a break the card became reachable with
    // a permanently disabled button naming a 600-coin price and no reason beside it. A
    // control that refuses every tap is worse than no control, and worst on the screen a
    // user reaches after losing a 214-day streak.
    const onRepair = vi.fn()
    render(<StreakScreen {...broken({ onRepair })} />)
    const button = screen.getByRole('button', { name: new RegExp(String(REPAIR_PRICE)) })
    expect(button.getAttribute('aria-disabled')).not.toBe('true')
    fireEvent.click(button)
    expect(onRepair).toHaveBeenCalledOnce()
  })

  it('refuses the second tap while one is in flight', () => {
    // `repair_streak` has no idempotency key, so two taps are two purchases — 1,200 coins
    // for one intended repair. The route guards it too; the button says so.
    render(<StreakScreen {...broken({ repairing: true })} />)
    const button = screen.getByRole('button', { name: new RegExp(String(REPAIR_PRICE)) })
    expect(button.getAttribute('aria-busy')).toBe('true')
  })

  it('says why a repair did not happen, out loud', () => {
    // Announced with `role="alert"`, because the text is inserted after the tap — without
    // it a screen-reader user is told nothing at all happened.
    render(<StreakScreen {...broken({ repairNotice: 'insufficient_funds' })} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/not quite enough coins/i)
  })

  it('does not restate a refusal the card already explains', () => {
    // `cooldown` and `window_expired` are decided before the tap and are the card's own
    // copy. A notice for them would say the same thing twice.
    const { container } = render(
      <StreakScreen {...props({ repairOffer: { available: false, reason: 'window-expired' } })} />,
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(container.textContent).toMatch(/window for this one has closed/i)
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
    render(<StreakScreen {...props({ offline: true, repairOffer: REPAIRABLE })} />)
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
    const { container } = render(<StreakScreen {...props({ offline: true })} />)
    expect(screen.getByText(/12 days/)).toBeTruthy()
    expect(container.textContent).toContain('Longest: 40 days')
  })

  it('says none of it when the connection is fine', () => {
    const { container } = render(<StreakScreen {...props()} />)
    expect(container.textContent).not.toMatch(/needs a connection/i)
  })

  it('and the same buttons are live when the connection is fine', () => {
    // Without this the two disabled assertions above prove nothing: a button that is
    // disabled for some other reason would satisfy them just as well.
    render(<StreakScreen {...props({ repairOffer: REPAIRABLE })} />)
    expect(
      screen.getByRole('button', { name: new RegExp(`${FREEZE_PRICE}`) }).getAttribute('aria-disabled'),
    ).not.toBe('true')
    expect(
      screen.getByRole('button', { name: /Restore/i }).getAttribute('aria-disabled'),
    ).not.toBe('true')
  })
})
