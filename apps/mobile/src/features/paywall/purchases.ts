/**
 * The purchase port — one seam between this app and whichever billing SDK we use.
 *
 * ## Why a port rather than calling the SDK
 *
 * Three reasons, in order of how much they cost to discover late:
 *
 * 1. **Nothing above this file can be tested otherwise.** A paywall that imports a
 *    native billing SDK cannot be mounted in jsdom, cannot be screenshotted, and
 *    cannot be driven by `pnpm e2e`. That is the entire monetisation surface unverified
 *    until somebody has a phone and a sandbox account.
 * 2. **The vendor decision is not made yet** and should not be load-bearing. RevenueCat,
 *    StoreKit 2 direct and `react-native-iap` all fit behind this interface.
 * 3. **The client must never decide entitlement.** Keeping purchase *initiation* here
 *    and entitlement *state* on the server (ADR 0006) is easier to hold when the two
 *    live in different files with different shapes.
 *
 * ## What this does NOT do
 *
 * It does not grant anything. `purchase()` returns what the store said; the server
 * validates the receipt and writes the entitlement row, and the app reads that back.
 * A port that returned `{ premium: true }` would be a free subscription for anyone
 * with a proxy.
 *
 * Spec: docs/systems/monetization.md
 */

/** A plan the store has priced for this user, in their currency. */
export type Plan = {
  readonly id: 'annual' | 'monthly'
  /**
   * The store's own formatted string — "€39,99", "$49.99", "¥6,000".
   *
   * NEVER a number we format ourselves. Currency symbol position, decimal separator,
   * grouping and even the number of decimal places differ by locale, and the store
   * already knows all of it for the account actually being charged.
   */
  readonly price: string
  /** Same, divided across the term. For the yearly plan this is the persuasive figure. */
  readonly pricePerMonth: string
  /** Raw minor units, for computing the saving. Comparable only within one currency. */
  readonly amountMicros: number
  /** Whether this specific user is eligible for the introductory free trial. */
  readonly trialEligible: boolean
  readonly trialDays: number
}

export type PurchaseResult =
  | { readonly kind: 'purchased' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly reason: string }
  /** Already owned — restore rather than charge. Not an error, and never shown as one. */
  | { readonly kind: 'already-owned' }

export type PurchasePort = {
  /** Prices for this store front. Rejects rather than guessing if the store is unreachable. */
  readonly plans: () => Promise<readonly Plan[]>
  readonly purchase: (planId: Plan['id']) => Promise<PurchaseResult>
  /** Required by both stores, and by anyone who changed phone. */
  readonly restore: () => Promise<PurchaseResult>
  /** Deep-links to the store's own payment settings — the fix for a declined card. */
  readonly manageBilling: () => Promise<void>
}

/**
 * The stand-in used until the SDK lands.
 *
 * Deliberately NOT a fake that succeeds. It reports the store as unreachable, which is
 * the same path a real device takes with no network, so every caller has to handle the
 * failure branch from the first day rather than discovering it in review.
 *
 * The prices are the Product Bible's targets, formatted as the store would for one
 * locale, so the layout can be built and screenshotted against realistic strings —
 * a paywall laid out around "€39" breaks the moment somebody sees "1 234,56 kr".
 */
export const UNAVAILABLE: PurchasePort = {
  plans: async () => {
    throw new Error('purchases: no billing SDK is installed yet')
  },
  purchase: async () => ({ kind: 'failed', reason: 'no-sdk' }),
  restore: async () => ({ kind: 'failed', reason: 'no-sdk' }),
  manageBilling: async () => {},
}

/** Sample prices for the harness and tests. Never used at runtime. */
export const SAMPLE_PLANS: readonly Plan[] = [
  {
    id: 'annual',
    price: '€39,00',
    pricePerMonth: '€3,25',
    amountMicros: 39_000_000,
    trialEligible: true,
    trialDays: 7,
  },
  {
    id: 'monthly',
    price: '€5,99',
    pricePerMonth: '€5,99',
    amountMicros: 5_990_000,
    trialEligible: true,
    trialDays: 7,
  },
]

/**
 * The yearly saving, from the two real prices rather than from a marketing number.
 *
 * Computed so it cannot drift: if the store returns a regional price where the saving
 * is smaller, the badge shrinks with it. A hardcoded "Save 46%" beside a price pair
 * that does not support it is a false claim in every store front but one.
 *
 * Returns null when the two are not comparable, in which case the badge is not shown —
 * absent beats wrong.
 */
export function yearlySavingPercent(plans: readonly Plan[]): number | null {
  const annual = plans.find((p) => p.id === 'annual')
  const monthly = plans.find((p) => p.id === 'monthly')
  if (annual === undefined || monthly === undefined) return null
  const twelveMonths = monthly.amountMicros * 12
  if (twelveMonths <= 0 || annual.amountMicros >= twelveMonths) return null
  return Math.round((1 - annual.amountMicros / twelveMonths) * 100)
}
