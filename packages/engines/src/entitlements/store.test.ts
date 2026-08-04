/**
 * What a store notification does to a subscription.
 *
 * The mapping table is the boring part. These tests are weighted towards the five ways
 * this function loses money or wrongly revokes access, because those are the failures a
 * webhook cannot be trusted to reveal: they happen once, to one customer, in production,
 * months apart.
 */

import { describe, expect, it } from 'vitest'
import { NO_SUBSCRIPTION, entitlementOf, type Subscription } from './index.js'
import { applyStoreNotification, type StoreNotification } from './store.js'

const T0 = Date.parse('2026-08-01T00:00:00Z')
const MONTH = 30 * 86_400_000

const active: Subscription = {
  status: 'active',
  tier: 'premium',
  expiresAt: T0 + MONTH,
  willRenew: true,
  hasUsedTrial: true,
  notifiedAt: T0,
}

const note = (over: Partial<StoreNotification> = {}): StoreNotification => ({
  platform: 'ios',
  kind: 'DID_RENEW',
  notifiedAt: T0 + 1000,
  expiresAt: T0 + 2 * MONTH,
  environment: 'production',
  ...over,
})

describe('the five properties that cost money', () => {
  it('ignores a notification type it does not recognise', () => {
    // Both stores add types. A `default:` falling through to "active" would make every
    // future Apple release a possible free subscription.
    expect(applyStoreNotification(active, note({ kind: 'SOMETHING_NEW_IN_2027' }), 'production')).toBeNull()
  })

  it('never lets a sandbox notification touch production access', () => {
    // Sandbox receipts reach production servers routinely — that is how people test.
    const free = { ...NO_SUBSCRIPTION }
    const applied = applyStoreNotification(free, note({ environment: 'sandbox' }), 'production')
    expect(applied).toBeNull()
  })

  it('and equally will not let a production notification into a sandbox server', () => {
    expect(applyStoreNotification(active, note(), 'sandbox')).toBeNull()
  })

  it('keeps access when someone cancels, to the day they paid through', () => {
    // Ending access at the moment of cancelling is taking money for nothing.
    const applied = applyStoreNotification(
      active,
      note({ kind: 'DID_CHANGE_RENEWAL_STATUS', subtype: 'AUTO_RENEW_DISABLED', expiresAt: null }),
      'production',
    )!
    expect(applied.willRenew).toBe(false)
    expect(applied.status).toBe('active')
    expect(applied.expiresAt).toBe(T0 + MONTH)
    // Still a subscriber today, and `entitlementOf` agrees.
    expect(entitlementOf(applied, T0 + 1000).tier).toBe('premium')
  })

  it('never un-uses a trial', () => {
    const applied = applyStoreNotification(active, note({ isTrial: false }), 'production')!
    expect(applied.hasUsedTrial).toBe(true)
  })

  it('refuses a notification that arrives out of order', () => {
    // The failure this exists for: a delayed DID_FAIL_TO_RENEW landing after the
    // DID_RENEW that resolved it would revoke a paying customer.
    const stale = note({ kind: 'DID_FAIL_TO_RENEW', notifiedAt: T0 - 1 })
    expect(applyStoreNotification(active, stale, 'production')).toBeNull()
  })

  it('accepts a redelivery of the same instant, because ids dedupe not clocks', () => {
    const same = note({ notifiedAt: T0 })
    expect(applyStoreNotification(active, same, 'production')).not.toBeNull()
  })
})

describe('Apple', () => {
  it('treats a grace period as continued access, not as a lapse', () => {
    // The branch that recovers a third of Android churn and a seventh of Apple's.
    const applied = applyStoreNotification(
      active,
      note({ kind: 'DID_FAIL_TO_RENEW', subtype: 'GRACE_PERIOD' }),
      'production',
    )!
    expect(applied.status).toBe('in_grace')
    const view = entitlementOf(applied, T0 + 1000)
    expect(view.isPaying).toBe(true)
    expect(view.needsBillingFix).toBe(true)
    expect(view.isPaused).toBe(false)
  })

  it('pauses when the same type arrives with no grace configured', () => {
    // Same notificationType, opposite meaning. This is why the subtype is carried.
    const applied = applyStoreNotification(active, note({ kind: 'DID_FAIL_TO_RENEW' }), 'production')!
    expect(applied.status).toBe('on_hold')
    expect(entitlementOf(applied, T0 + 1000).isPaused).toBe(true)
  })

  it('ends access on a refund, and drops the tier', () => {
    const applied = applyStoreNotification(active, note({ kind: 'REFUND' }), 'production')!
    expect(applied.status).toBe('expired')
    expect(applied.tier).toBe('free')
  })

  it('records a trial as trialing rather than paying', () => {
    const applied = applyStoreNotification(
      { ...NO_SUBSCRIPTION },
      note({ kind: 'SUBSCRIBED', subtype: 'INITIAL_BUY', isTrial: true }),
      'production',
    )!
    expect(applied.status).toBe('trialing')
    expect(applied.hasUsedTrial).toBe(true)
    expect(entitlementOf(applied, T0 + 1000).isPaying).toBe(false)
  })

  it('restores renewal when auto-renew is switched back on', () => {
    const off = applyStoreNotification(
      active,
      note({ kind: 'DID_CHANGE_RENEWAL_STATUS', subtype: 'AUTO_RENEW_DISABLED', expiresAt: null }),
      'production',
    )!
    const on = applyStoreNotification(
      off,
      note({
        kind: 'DID_CHANGE_RENEWAL_STATUS',
        subtype: 'AUTO_RENEW_ENABLED',
        expiresAt: null,
        notifiedAt: T0 + 2000,
      }),
      'production',
    )!
    expect(on.willRenew).toBe(true)
  })
})

describe('Google Play', () => {
  const android = (kind: string, over: Partial<StoreNotification> = {}) =>
    note({ platform: 'android', kind, ...over })

  it('separates on-hold from grace, which differ by one digit in the API', () => {
    // 5 and 6. One pauses access and one does not, and a transposed digit in a switch
    // on integers is invisible in review — which is why the handler maps to names first.
    const hold = applyStoreNotification(active, android('SUBSCRIPTION_ON_HOLD'), 'production')!
    const grace = applyStoreNotification(active, android('SUBSCRIPTION_IN_GRACE_PERIOD'), 'production')!
    expect(hold.status).toBe('on_hold')
    expect(grace.status).toBe('in_grace')
    expect(entitlementOf(hold, T0 + 1000).isPaused).toBe(true)
    expect(entitlementOf(grace, T0 + 1000).isPaused).toBe(false)
  })

  it('recovers a held subscription without losing what was bought', () => {
    const held = applyStoreNotification(active, android('SUBSCRIPTION_ON_HOLD'), 'production')!
    // The tier survives the hold, so recovery restores what they had rather than a guess.
    expect(held.tier).toBe('premium')
    const back = applyStoreNotification(
      held,
      android('SUBSCRIPTION_RECOVERED', { notifiedAt: T0 + 2000 }),
      'production',
    )!
    expect(back.status).toBe('active')
    expect(back.tier).toBe('premium')
  })

  it('treats a cancellation as renewal-off, not as an ending', () => {
    const applied = applyStoreNotification(
      active,
      android('SUBSCRIPTION_CANCELED', { expiresAt: null }),
      'production',
    )!
    expect(applied.willRenew).toBe(false)
    expect(applied.status).toBe('active')
  })

  it('ends access when the subscription is revoked', () => {
    const applied = applyStoreNotification(active, android('SUBSCRIPTION_REVOKED'), 'production')!
    expect(applied.status).toBe('expired')
    expect(applied.tier).toBe('free')
  })

  it('does not read an Apple type on an Android notification', () => {
    // The two tables are deliberately separate. A shared table would let a payload
    // claiming `platform: 'android'` reach Apple's mapping and vice versa.
    expect(applyStoreNotification(active, android('DID_RENEW'), 'production')).toBeNull()
  })
})

describe('the whole lifecycle, in order', () => {
  it('trial → active → grace → recovered → cancelled → expired', () => {
    let s: Subscription = { ...NO_SUBSCRIPTION }
    let t = T0

    const step = (n: Partial<StoreNotification>): Subscription => {
      t += 1000
      const applied = applyStoreNotification(s, note({ notifiedAt: t, ...n }), 'production')
      expect(applied, `${n.kind ?? 'DID_RENEW'} was refused`).not.toBeNull()
      s = applied!
      return s
    }

    expect(step({ kind: 'SUBSCRIBED', subtype: 'INITIAL_BUY', isTrial: true }).status).toBe('trialing')
    expect(step({ kind: 'DID_RENEW' }).status).toBe('active')
    expect(step({ kind: 'DID_FAIL_TO_RENEW', subtype: 'GRACE_PERIOD' }).status).toBe('in_grace')
    expect(step({ kind: 'DID_RENEW', subtype: 'BILLING_RECOVERY' }).status).toBe('active')

    const cancelled = step({
      kind: 'DID_CHANGE_RENEWAL_STATUS',
      subtype: 'AUTO_RENEW_DISABLED',
      expiresAt: null,
    })
    expect(cancelled.willRenew).toBe(false)
    expect(cancelled.status).toBe('active')

    const ended = step({ kind: 'EXPIRED', subtype: 'VOLUNTARY' })
    expect(ended.status).toBe('expired')
    expect(entitlementOf(ended, t).tier).toBe('free')
    // And the trial is still spent, a whole lifecycle later.
    expect(ended.hasUsedTrial).toBe(true)
  })
})
