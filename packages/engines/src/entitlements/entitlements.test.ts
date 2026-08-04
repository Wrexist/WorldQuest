import { describe, expect, it } from 'vitest'
import {
  NO_SUBSCRIPTION,
  canOfferTrial,
  entitlementOf,
  isPremium,
  shouldOfferWinback,
  trialDaysRemaining,
  type Subscription,
} from './index.js'

const NOW = Date.parse('2026-08-03T12:00:00Z')
const DAY = 86_400_000

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  ...NO_SUBSCRIPTION,
  status: 'active',
  tier: 'premium',
  expiresAt: NOW + 30 * DAY,
  willRenew: true,
  ...over,
})

describe('entitlements', () => {
  it('gives nothing to somebody who never paid', () => {
    expect(entitlementOf(NO_SUBSCRIPTION, NOW).tier).toBe('free')
    expect(isPremium(NO_SUBSCRIPTION, NOW)).toBe(false)
  })

  it('keeps access through a FAILED CHARGE, which is the point of this file', () => {
    // A third of Google Play cancellations are involuntary — expired cards, declined
    // charges, a bank refusing a foreign transaction. Revoking access the moment a
    // renewal fails converts a billing hiccup into a churned subscriber, and handling
    // it properly recovers 15–20% of that revenue with no new user acquired.
    const grace = entitlementOf(sub({ status: 'in_grace' }), NOW)
    expect(grace.tier).toBe('premium')
    expect(grace.isPaying).toBe(true)
    expect(grace.needsBillingFix).toBe(true)
    expect(grace.isPaused).toBe(false)
  })

  it('pauses extras on hold but never calls it free-with-nothing-wrong', () => {
    // The distinction matters: a paused user gets a "fix your card" message, a free
    // user gets a paywall. Showing the wrong one loses a subscriber who wanted to stay.
    const held = entitlementOf(sub({ status: 'on_hold' }), NOW)
    expect(held.tier).toBe('free')
    expect(held.isPaused).toBe(true)
    expect(held.needsBillingFix).toBe(true)
  })

  it('honours the paid-through date after a cancellation', () => {
    // Somebody who cancels on day 2 of a month they paid for keeps the month. Ending
    // access at the moment of cancelling is taking money for nothing.
    const cancelled = sub({ willRenew: false, expiresAt: NOW + 20 * DAY })
    expect(entitlementOf(cancelled, NOW).tier).toBe('premium')
    expect(entitlementOf(cancelled, NOW + 21 * DAY).tier).toBe('free')
  })

  it('expires a trial by its date even if the store has not told us yet', () => {
    // The notification may be late. The date is the truth, and trusting a stale row
    // would hand out unlimited free trials to anyone who stayed offline.
    const trial = sub({ status: 'trialing', expiresAt: NOW - 1 })
    expect(entitlementOf(trial, NOW).tier).toBe('free')
  })

  it('refuses to grant access it cannot see the end of', () => {
    // The defect this replaced: `expiresAt <= now` sat behind `expiresAt !== null`, so a
    // row with NO paid-through date skipped the expiry check rather than failing it, and
    // `entitlementOf` reported `isPaying: true` for ever. A nullable column reads the
    // same for "the store has not told us" and "this never ends"; they are opposites.
    for (const status of ['active', 'trialing'] as const) {
      const dateless = sub({ status, expiresAt: null })
      expect(entitlementOf(dateless, NOW).tier, status).toBe('free')
      // The part that made it a giveaway rather than a glitch: nothing ever revisits it.
      expect(entitlementOf(dateless, NOW + 36_500 * DAY).isPaying, status).toBe(false)
    }

    // And the branches that legitimately have no date still work. Grace and hold are
    // reached BY the paid-through date passing, so consulting it there would revoke
    // access from exactly the users this file exists to keep.
    expect(entitlementOf(sub({ status: 'in_grace', expiresAt: null }), NOW).isPaying).toBe(true)
    expect(entitlementOf(sub({ status: 'on_hold', expiresAt: null }), NOW).isPaused).toBe(true)
  })

  it('does not chase a win-back for a subscription with no end date', () => {
    // Same nullable, same trap: "expires soon" and "we do not know when it expires" are
    // not the same prompt to interrupt somebody with.
    expect(shouldOfferWinback(sub({ willRenew: false, expiresAt: null }), NOW)).toBe(false)
  })

  it('counts a trial as access but not as revenue', () => {
    const trial = entitlementOf(sub({ status: 'trialing', expiresAt: NOW + 5 * DAY }), NOW)
    expect(trial.tier).toBe('premium')
    expect(trial.isTrialing).toBe(true)
    // Analytics and forecasting both care: nobody has paid anything yet.
    expect(trial.isPaying).toBe(false)
  })

  it('offers a trial once, ever', () => {
    // Re-offering one to somebody who burned theirs is a promise the store refuses at
    // the till — the worst possible moment to find out.
    expect(canOfferTrial(NO_SUBSCRIPTION)).toBe(true)
    expect(canOfferTrial({ ...NO_SUBSCRIPTION, hasUsedTrial: true })).toBe(false)
    expect(canOfferTrial(sub({ status: 'expired' }))).toBe(false)
  })

  it('catches a leaver while they are still here', () => {
    // Annual reactivation AFTER someone has actually gone is 5%. The only window with
    // real odds is between "turned off auto-renew" and "access ended".
    expect(shouldOfferWinback(sub({ willRenew: false }), NOW)).toBe(true)
    // Already gone — too late to be worth interrupting them.
    expect(shouldOfferWinback(sub({ willRenew: false, status: 'expired' }), NOW)).toBe(false)
    // Still renewing — nothing to win back.
    expect(shouldOfferWinback(sub(), NOW)).toBe(false)
  })

  it('counts down to the charge so the reminder can beat the surprise', () => {
    expect(trialDaysRemaining(sub({ status: 'trialing', expiresAt: NOW + 2 * DAY }), NOW)).toBe(2)
    expect(trialDaysRemaining(sub({ status: 'trialing', expiresAt: NOW - DAY }), NOW)).toBe(0)
    expect(trialDaysRemaining(sub(), NOW)).toBeNull()
  })

  it('is pure — same inputs, same answer, on a phone or a server', () => {
    // The whole reason this lives in engines. Two implementations could disagree about
    // whether somebody is a subscriber, and that is either a free subscription or an
    // angry paying customer.
    const s = sub({ status: 'in_grace' })
    expect(entitlementOf(s, NOW)).toEqual(entitlementOf(s, NOW))
  })
})

describe('what learning costs', () => {
  it('never gates a lesson behind a tier', () => {
    // Rule 1 of docs/systems/monetization.md, asserted rather than trusted: nothing an
    // entitlement returns may be required to answer a question. If this file ever
    // grows a `canLearn` or a `lessonsRemaining`, the paywall has moved to the wrong
    // place and the North Star metric goes with it.
    const held = entitlementOf(sub({ status: 'on_hold' }), NOW)
    const free = entitlementOf(NO_SUBSCRIPTION, NOW)
    for (const e of [held, free]) {
      expect(Object.keys(e).sort()).toEqual([
        'isPaused',
        'isPaying',
        'isTrialing',
        'needsBillingFix',
        'tier',
      ])
    }
  })
})
