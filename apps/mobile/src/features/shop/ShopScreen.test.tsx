/**
 * The shop.
 *
 * Two of these are economy rules rather than preferences, and both are the kind of
 * thing that is cheap to assert and expensive to discover: nothing here may be an
 * advantage, and there is never a way to buy coins. The rest cover the states a
 * screen with a currency on it actually reaches.
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BALANCE, type ShopItem } from '@worldquest/engines'
import { ShopScreen } from './ShopScreen.js'

vi.mock('../../lib/analytics.js', () => ({ track: vi.fn() }))

const PRICE = BALANCE.prices.titleUnlock

const CATALOGUE: readonly ShopItem[] = [
  { id: 'title.flag-fanatic', kind: 'title', nameKey: 'shop:title.flagFanatic', price: PRICE },
  { id: 'title.map-nerd', kind: 'title', nameKey: 'shop:title.mapNerd', price: PRICE },
]

const shop = (over: Partial<React.ComponentProps<typeof ShopScreen>> = {}) => {
  const onBuy = vi.fn()
  const onEquip = vi.fn()
  const view = render(
    <ShopScreen
      catalogue={CATALOGUE}
      coins={5000}
      owned={new Set()}
      equippedId={null}
      levelTitleKey="titles:scout"
      loading={false}
      isOffline={false}
      onBuy={onBuy}
      onEquip={onEquip}
      {...over}
    />,
  )
  return { ...view, onBuy, onEquip }
}

describe('Shop — the rules the economy depends on', () => {
  it('says in its first sentence that nothing here is an advantage', () => {
    // Rule 1 of xp-economy.md, in words a ten-year-old reads before any price.
    shop()
    expect(screen.getByText(/none of it makes the learning easier/i)).toBeTruthy()
  })

  it('never offers a way to buy coins', () => {
    // Permanent no-list. This app does not sell coins, and a shop that offered them
    // would turn an earned currency into a paid one overnight.
    const { container } = shop({ coins: 0 })
    expect(container.textContent).not.toMatch(/buy coins|get more coins|top up|add coins/i)
  })

  it('states the gap as a fact, once, with no nag', () => {
    // `textContent`, not `getAllByText`: the line goes through `Tally`, so "200" is its
    // own node and a text matcher spanning the digits and the words stops matching.
    // How many nodes it takes to paint the sentence is the component's business — this
    // test is about the sentence being on screen, which is what this asks.
    const { container } = shop({ coins: PRICE - 200 })
    expect(container.textContent?.toLowerCase()).toContain('200 coins to go')
    expect(screen.getAllByRole('button', { name: 'Buy' })).toHaveLength(2)
  })

  it('cannot buy what it cannot afford', () => {
    const { onBuy } = shop({ coins: 0 })
    for (const button of screen.getAllByRole('button', { name: 'Buy' })) {
      fireEvent.click(button)
    }
    expect(onBuy).not.toHaveBeenCalled()
  })

  it('sells nothing without artwork behind it', () => {
    // A pet is priced in the balance table and has no picture. The section says so in
    // a sentence rather than listing greyed-out rows with prices on them — a disabled
    // price tag is a promise with a number attached.
    const { container } = shop()
    expect(screen.getByText(/More to come/i)).toBeTruthy()
    expect(container.textContent).toMatch(/being drawn/i)
    // Exactly two buyable rows, both titles. No phantom stock.
    expect(screen.getAllByRole('button', { name: 'Buy' })).toHaveLength(2)
  })
})

describe('Shop — titles', () => {
  it('offers the earned title first, and not as the lesser option', () => {
    shop()
    expect(screen.getByText('Scout')).toBeTruthy()
    expect(screen.getByText(/Earned by levelling up/i)).toBeTruthy()
  })

  it('buys, and hands the item to the caller', () => {
    const { onBuy } = shop()
    fireEvent.click(screen.getAllByRole('button', { name: 'Buy' })[0]!)
    expect(onBuy).toHaveBeenCalledWith(CATALOGUE[0])
  })

  it('shows owned rather than a second price', () => {
    const { container } = shop({ owned: new Set(['title.flag-fanatic']) })
    expect(screen.getByRole('button', { name: 'Wear it' })).toBeTruthy()
    // One Buy left, for the one still unowned.
    expect(screen.getAllByRole('button', { name: 'Buy' })).toHaveLength(1)
    expect(container.textContent).not.toMatch(/Buy again/i)
  })

  it('equips an owned title', () => {
    const { onEquip } = shop({ owned: new Set(['title.flag-fanatic']) })
    fireEvent.click(screen.getByRole('button', { name: 'Wear it' }))
    expect(onEquip).toHaveBeenCalledWith('title.flag-fanatic')
  })

  it('lets somebody go back to the title they earned', () => {
    // A bought title is a different hat, not a one-way door.
    const { onEquip } = shop({
      owned: new Set(['title.flag-fanatic']),
      equippedId: 'title.flag-fanatic',
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Wear it' })[0]!)
    expect(onEquip).toHaveBeenCalledWith(null)
  })

  it('marks what is being worn', () => {
    shop({ owned: new Set(['title.map-nerd']), equippedId: 'title.map-nerd' })
    expect(screen.getByText('Wearing')).toBeTruthy()
  })
})

describe('Shop — the five states', () => {
  it('shows a skeleton, not a spinner, while the wallet loads', () => {
    const { container } = shop({ loading: true })
    expect(screen.queryAllByRole('button', { name: 'Buy' })).toHaveLength(0)
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it('answers the real fear first when there is nothing to sell', () => {
    // "Where did my coins go" is the question an empty shop provokes.
    shop({ catalogue: [] })
    expect(screen.getByText(/Your coins are safe/i)).toBeTruthy()
  })

  it('treats offline as a pause, not a failure', () => {
    // A purchase is a server decision (ADR 0006), so it waits. Owned items are local
    // and keep working, and that is the sentence that matters.
    const { container, onBuy } = shop({ isOffline: true })
    expect(screen.getByText(/Everything you own still works/i)).toBeTruthy()
    expect(container.textContent).not.toMatch(/error|failed|problem/i)
    fireEvent.click(screen.getAllByRole('button', { name: 'Buy' })[0]!)
    expect(onBuy).not.toHaveBeenCalled()
  })

  it('offers a way back from a failed load', () => {
    const onRetry = vi.fn()
    shop({ error: true, onRetry })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
