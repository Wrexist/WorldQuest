import { readdirSync, readFileSync } from 'node:fs'
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

/**
 * The server's copy of the catalogue, and the only thing holding it to the real one.
 *
 * `purchase_item` cannot read a JSON pack and a Postgres function cannot import
 * `BALANCE`, so `shop_items` is a projection — the same relationship `_content/answers.ts`
 * has to the geography packs. A projection nobody checks is a copy that can disagree with
 * its source, and here the disagreement is a mispriced or unsellable item, which is a
 * refund request rather than a rendering bug.
 *
 * So this reads all three: the migration, the pack, and the balance table.
 */
describe('shop_items agrees with the pack and the balance table', () => {
  /**
   * EVERY migration that seeds the table, not one named file.
   *
   * It was a single path, which was true while one migration existed and became a hole
   * the moment a second batch of titles landed in its own file — `supabase/migrations/`
   * is forward-only, so stock is always added by a NEW file, and a check that reads only
   * the first one silently stops covering everything after it. That is the same
   * check-matches-its-own-documentation failure this file's own comment names, wearing
   * different clothes: the guard would have kept passing while the thing it guards drifted.
   */
  const migrationsDir = new URL('../../../../supabase/migrations/', import.meta.url)
  const migration = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(new URL(f, migrationsDir), 'utf8'))
    .filter((sql) => /insert into\s+(public\.)?shop_items/i.test(sql))
    .join('\n')
  const pack = JSON.parse(
    readFileSync(
      new URL('../../../content/packs/shop/titles.v1.json', import.meta.url),
      'utf8',
    ),
  ) as { items: { id: string; kind: string; price: number }[] }

  /**
   * The SQL with its prose removed.
   *
   * The assertions below look for the ABSENCE of things — `p_price`, `p_user_id` — and
   * the migration explains at length why neither is a parameter. Matching the raw file
   * flags the paragraph that most carefully justifies the rule, which is the
   * check-matches-its-own-documentation bug this repo has now shipped four times.
   */
  /**
   * The purchase FUNCTION's own file, for the absence checks below.
   *
   * Deliberately not the concatenation above. `p_price` must be absent from the function
   * that takes a purchase; scanning every migration in the repo for the string would
   * match any future function that legitimately has a price parameter and turn a precise
   * guard into a repo-wide grep.
   */
  const purchaseFn = readFileSync(
    new URL('20260805120000_purchase_item.sql', migrationsDir),
    'utf8',
  )
  const sql = purchaseFn.replace(/^\s*--.*$/gm, '')

  /**
   * `('title.map-nerd', 'title', 1000)` → the three fields, across every seed migration.
   *
   * Filtered to `SELLABLE_KINDS`, because `shop_items` also carries the streak freeze —
   * a `consumable`, seeded by its own migration and correctly absent from a pack of
   * titles. Without the filter this comparison asks the titles pack to account for a
   * consumable and fails for a reason that has nothing to do with what it is checking.
   */
  const seeded = [...migration.matchAll(/\('([\w.-]+)',\s*'(\w+)',\s*(\d+)\)/g)]
    .map((m) => ({ id: m[1]!, kind: m[2]!, price: Number(m[3]!) }))
    .filter((row) => SELLABLE_KINDS.includes(row.kind as (typeof SELLABLE_KINDS)[number]))

  const sellable = pack.items.filter((i) =>
    SELLABLE_KINDS.includes(i.kind as (typeof SELLABLE_KINDS)[number]),
  )

  it('seeds every sellable item in the pack, and nothing else', () => {
    expect(seeded.map((s) => s.id).sort()).toEqual(sellable.map((i) => i.id).sort())
  })

  it('prices every seeded item from the balance table', () => {
    // Not from the pack's own `price` field: the loader already rejects a row that
    // disagrees with `priceFor`, and the server must not learn a price from content that
    // a pack release could quietly change.
    for (const row of seeded) {
      expect(row.price, `${row.id} is seeded at ${row.price}`).toBe(
        priceFor(row.kind as (typeof SELLABLE_KINDS)[number]),
      )
    }
  })

  it('never takes a price from the caller', () => {
    // The single property that makes this endpoint safe to expose to `authenticated`.
    expect(sql).not.toMatch(/p_price/)
    expect(sql).toMatch(/select price into v_price from public\.shop_items/)
  })

  it('spends the caller’s own coins and nobody else’s', () => {
    // `auth.uid()` rather than a user-id parameter. A function that took one and was
    // granted to `authenticated` would let anyone empty any wallet.
    expect(sql).toMatch(/v_user\s+uuid := auth\.uid\(\)/)
    expect(sql).not.toMatch(/p_user_id/)
  })
})
