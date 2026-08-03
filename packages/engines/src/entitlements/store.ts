/**
 * What a store notification does to a subscription.
 *
 * Apple and Google both push the truth about a subscription rather than expecting to be
 * polled, and this is the function that decides what each push means. It is pure, like
 * everything here, and for a sharper version of the usual reason: it runs inside the
 * webhook handler on the server and nowhere else, so the only way to know it is right is
 * to be able to run every branch of it without a store, a receipt, or a credential.
 *
 * ## What this is NOT
 *
 * It is not signature verification. The handler must have already established that the
 * notification came from Apple or Google before calling this — a `StoreNotification` is
 * a payload somebody has already proved authentic. Deciding entitlement from an
 * unverified payload is a free subscription for anyone who can POST.
 *
 * ## The five properties that matter more than the mapping
 *
 * The type-to-status table below is the boring part, and it is not where the money is
 * lost. These are:
 *
 * 1. **An unknown notification type changes nothing.** Both stores add types over time,
 *    and a `default:` that fell through to `active` would turn every future Apple
 *    release into a possible free-subscription bug. Unknown returns null.
 * 2. **A sandbox notification never touches production access.** Sandbox receipts reach
 *    production servers routinely — it is how people test — and treating one as real is
 *    the single cheapest way to give the product away.
 * 3. **Cancelling is not losing access.** `willRenew` goes false and `expiresAt` stands.
 *    Someone who cancels on day 2 of a month they paid for keeps the month; ending it at
 *    the moment they cancel is taking money for nothing, and it is what generates
 *    refund requests and one-star reviews.
 * 4. **`hasUsedTrial` only ever goes true.** It gates the trial offer, and a store that
 *    tells us about an old purchase must not hand somebody a second free week the till
 *    will then refuse.
 * 5. **Notifications arrive out of order.** Both stores retry until acknowledged, so a
 *    delayed DID_FAIL_TO_RENEW can land after the DID_RENEW that fixed it. Applying it
 *    would revoke a paying customer's access. The guard is a timestamp comparison, and
 *    it is the only reason this function needs to see the current row at all.
 *
 * Spec: docs/systems/monetization.md · docs/adr/0006-server-authoritative-progress.md
 */

import type { PlanTier, Subscription, SubscriptionStatus } from './index.js'

/**
 * A verified notification, normalised across the two stores.
 *
 * `kind` is the store's OWN type string, unmapped — `DID_FAIL_TO_RENEW`,
 * `SUBSCRIPTION_ON_HOLD`. Normalising it at the edge would move the decision into the
 * handler, where it could not be tested without a webhook, which is the whole thing this
 * split exists to avoid.
 */
export type StoreNotification = {
  readonly platform: 'ios' | 'android'
  readonly kind: string
  /** Apple's subtype. `DID_FAIL_TO_RENEW` means two different things with and without it. */
  readonly subtype?: string
  /** When the STORE sent it. The out-of-order guard, not a display value. */
  readonly notifiedAt: number
  readonly expiresAt: number | null
  readonly environment: 'sandbox' | 'production'
  /** True when the current period is an introductory free trial rather than a charge. */
  readonly isTrial?: boolean
  readonly tier?: PlanTier
}

/** What the server is: production rejects sandbox notifications, and vice versa. */
export type StoreEnvironment = 'sandbox' | 'production'

/**
 * Apple, by `notificationType` and `subtype`.
 *
 * Apple has no "on hold". `DID_FAIL_TO_RENEW` **with** `GRACE_PERIOD` is the grace
 * window, where access continues and the card is being retried — the state that recovers
 * a third of Android churn and a seventh of Apple's. The same type **without** a subtype
 * is billing retry with no grace configured, where access pauses.
 */
const APPLE: Record<string, SubscriptionStatus | undefined> = {
  SUBSCRIBED: 'active',
  DID_RENEW: 'active',
  OFFER_REDEEMED: 'active',
  GRACE_PERIOD_EXPIRED: 'on_hold',
  EXPIRED: 'expired',
  REFUND: 'expired',
  REVOKE: 'expired',
}

/**
 * Google Play, by `subscriptionNotificationType` name.
 *
 * The handler maps Google's integer to its documented name before calling this. Numbers
 * are not carried into the decision on purpose: `5` and `6` are on-hold and grace, one
 * pauses access and one does not, and a transposed digit in a switch on integers is
 * invisible in review.
 */
const GOOGLE: Record<string, SubscriptionStatus | undefined> = {
  SUBSCRIPTION_RECOVERED: 'active',
  SUBSCRIPTION_RENEWED: 'active',
  SUBSCRIPTION_PURCHASED: 'active',
  SUBSCRIPTION_RESTARTED: 'active',
  SUBSCRIPTION_IN_GRACE_PERIOD: 'in_grace',
  SUBSCRIPTION_ON_HOLD: 'on_hold',
  SUBSCRIPTION_EXPIRED: 'expired',
  SUBSCRIPTION_REVOKED: 'expired',
}

function statusFor(notification: StoreNotification): SubscriptionStatus | undefined {
  if (notification.platform === 'android') return GOOGLE[notification.kind]

  if (notification.kind === 'DID_FAIL_TO_RENEW') {
    return notification.subtype === 'GRACE_PERIOD' ? 'in_grace' : 'on_hold'
  }
  return APPLE[notification.kind]
}

/**
 * Did this notification turn auto-renew off, on, or neither?
 *
 * Apple sends one type for both directions and distinguishes them by subtype; Google
 * sends a cancellation and nothing for a re-enable (a restart arrives as
 * `SUBSCRIPTION_RESTARTED`, which is handled above as access). `undefined` means the
 * notification says nothing about renewal and the current value stands.
 */
function renewalFor(notification: StoreNotification): boolean | undefined {
  if (notification.kind === 'DID_CHANGE_RENEWAL_STATUS') {
    if (notification.subtype === 'AUTO_RENEW_ENABLED') return true
    if (notification.subtype === 'AUTO_RENEW_DISABLED') return false
    return undefined
  }
  if (notification.kind === 'SUBSCRIPTION_CANCELED') return false
  if (notification.kind === 'SUBSCRIPTION_RESTARTED') return true
  return undefined
}

/**
 * Apply a verified notification, or refuse to.
 *
 * Returns `null` for "this changes nothing", which the handler should treat as a
 * successful no-op and acknowledge — refusing to acknowledge makes the store retry
 * forever, and a notification we do not understand is not a notification we want
 * redelivered every hour until somebody notices.
 */
export function applyStoreNotification(
  current: Subscription,
  notification: StoreNotification,
  environment: StoreEnvironment,
): Subscription | null {
  // A sandbox receipt reaching a production server is normal, expected, and must never
  // grant anything. This check is deliberately first: nothing below it can run.
  if (notification.environment !== environment) return null

  // Out of order. Both stores retry until acknowledged, so a delayed failure can land
  // after the renewal that resolved it — and applying it would revoke a paying
  // customer. Equal timestamps are allowed through: a redelivery of the SAME
  // notification is idempotent here, and `notification_id` is what actually dedupes.
  if (current.notifiedAt !== undefined && current.notifiedAt !== null) {
    if (notification.notifiedAt < current.notifiedAt) return null
  }

  const status = statusFor(notification)
  const willRenew = renewalFor(notification)

  // Unknown type. Not an error and not a status change — both stores add types, and a
  // fall-through to `active` would make every future store release a possible giveaway.
  if (status === undefined && willRenew === undefined) return null

  const trialing = notification.isTrial === true && status === 'active'

  return {
    ...current,
    ...(status !== undefined ? { status: trialing ? 'trialing' : status } : {}),
    // On hold, the tier stays what was bought — `entitlementOf` is what reports `free`
    // for a held account, and flattening it here would lose what to restore on recovery.
    ...(status !== undefined && status !== 'expired'
      ? { tier: notification.tier ?? (current.tier === 'free' ? 'premium' : current.tier) }
      : {}),
    ...(status === 'expired' ? { tier: 'free' as PlanTier } : {}),
    // A cancellation leaves `expiresAt` alone on purpose: they keep the period they paid
    // for. Only a notification that actually carries a new date moves it.
    ...(notification.expiresAt !== null ? { expiresAt: notification.expiresAt } : {}),
    ...(willRenew !== undefined ? { willRenew } : {}),
    // Sticky. A trial consumed is consumed, whatever a later notification says.
    hasUsedTrial: current.hasUsedTrial || trialing || notification.isTrial === true,
    notifiedAt: notification.notifiedAt,
  }
}
