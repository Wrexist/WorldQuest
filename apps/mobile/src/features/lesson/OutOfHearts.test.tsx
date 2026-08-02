import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BALANCE } from '@worldquest/engines'
import { OutOfHearts } from './OutOfHearts.js'

const PRICE = BALANCE.prices.heartRefill

const renderOut = (coins: number, over: { onRevive?: () => void; onFinish?: () => void } = {}) => {
  const onRevive = over.onRevive ?? vi.fn()
  const onFinish = over.onFinish ?? vi.fn()
  const view = render(<OutOfHearts coins={coins} onRevive={onRevive} onFinish={onFinish} />)
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
    // Hearts regenerate on a timer elsewhere, but the next lesson does not wait for
    // it. A clock here would be both a lie and pressure aimed at a ten-year-old.
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

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = renderOut(0)
    expect(container.textContent).not.toMatch(/\blesson:[a-z]/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})
