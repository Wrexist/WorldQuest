/**
 * Entitlements — who has paid, and what happens when their card fails.
 *
 * Pure, like everything here, and for the usual reason: the identical module runs on
 * the client for optimistic UI and inside the edge function for the authoritative
 * answer. Two implementations could disagree about whether somebody is a subscriber,
 * and that disagreement is either a free subscription or an angry paying customer.
 *
 * **The client may render this. It may never decide it.** A device-local entitlement
 * is a free subscription for anyone willing to change their clock — the same rule as
 * XP and coins (ADR 0006), and for a stronger reason, because this one has a price.
 *
 * ## The grace period is the whole point of this file
 *
 * A third of Google Play cancellations are not decisions. They are expired cards and
 * declined charges: **31–32 % on Google Play, 14 % on the App Store**. Those users did
 * not choose to leave, and revoking access the instant a renewal fails converts a
 * billing hiccup into a churned subscriber.
 *
 * Handled properly — grace period, then account hold, driven by store notifications
 * rather than by app launches — 15–20 % of that revenue comes back with no new user
 * acquired. It is the highest-return thing in the monetisation surface and it is
 * invisible, which is why most apps skip it.
 *
 * So this state machine has five states rather than two, and `inGrace` is the one that
 * earns its keep.
 *
 * Spec: docs/systems/monetization.md
 */

/**
 * What the store has told us, normalised across Apple and Google.
 *
 * Written by the server from App Store Server Notifications v2 and Google Play
 * Real-Time Developer Notifications — never inferred from a client receipt.
 */
export type SubscriptionStatus =
  /** Never subscribed, or long lapsed. */
  | 'none'
  /** Inside a free trial. Paid access, no money taken yet. */
  | 'trialing'
  /** Paying and current. */
  | 'active'
  /**
   * A renewal charge failed and the store is retrying. Access CONTINUES.
   * This is the state that recovers a third of Android churn.
   */
  | 'in_grace'
  /**
   * Grace ran out and the store put the account on hold. Premium extras pause;
   * learning does not. Recoverable the moment the card is fixed.
   */
  | 'on_hold'
  /** Cancelled and past the paid-through date. */
  | 'expired'

/**
 * What the user gets.
 *
 * `PlanTier`, not `Tier` — the achievements engine already owns that name for
 * bronze/silver/gold, and two `Tier`s in one package index is an ambiguous re-export
 * that only surfaces when somebody imports the barrel.
 */
export type PlanTier = 'free' | 'premium' | 'family'

export type Subscription = {
  readonly status: SubscriptionStatus
  readonly tier: PlanTier
  /**
   * Paid through this instant, from the STORE, not from us.
   *
   * Access survives to here even after a cancellation: someone who cancels on day 2 of
   * a month they paid for keeps the month. Ending access at the moment of cancelling
   * is taking money for nothing, and it is what generates refund requests.
   *
   * **`null` means "the store has not told us", never "no end date".** Those two read
   * the same in a nullable column and they are opposites: one is a gap in what we know,
   * the other is a subscription that never ends. `entitlementOf` treats it as the first.
   */
  readonly expiresAt: number | null
  /**
   * True once the user has turned off auto-renew. They are still a subscriber until
   * `expiresAt` — this only says the next charge will not happen.
   */
  readonly willRenew: boolean
  /** Whether this subscription has ever consumed a free trial, for offer eligibility. */
  readonly hasUsedTrial: boolean
  /**
   * When the store sent the last notification we applied.
   *
   * Optional because the client never sees it — `fetchSubscription` does not select it,
   * and the identity assignment from the API row to this type is what proves the two
   * shapes agree. It exists for `applyStoreNotification`, which needs it to refuse a
   * notification that arrives out of order: both stores retry until acknowledged, so a
   * delayed failure can land after the renewal that resolved it, and applying that would
   * revoke a paying customer's access.
   */
  readonly notifiedAt?: number | null
}

export const NO_SUBSCRIPTION: Subscription = {
  status: 'none',
  tier: 'free',
  expiresAt: null,
  willRenew: false,
  hasUsedTrial: false,
}

/**
 * What this user can do right now.
 *
 * `tier` is what they get; `isPaying` is whether money is currently flowing, which is
 * a different question and the one analytics cares about.
 */
export type Entitlement = {
  readonly tier: PlanTier
  readonly isPaying: boolean
  /** In a trial that has not converted yet. */
  readonly isTrialing: boolean
  /**
   * Their payment needs attention — grace or hold. The app should say so, once,
   * kindly, with a button that fixes it. Not a churn email a week later.
   */
  readonly needsBillingFix: boolean
  /** Premium extras are paused pending a fixed card. Learning is NOT affected. */
  readonly isPaused: boolean
}

const FREE: Entitlement = {
  tier: 'free',
  isPaying: false,
  isTrialing: false,
  needsBillingFix: false,
  isPaused: false,
}

/**
 * Is there a paid-through date, and is it still ahead of us?
 *
 * Both halves, and the first one is the one that was missing. `expiresAt <= now` was
 * guarded by `expiresAt !== null`, so a row with no date skipped the expiry check
 * entirely and granted access for ever — reproducible in four lines: a first
 * `SUBSCRIBED` whose transaction carries no `expiresDate` yields
 * `{ status: 'active', expiresAt: null }`, and `entitlementOf` answered `isPaying: true`
 * a century later.
 *
 * Apple sends `expiresDate` on every auto-renewable transaction, which is why this
 * survived review: the state is unreachable *today*, through *Apple*. It stops being
 * unreachable the moment Google Play is wired up, because a Real-Time Developer
 * Notification does not carry a paid-through date at all — it carries a purchase token
 * you exchange for one at the Play Developer API. A handler written without that
 * exchange would mint permanent free subscriptions, and this is the line that would
 * have let it.
 *
 * So: unknown fails closed. The cost of the other direction is not symmetrical. Failing
 * closed shows a paying customer a paywall until the next notification carries a date;
 * failing open gives away the product for ever to anyone who can produce one dateless
 * notification, and nothing in the system ever revisits it.
 */
const paidThrough = (expiresAt: number | null, now: number): boolean =>
  expiresAt !== null && expiresAt > now

/**
 * The state machine. Same inputs, same answer, on a phone or on a server.
 *
 * `now` is a parameter rather than a call because a function that reads the clock
 * cannot be tested against a renewal that has not happened yet — and because this
 * package may not touch `Date.now()` at all.
 */
export function entitlementOf(subscription: Subscription, now: number): Entitlement {
  const { status, tier, expiresAt } = subscription

  switch (status) {
    case 'none':
    case 'expired':
      return FREE

    case 'trialing':
      // A trial that has run out is free, whatever the row still says. The store's
      // notification may not have arrived yet; the date is the source of truth.
      if (!paidThrough(expiresAt, now)) return FREE
      return { tier, isPaying: false, isTrialing: true, needsBillingFix: false, isPaused: false }

    case 'active':
      if (!paidThrough(expiresAt, now)) return FREE
      return { tier, isPaying: true, isTrialing: false, needsBillingFix: false, isPaused: false }

    case 'in_grace':
      // ACCESS CONTINUES. This is the branch that is worth money: the charge failed,
      // the store is retrying, and taking the product away now would turn a bank's
      // fraud heuristic into a cancelled subscription.
      return { tier, isPaying: true, isTrialing: false, needsBillingFix: true, isPaused: false }

    case 'on_hold':
      // Extras pause, and we say so plainly. Learning is untouched — nothing in this
      // app's free tier depends on `tier`, by design.
      return {
        tier: 'free',
        isPaying: false,
        isTrialing: false,
        needsBillingFix: true,
        isPaused: true,
      }
  }
}

/** Convenience for the common gate. Never used to decide anything server-side. */
export const isPremium = (subscription: Subscription, now: number): boolean =>
  entitlementOf(subscription, now).tier !== 'free'

/**
 * Whether to offer a free trial rather than a straight purchase.
 *
 * One trial per user, ever. Re-offering one to somebody who already burned theirs is
 * a promise the store will refuse to honour at the till, which is the worst possible
 * moment to discover it.
 */
export const canOfferTrial = (subscription: Subscription): boolean =>
  !subscription.hasUsedTrial && subscription.status === 'none'

/**
 * Whether a win-back offer is worth showing.
 *
 * At the moment of cancelling, not afterwards: annual reactivation once someone has
 * actually gone is **5 %**. The subscriber is still here while `willRenew` is false
 * and `expiresAt` is in the future, and that window is the only one with real odds.
 */
export const shouldOfferWinback = (subscription: Subscription, now: number): boolean =>
  !subscription.willRenew &&
  paidThrough(subscription.expiresAt, now) &&
  (subscription.status === 'active' || subscription.status === 'trialing')

/**
 * Days until the trial charges, for the day-5 reminder.
 *
 * Apple sends its own reminder; ours arrives first and is friendlier, which is the
 * cheapest refund-and-chargeback reduction available. Returns null when there is no
 * trial to remind about.
 */
export function trialDaysRemaining(subscription: Subscription, now: number): number | null {
  if (subscription.status !== 'trialing' || subscription.expiresAt === null) return null
  const ms = subscription.expiresAt - now
  if (ms <= 0) return 0
  return Math.ceil(ms / 86_400_000)
}
