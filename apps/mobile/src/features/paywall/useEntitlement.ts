/**
 * What this user has paid for — read, never decided.
 *
 * The subscription row is written by the server from App Store Server Notifications
 * and Google Play Real-Time Developer Notifications. This hook caches it locally so
 * the UI can render offline, and runs `entitlementOf` — the SAME pure function the
 * edge function runs — over it.
 *
 * **The cache is a cache.** It is never the reason somebody gets Premium; it is the
 * reason the app can draw a screen before the network answers. Anything that actually
 * matters — a purchase, a renewal, a refund — is the server's call, exactly like XP
 * and coins (ADR 0006). A device-local entitlement is a free subscription for anyone
 * willing to change their clock.
 *
 * Spec: docs/systems/monetization.md
 */

import { useSyncExternalStore } from 'react'
import {
  NO_SUBSCRIPTION,
  canOfferTrial,
  entitlementOf,
  isPremium,
  shouldOfferWinback,
  trialDaysRemaining,
  type Entitlement,
  type Subscription,
} from '@worldquest/engines'
import { readJson, writeJson } from '../../lib/storage.js'

const KEY = 'subscription.v1'

/**
 * Parsed defensively.
 *
 * A corrupt or hand-edited row must fall back to FREE, never to premium. This is the
 * one place in the app where a lenient parse would hand out the product — so an
 * unreadable value is treated as "no subscription" rather than as "keep what you had".
 * `readJson` already drops unparseable JSON; the shape check here catches the other
 * half, a row that parses fine and says nothing useful.
 */
function read(): Subscription {
  const parsed = readJson<Partial<Subscription>>(KEY)
  if (parsed === null) return NO_SUBSCRIPTION
  if (typeof parsed.status !== 'string' || typeof parsed.tier !== 'string') {
    return NO_SUBSCRIPTION
  }
  return { ...NO_SUBSCRIPTION, ...parsed }
}

const listeners = new Set<() => void>()
let cached: Subscription | null = null

const snapshot = (): Subscription => (cached ??= read())

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Replace the cached row with what the server said.
 *
 * Called by the sync layer on reconcile, never by a purchase flow. The paywall closing
 * does not grant anything — the receipt goes to the server and this arrives afterwards
 * as a consequence.
 */
export function setSubscription(subscription: Subscription): void {
  cached = subscription
  writeJson(KEY, subscription)
  for (const listener of listeners) listener()
}

export type EntitlementView = Entitlement & {
  readonly subscription: Subscription
  /**
   * The common gate, in one name, so no caller has to remember that `on_hold` reports
   * `tier: 'free'` while still being a subscriber who needs a card fixed rather than a
   * paywall.
   */
  readonly isPremium: boolean
  /** Offer a trial rather than a straight purchase. One per user, ever. */
  readonly trialAvailable: boolean
  /** Days until a running trial charges, for the day-5 reminder. Null if not trialing. */
  readonly trialDaysLeft: number | null
  /**
   * They have turned off auto-renew but have not left yet. The only window where a
   * win-back has real odds — annual reactivation after they have gone is 5 %.
   */
  readonly winbackWorthShowing: boolean
}

/**
 * `now` is a parameter so a caller can ask "what will this be tomorrow?" and so the
 * hook stays testable against a renewal that has not happened. Defaults to the clock
 * because a component has to render at some particular moment.
 */
export function useEntitlement(now: number = Date.now()): EntitlementView {
  const subscription = useSyncExternalStore(subscribe, snapshot, snapshot)

  return {
    ...entitlementOf(subscription, now),
    subscription,
    isPremium: isPremium(subscription, now),
    trialAvailable: canOfferTrial(subscription),
    trialDaysLeft: trialDaysRemaining(subscription, now),
    winbackWorthShowing: shouldOfferWinback(subscription, now),
  }
}

/**
 * Sign-out and "delete my data" do NOT need their own reset here.
 *
 * `clearAll()` in lib/storage wipes the whole app store, and this row lives in it. A
 * second, subscription-specific clear would be one more thing to remember on a path
 * where forgetting means the next user on a shared family device inherits somebody
 * else's Premium.
 */
