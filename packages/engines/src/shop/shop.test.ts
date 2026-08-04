import { describe, expect, it } from 'vitest'
import { BALANCE } from '../xp/balance.js'
import {
  SELLABLE_KINDS,
  coinsShort,
  equippedTitleKey,
  priceFor,
  purchase,
  type ShopItem,
} from './index.js'

const title = (over: Partial<ShopItem> = {}): ShopItem => ({
  id: 'title.flag-fanatic',
  kind: 'title',
  nameKey: 'shop:title.flagFanatic',
  price: BALANCE.prices.titleUnlock,
  ...over,
})

const none = new Set<string>()

describe('the shop', () => {
  it('sells to somebody who can afford it', () => {
    const out = purchase(title(), { coins: 2000 }, none)
    expect(out).toEqual({ ok: true, spend: BALANCE.prices.titleUnlock, itemId: 'title.flag-fanatic' })
  })

  it('refuses when the coins are not there, without shaming', () => {
    // The REASON matters — the screen shows a gap as a fact, and there is no offer to
    // buy coins because this app does not sell them.
    const out = purchase(title(), { coins: 10 }, none)
    expect(out).toEqual({ ok: false, reason: 'cannot-afford' })
  })

  it('says "owned" before it says "too expensive"', () => {
    // A user who already owns something must not be told they cannot afford it. Both
    // are true when the wallet is empty; only one of them is useful.
    const out = purchase(title(), { coins: 0 }, new Set(['title.flag-fanatic']))
    expect(out).toEqual({ ok: false, reason: 'already-owned' })
  })

  it('never sells the same thing twice', () => {
    // Owning makes it un-buyable rather than buyable-and-refunded. The refund path is
    // where double-charges live.
    const rich = { coins: 999_999 }
    expect(purchase(title(), rich, new Set(['title.flag-fanatic'])).ok).toBe(false)
  })

  it('refuses a kind that has no artwork behind it', () => {
    // A pet is priced in the balance table and has no picture. Selling one would take
    // real coins for a blank square.
    expect(purchase(title({ kind: 'pet' }), { coins: 999_999 }, none)).toEqual({
      ok: false,
      reason: 'not-for-sale',
    })
    expect(SELLABLE_KINDS).toEqual(['title'])
  })

  it('sells nothing that could be an advantage', () => {
    // Rule 1 of xp-economy.md, asserted on the TYPE rather than trusted: if a
    // ShopItem ever grows a field that grants XP, hearts, difficulty or league
    // position, this test is where it should stop.
    expect(Object.keys(title()).sort()).toEqual(['id', 'kind', 'nameKey', 'price'])
  })

  it('prices from the balance table, never from a literal', () => {
    expect(priceFor('title')).toBe(BALANCE.prices.titleUnlock)
    expect(priceFor('theme')).toBe(BALANCE.prices.theme)
    // Ranged kinds take the floor; the catalogue sets the real figure per item.
    expect(priceFor('pet')).toBe(BALANCE.prices.pet.min)
  })

  it('states the gap as a number, and zero once it is closed', () => {
    expect(coinsShort(title(), { coins: 0 })).toBe(BALANCE.prices.titleUnlock)
    expect(coinsShort(title(), { coins: 999_999 })).toBe(0)
  })
})

describe('which title the profile shows', () => {
  const catalogue = [title()]

  it('falls back to the earned one when nothing is equipped', () => {
    // Someone who buys nothing still has a title, and it still goes up as they learn.
    expect(equippedTitleKey('titles:scout', null, catalogue, none)).toBe('titles:scout')
  })

  it('shows the bought one when it is equipped', () => {
    expect(
      equippedTitleKey('titles:scout', 'title.flag-fanatic', catalogue, new Set(['title.flag-fanatic'])),
    ).toBe('shop:title.flagFanatic')
  })

  it('falls back rather than rendering a raw key', () => {
    // A stale local row after a restore can name something no longer owned. Showing
    // "shop:title.flagFanatic" to a child is worse than showing their rank.
    expect(equippedTitleKey('titles:scout', 'title.flag-fanatic', catalogue, none)).toBe(
      'titles:scout',
    )
    expect(equippedTitleKey('titles:scout', 'title.gone', catalogue, new Set(['title.gone']))).toBe(
      'titles:scout',
    )
  })
})
