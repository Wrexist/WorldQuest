import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SELLABLE_KINDS } from '../shop/index.js'
import { BALANCE } from '../xp/balance.js'
import {
  FREEZE_PRICE,
  MAX_FREEZES,
  REPAIR_COOLDOWN_DAYS,
  REPAIR_PRICE,
  REPAIR_WINDOW_HOURS,
  grantFreeze,
  markBroken,
  repair,
  repairAvailability,
  type RecoveryState,
} from './streak-recovery.js'

const TZ = 'Europe/Stockholm'
const HOUR = 3_600_000
const DAY = 24 * HOUR

/** The streak broke on the 1st; "now" is measured from midnight UTC that day. */
const BROKE_AT = Date.parse('2026-08-01T00:00:00Z')

const broken = (overrides: Partial<RecoveryState> = {}): RecoveryState => ({
  current: 1,
  longest: 214,
  lastActiveDate: '2026-07-30',
  freezesHeld: 0,
  brokenOn: '2026-08-01',
  lastRepairAt: null,
  ...overrides,
})

describe('prices come from the balance table', () => {
  it('does not keep a second copy of any number a user can feel', () => {
    // A duplicated price is a second number to forget to change, and the one that
    // gets forgotten is always the one the user sees.
    expect(FREEZE_PRICE).toBe(BALANCE.prices.streakFreeze)
    expect(REPAIR_PRICE).toBe(BALANCE.prices.streakRepair)
  })
})

describe('freezes', () => {
  it('grants up to the cap', () => {
    expect(grantFreeze({ freezesHeld: 0 })).toEqual({ freezesHeld: 1, granted: true })
    expect(grantFreeze({ freezesHeld: 1 })).toEqual({ freezesHeld: 2, granted: true })
  })

  it('refuses past the cap instead of silently swallowing a purchase', () => {
    // The caller is a shop. Taking the coins and discarding the freeze is the worst
    // outcome available, and throwing mid-transaction is the second worst.
    const result = grantFreeze({ freezesHeld: MAX_FREEZES })
    expect(result).toEqual({ freezesHeld: MAX_FREEZES, granted: false })
  })
})

describe('repair availability', () => {
  it('is unavailable when nothing is broken', () => {
    const intact = broken({ brokenOn: null, current: 42 })
    expect(repairAvailability(intact, BROKE_AT, TZ)).toEqual({
      available: false,
      reason: 'not-broken',
    })
  })

  it('is available inside the window', () => {
    const result = repairAvailability(broken(), BROKE_AT + 12 * HOUR, TZ)
    expect(result).toEqual({
      available: true,
      price: REPAIR_PRICE,
      expiresAt: BROKE_AT + REPAIR_WINDOW_HOURS * HOUR,
    })
  })

  it('closes once the window passes', () => {
    const justInside = repairAvailability(broken(), BROKE_AT + REPAIR_WINDOW_HOURS * HOUR, TZ)
    expect(justInside.available).toBe(true)

    const justOutside = repairAvailability(
      broken(),
      BROKE_AT + REPAIR_WINDOW_HOURS * HOUR + 1,
      TZ,
    )
    expect(justOutside).toEqual({ available: false, reason: 'window-expired' })
  })

  it('enforces the cooldown', () => {
    const recent = broken({ lastRepairAt: BROKE_AT - 10 * DAY })
    expect(repairAvailability(recent, BROKE_AT + HOUR, TZ)).toEqual({
      available: false,
      reason: 'cooldown',
      // The number, not just the refusal. "Not available" makes a user tap again
      // tomorrow and the day after; "available again in 20 days" ends the question,
      // and the UI must not have to redo this arithmetic to say it.
      availableInDays: REPAIR_COOLDOWN_DAYS - 10,
    })

    const longAgo = broken({ lastRepairAt: BROKE_AT - (REPAIR_COOLDOWN_DAYS + 1) * DAY })
    expect(repairAvailability(longAgo, BROKE_AT + HOUR, TZ).available).toBe(true)
  })

  it('refuses to sell back a streak that was never worth anything', () => {
    // Charging 600 coins to restore a one-day streak is taking money for a rounding
    // error, and it is the kind of thing a ten-year-old's parent notices.
    const trivial = broken({ current: 1, longest: 1 })
    expect(repairAvailability(trivial, BROKE_AT + HOUR, TZ)).toEqual({
      available: false,
      reason: 'nothing-to-restore',
    })
  })

  it('gives a specific reason for every refusal', () => {
    // "You can repair again in 12 days" and "the window closed yesterday" are
    // different messages. A generic "not available" invites the user to keep tapping.
    const reasons = new Set(
      [
        repairAvailability(broken({ brokenOn: null }), BROKE_AT, TZ),
        repairAvailability(broken(), BROKE_AT + 100 * HOUR, TZ),
        repairAvailability(broken({ lastRepairAt: BROKE_AT - DAY }), BROKE_AT + HOUR, TZ),
        repairAvailability(broken({ current: 1, longest: 1 }), BROKE_AT + HOUR, TZ),
      ].map((r) => (r.available ? 'available' : r.reason)),
    )
    expect(reasons).toEqual(
      new Set(['not-broken', 'window-expired', 'cooldown', 'nothing-to-restore']),
    )
  })
})

describe('repair', () => {
  it('restores the pre-break length, not the reset value', () => {
    // `applyActivity` has already set current to 1 by the time anyone can tap repair.
    // Reading it back would restore a 214-day streak as a 1-day streak and charge
    // 600 coins for the privilege.
    const result = repair(broken(), 214, 1000, BROKE_AT + HOUR, TZ)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.current).toBe(214)
    expect(result.state.longest).toBe(214)
    expect(result.coinsSpent).toBe(REPAIR_PRICE)
  })

  it('counts today as active', () => {
    // The user has just paid to be considered present. Making them ALSO complete a
    // lesson to keep the streak they just bought is a small betrayal that sticks.
    const result = repair(broken(), 214, 1000, BROKE_AT + 10 * HOUR, TZ)
    expect(result.ok && result.state.lastActiveDate).toBe('2026-08-01')
    expect(result.ok && result.state.brokenOn).toBeNull()
  })

  it('starts the cooldown', () => {
    const at = BROKE_AT + HOUR
    const result = repair(broken(), 214, 1000, at, TZ)
    expect(result.ok && result.state.lastRepairAt).toBe(at)
  })

  it('fails rather than throwing when the user cannot afford it', () => {
    // The caller has to be able to refund, so this is a Result. An exception here is
    // a crash in the middle of a transaction.
    const result = repair(broken(), 214, REPAIR_PRICE - 1, BROKE_AT + HOUR, TZ)
    expect(result).toEqual({ ok: false, reason: 'insufficient-coins' })
  })

  it('fails when the window closed while the user was deciding', () => {
    const result = repair(broken(), 214, 10_000, BROKE_AT + 100 * HOUR, TZ)
    expect(result).toEqual({ ok: false, reason: 'window-expired' })
  })

  it('does not mutate the state it is given', () => {
    const before = Object.freeze(broken())
    repair(before, 214, 1000, BROKE_AT + HOUR, TZ)
    expect(before.brokenOn).toBe('2026-08-01')
    expect(before.current).toBe(1)
  })
})

describe('markBroken', () => {
  it('carries the pre-break length out so it can be persisted', () => {
    const result = markBroken(broken({ brokenOn: null }), '2026-08-01', 214)
    expect(result.brokenOn).toBe('2026-08-01')
    expect(result.restorableLength).toBe(214)
  })
})

/**
 * The purchase path, and the constants it has to agree with.
 *
 * `grantFreeze` has been here since streaks were built, tested, with a doc comment
 * describing "the common caller is a purchase flow" — and no caller. `freezes_held` has
 * been 0 on every row this product ever created, so the freeze branch inside
 * `applyActivity` — the rule that quietly forgives one missed day — has never executed for
 * a real user. `purchase_freeze` is that caller.
 *
 * A Postgres function cannot import `MAX_FREEZES` or `FREEZE_PRICE`, so both exist twice.
 * This reads the migration and holds the copies together, the same way the mastery
 * trigger and the shop catalogue are held to theirs.
 */
describe('purchase_freeze agrees with the engine', () => {
  const migration = readFileSync(
    new URL('../../../../supabase/migrations/20260805180000_purchase_freeze.sql', import.meta.url),
    'utf8',
  )
  /** Comments explain why there is no `p_price`, so matching the raw file finds the prose. */
  const sql = migration.replace(/^\s*--.*$/gm, '')

  it('caps freezes at the same number the engine does', () => {
    const found = sql.match(/c_max\s+constant smallint := (\d+)/)
    expect(found, 'no cap declared in the migration').not.toBeNull()
    expect(Number(found![1])).toBe(MAX_FREEZES)
  })

  it('prices it at the same number the balance table does', () => {
    const found = migration.match(/'consumable\.streak-freeze',\s*'consumable',\s*(\d+)/)
    expect(found, 'the freeze is not in shop_items').not.toBeNull()
    expect(Number(found![1])).toBe(FREEZE_PRICE)
  })

  it('never takes a price or a user from the caller', () => {
    expect(sql).toMatch(/select price into v_price from public\.shop_items/)
    expect(sql).toMatch(/v_user\s+uuid := auth\.uid\(\)/)
    expect(sql).not.toMatch(/p_user_id/)
  })

  it('refuses at the cap BEFORE taking any coins', () => {
    // `grantFreeze`'s own comment: "taking the coins and silently discarding the freeze is
    // the worst possible outcome". The order of these two statements is that rule.
    const capIndex = sql.indexOf("'at_cap'")
    const spendIndex = sql.indexOf('insert into public.coin_ledger')
    expect(capIndex).toBeGreaterThan(-1)
    expect(spendIndex).toBeGreaterThan(-1)
    expect(capIndex).toBeLessThan(spendIndex)
  })

  it('sells a consumable kind, so the cosmetics grid cannot render it', () => {
    // `SELLABLE_KINDS` filters the client catalogue and does not contain `consumable`,
    // which is what stops a freeze being bought through the cosmetic endpoint that would
    // write an inventory row and refuse the second purchase.
    expect(SELLABLE_KINDS).not.toContain('consumable')
    expect(migration).toContain("'consumable.streak-freeze', 'consumable'")
  })
})
