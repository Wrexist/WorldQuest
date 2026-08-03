/**
 * The order the checks run in, and what each failure does to the response.
 *
 * The two halves that decide *whether to trust* a notification and *what it means* are
 * built and tested (`store-verification.ts`, `entitlements/store.ts`). This is the third
 * piece: the sequence, and the status codes. It is the smallest of the three and the
 * easiest to get wrong in a way nobody notices, because every mistake here is invisible
 * until it has been happening for a month.
 *
 * ## Why the status codes matter more than they look
 *
 * A store retries any non-2xx. Apple keeps trying for three days; Google's Pub/Sub keeps
 * trying until it is acknowledged or the message expires. So the response is not a
 * report on how the request went — it is an instruction about whether to send it again:
 *
 * - **Authentic but unactionable → 200.** An unknown notification type, a user we cannot
 *   match, a duplicate: all of these will be exactly as unactionable on the fortieth
 *   delivery. Returning 500 because "we did not do anything" turns one puzzling
 *   notification into a permanent retry loop, and buries the real failures in it.
 * - **Not authentic → 401, and say nothing else.** A forged notification is the one case
 *   where the sender must not be told which check rejected it: "wrong bundleId" versus
 *   "chain does not terminate at the pinned root" is a free tutorial in what to fix.
 * - **Our fault → 500.** A database that is down is the one case where retrying is
 *   exactly what we want, because the next attempt might work.
 *
 * ## Generic over the subscription
 *
 * The orchestration does not care what a subscription looks like — only that `apply`
 * turns one into another or returns null. That keeps this file free of an import from
 * `packages/engines`, which Deno cannot resolve from a pnpm workspace, and means the
 * sequence can be tested without vendoring anything.
 *
 * Spec: docs/systems/monetization.md
 */

/** A payload whose signature and chain have been verified. */
export type VerifiedNotification<N> = {
  /** The store's own id, for idempotency. Apple's notificationUUID, Google's messageId. */
  readonly notificationId: string
  /** Identifies the subscription at the store: originalTransactionId or purchaseToken. */
  readonly storeRef: string
  readonly platform: 'ios' | 'android'
  /** Everything the decision needs, already normalised. */
  readonly notification: N
  /** The untouched payload, for the append-only log. */
  readonly payload: unknown
}

export type NotificationDeps<S, N> = {
  /**
   * Verify signature, chain and claims. Returns null for anything not authentic.
   *
   * One dependency rather than three because the handler must not be able to act on a
   * partially-verified notification: there is no shape here that represents "signature
   * checked but audience not", so there is no way to forget the second half.
   */
  readonly verify: (raw: string) => Promise<VerifiedNotification<N> | null>
  /** Has this exact notification already been recorded? The store WILL redeliver. */
  readonly seen: (notificationId: string) => Promise<boolean>
  /** Which user owns this store subscription, if any. */
  readonly findUser: (platform: 'ios' | 'android', storeRef: string) => Promise<string | null>
  readonly load: (userId: string) => Promise<S>
  /** Append the event and, when there is one, the new subscription. One transaction. */
  readonly record: (userId: string, event: VerifiedNotification<N>, next: S | null) => Promise<void>
  /** The pure decision. `applyStoreNotification` from the engine. */
  readonly apply: (current: S, notification: N) => S | null
}

export type HandlerResult = {
  readonly status: number
  /** What the store sees. Deliberately incurious. */
  readonly body: { readonly ok: boolean }
  /** For our logs, never for the response. */
  readonly reason: string
}

const ACK = (reason: string): HandlerResult => ({ status: 200, body: { ok: true }, reason })
const DENY = (reason: string): HandlerResult => ({ status: 401, body: { ok: false }, reason })
const RETRY = (reason: string): HandlerResult => ({ status: 500, body: { ok: false }, reason })

export async function handleStoreNotification<S, N>(
  raw: string,
  deps: NotificationDeps<S, N>,
): Promise<HandlerResult> {
  // Authenticity first, and nothing before it. Every line below this one runs on data a
  // stranger sent, so the only safe order is to establish provenance before touching the
  // database at all — including before the idempotency check, which would otherwise let
  // an unauthenticated caller probe which notification ids we have seen.
  let verified: VerifiedNotification<N> | null
  try {
    verified = await deps.verify(raw)
  } catch {
    // A malformed JWS throws rather than returning null. Same outcome, same silence.
    return DENY('verification threw')
  }
  if (verified === null) return DENY('failed verification')

  // Both stores redeliver until acknowledged, and a redelivered RENEWAL that is applied
  // twice is a second month granted. The unique index on `notification_id` is the real
  // guarantee; this is the cheap check that keeps the common case off it.
  try {
    if (await deps.seen(verified.notificationId)) return ACK('already recorded')
  } catch {
    return RETRY('could not check for a duplicate')
  }

  try {
    const userId = await deps.findUser(verified.platform, verified.storeRef)

    // An authentic notification about a subscription we cannot match to a user. Real,
    // and permanent: a purchase made before the account was linked, or a refund for a
    // deleted account. Acknowledged, because it will be exactly as unmatchable tomorrow,
    // and a retry loop here would bury the failures that ARE actionable.
    if (userId === null) return ACK('no user for this store reference')

    const current = await deps.load(userId)
    const next = deps.apply(current, verified.notification)

    // The event is recorded either way. `next === null` means the decision declined —
    // an unknown type, a sandbox payload, one that arrived out of order — and those are
    // exactly the notifications somebody will want to read back when a subscription
    // looks wrong. Dropping them keeps the row tidy and makes the dispute unanswerable.
    await deps.record(userId, verified, next)

    return ACK(next === null ? 'recorded, no change' : 'applied')
  } catch {
    // Ours. A retry is what we want, and the store is happy to oblige.
    return RETRY('storage failed')
  }
}
