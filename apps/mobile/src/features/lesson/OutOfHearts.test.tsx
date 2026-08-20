import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BALANCE } from '@worldquest/engines'
import { OutOfHearts } from './OutOfHearts.js'

const PRICE = BALANCE.prices.continueLesson

type Overrides = {
  onRevive?: () => void
  onFinish?: () => void
  /** Defaults to true: the ordinary case is hearts running out mid-lesson. */
  canRevive?: boolean
  offline?: boolean
}

const renderOut = (coins: number, over: Overrides = {}) => {
  const onRevive = over.onRevive ?? vi.fn()
  const onFinish = over.onFinish ?? vi.fn()
  const view = render(
    <OutOfHearts
      coins={coins}
      canRevive={over.canRevive ?? true}
      offline={over.offline ?? false}
      onRevive={onRevive}
      onFinish={onFinish}
    />,
  )
  return { ...view, onRevive, onFinish }
}

describe('Out of hearts — the reassurance', () => {
  it('says the next lesson starts fresh', () => {
    // The single most important string on this screen. Hearts reset per lesson, so
    // this is never a lockout — but a child who has just been stopped does not know
    // that, and "I am locked out" is how an app gets closed for good.
    renderOut(PRICE)
    expect(screen.getByText(/next lesson starts with a full set/i)).toBeTruthy()
  })

  it('says it before offering to take any coins', () => {
    const { container } = renderOut(PRICE)
    const body = container.textContent ?? ''
    expect(body.indexOf('next lesson')).toBeLessThan(body.indexOf(String(PRICE)))
  })

  it('promises the answers already given are kept', () => {
    renderOut(0)
    expect(screen.getByText(/keep everything you got right/i)).toBeTruthy()
  })
})

describe('Out of hearts — what it must never do', () => {
  it('shows no countdown', () => {
    // There is no regeneration clock in this product at all — the balance table deleted
    // it — so a timer here would be a lie about a system that does not exist, as well as
    // pressure aimed at a ten-year-old.
    const { container } = renderOut(PRICE)
    expect(container.textContent).not.toMatch(/\d+:\d\d|minutes?|hours?|refill|wait/i)
  })

  it('offers no way to buy coins', () => {
    // The moment a user most wants coins is the moment the promise is most tempting
    // to break. Coins come from lessons, never from money.
    const { container } = renderOut(0)
    expect(container.textContent).not.toMatch(/buy coins|get coins|top up|store|shop|purchase|\$|€/i)
  })

  it('never frames it as failure', () => {
    const { container } = renderOut(PRICE)
    expect(container.textContent).not.toMatch(
      /game over|you failed|you lost|try harder|out of luck|no more lives/i,
    )
  })

  it('applies no urgency', () => {
    const { container } = renderOut(PRICE)
    expect(container.textContent).not.toMatch(/hurry|quick|last chance|expires|now only|don'?t lose/i)
  })
})

describe('Out of hearts — the fork', () => {
  it('offers to continue when the user can afford it', () => {
    const { onRevive } = renderOut(PRICE)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(String(PRICE)) }))
    expect(onRevive).toHaveBeenCalledOnce()
  })

  it('does not offer what cannot be paid for', () => {
    renderOut(PRICE - 1)
    expect(screen.queryByRole('button', { name: new RegExp(String(PRICE)) })).toBeNull()
  })

  it('names the gap once, and ends on the reassurance', () => {
    renderOut(PRICE - 40)
    expect(screen.getByText(/40 coins short/i)).toBeTruthy()
    expect(screen.getByText(/next lesson is free anyway/i)).toBeTruthy()
  })

  it('always offers a way out, affordable or not', () => {
    // Trapping a child behind a paywall mid-lesson is the failure mode here.
    for (const coins of [0, PRICE]) {
      const { onFinish, unmount } = renderOut(coins)
      fireEvent.click(screen.getByRole('button', { name: 'Finish here' }))
      expect(onFinish).toHaveBeenCalledOnce()
      unmount()
    }
  })

  /**
   * The last-question case. `REVIVE` resumes at the NEXT item, so on the final one there
   * is nothing to resume to — the machine sends it to the summary, and the offer must not
   * be made for something already over. Taking 250 coins for a question that does not
   * exist is worse than not offering.
   */
  it('makes no offer when there is nothing left to continue to', () => {
    renderOut(PRICE * 10, { canRevive: false })
    expect(screen.queryByRole('button', { name: new RegExp(String(PRICE)) })).toBeNull()
    // The reassurance and the way out both stay. Only the purchase goes.
    expect(screen.getByText(/next lesson starts with a full set/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Finish here' })).toBeTruthy()
  })

  it('withholds the offer offline, and says why', () => {
    // A spend that cannot reach the server is a continue nobody pays for, and the lesson
    // is over before any reconcile could correct it — so offline it is unlimited and free.
    renderOut(PRICE * 10, { offline: true })
    expect(screen.queryByRole('button', { name: new RegExp(String(PRICE)) })).toBeNull()
    expect(screen.getByText(/needs a connection/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Finish here' })).toBeTruthy()
  })

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = renderOut(0)
    expect(container.textContent).not.toMatch(/\blesson:[a-z]/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})
