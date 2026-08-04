/**
 * Apple's App Store Server Notification v2 payload, read into the shape the decision needs.
 *
 * Pure, and separate from both the cryptography and the policy, because it fails in a
 * third way. A signature check is right or it throws. A policy check is a judgement about
 * who the sender is. This is a *reading* of somebody else's JSON, and the way it goes
 * wrong is quietly: a field that moved, a date in the wrong unit, a flag we did not
 * recognise. Those are exactly the bugs a unit test catches and a webhook does not.
 *
 * ## Every field is optional, on purpose
 *
 * This runs on data that arrived over the wire. A missing `bundleId` must be a rejection
 * with a reason, never a `TypeError` in a handler that then returns 500 and asks Apple to
 * send the same broken thing for three days.
 *
 * ## What is deliberately not read
 *
 * **`signedRenewalInfo`.** It describes the *next* period — what will be charged, at what
 * price, whether auto-renew is on for the renewal that has not happened yet. Whether the
 * user turned auto-renew off is something Apple states explicitly, as
 * `DID_CHANGE_RENEWAL_STATUS` with a subtype, and the engine derives `willRenew` from
 * that. Reading the same fact out of two places is how they come to disagree.
 *
 * **`productId` → tier.** There is one paid tier in v1.0 and the store listings do not
 * exist yet, so there are no real product identifiers to map. `applyStoreNotification`
 * already defaults an upgrade from `free` to `premium`; inventing product ids here to
 * feed a mapping nothing needs would be a made-up constant in the reward path.
 *
 * Spec: docs/systems/monetization.md
 */

/**
 * The subset of Apple's `responseBodyV2DecodedPayload` this handler reads.
 *
 * Not the whole thing — Apple sends considerably more, and a type that claimed to
 * describe all of it would be a claim we cannot keep across their releases.
 */
export type AppleDecodedPayload = {
  // Apple sends considerably more than this, and will send more still. An open shape is
  // the accurate one: it says "these are the fields we read", not "these are the fields
  // that exist", and it lets a test hand over a realistic payload without the type
  // pretending the extra keys are an error.
  readonly [key: string]: unknown
  readonly notificationType?: unknown
  readonly subtype?: unknown
  readonly notificationUUID?: unknown
  readonly signedDate?: unknown
  readonly data?: {
    readonly bundleId?: unknown
    readonly environment?: unknown
    readonly signedTransactionInfo?: unknown
    readonly signedRenewalInfo?: unknown
  }
}

/** The subset of Apple's `JWSTransactionDecodedPayload` this handler reads. */
export type AppleTransactionInfo = {
  /** Open, for the reason `AppleDecodedPayload` is. */
  readonly [key: string]: unknown
  readonly originalTransactionId?: unknown
  readonly expiresDate?: unknown
  readonly offerType?: unknown
  readonly offerDiscountType?: unknown
  /**
   * The UUID the app attached to the purchase — how a FIRST notification finds an account.
   *
   * Every later notification is found by `originalTransactionId`, because by then the
   * subscription row carries it. The very first one cannot be: nothing has ever linked
   * that store subscription to a user. Apple's answer is `appAccountToken`, set by the
   * client at purchase time, and ours is the user's own id.
   */
  readonly appAccountToken?: unknown
}

/**
 * The parsed result, structurally identical to `StoreNotification` from the engine.
 *
 * Declared here rather than imported because Deno cannot resolve a pnpm workspace, which
 * is the same reason `store-notifications.ts` is generic. The endpoint asserts the two
 * agree with an identity assignment, so a drift in either is a compile error rather than
 * a runtime surprise.
 */
export type ParsedNotification = {
  readonly platform: 'ios'
  readonly kind: string
  readonly subtype?: string
  readonly notifiedAt: number
  readonly expiresAt: number | null
  readonly environment: 'sandbox' | 'production'
  readonly isTrial?: boolean
}

export type ParsedAppleNotification = {
  /** Apple's `notificationUUID`. The idempotency key, and the unique index in Postgres. */
  readonly notificationId: string
  /** `originalTransactionId` — the id a subscription keeps across every renewal. */
  readonly storeRef: string
  /** `appAccountToken`, when present. The fallback that links a first purchase. */
  readonly accountToken: string | null
  readonly notification: ParsedNotification
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/**
 * Apple sends `Production` and `Sandbox`, capitalised. Anything else is not a value we
 * are willing to guess the meaning of — an unrecognised environment must not fall
 * through to production, which is the one that costs money.
 */
function environmentOf(v: unknown): 'sandbox' | 'production' | null {
  const s = str(v)?.toLowerCase()
  if (s === 'production') return 'production'
  if (s === 'sandbox') return 'sandbox'
  return null
}

/**
 * Was this period a free trial?
 *
 * Two signals, and either is enough. `offerDiscountType: 'FREE_TRIAL'` is the
 * unambiguous one. `offerType: 1` is an introductory offer, which is how a free trial is
 * delivered — a paid introductory offer is also type 1, so this errs towards marking the
 * trial consumed.
 *
 * That direction is deliberate. `hasUsedTrial` only ever goes true, and the two mistakes
 * are not symmetrical: a false positive costs someone an offer they might have had, and
 * a false negative offers a second free week that the store then refuses at the till —
 * which is the worst possible moment to discover it.
 */
const isTrialPeriod = (t: AppleTransactionInfo): boolean =>
  str(t.offerDiscountType) === 'FREE_TRIAL' || t.offerType === 1

/**
 * Read a verified outer payload and its verified transaction info.
 *
 * Both arguments must already have had their signatures and chains checked. Returns null
 * with nothing logged about *which* field was missing — the caller decides what to say,
 * and it says it to our logs rather than to the sender.
 */
export function parseAppleNotification(
  payload: AppleDecodedPayload,
  transaction: AppleTransactionInfo,
): ParsedAppleNotification | null {
  const kind = str(payload.notificationType)
  const notificationId = str(payload.notificationUUID)
  const storeRef = str(transaction.originalTransactionId)
  if (kind === null || notificationId === null || storeRef === null) return null

  // When the store sent it. This is the out-of-order guard the engine leans on, so a
  // notification that does not carry one cannot be safely ordered against the row.
  if (typeof payload.signedDate !== 'number' || !Number.isFinite(payload.signedDate)) return null

  const environment = environmentOf(payload.data?.environment)
  if (environment === null) return null

  // Apple omits `expiresDate` for a non-renewing transaction, and null means "this
  // notification says nothing about the paid-through date" — which the engine reads as
  // "leave the existing one alone". A cancellation must not shorten a period already paid for.
  const expiresAt =
    typeof transaction.expiresDate === 'number' && Number.isFinite(transaction.expiresDate)
      ? transaction.expiresDate
      : null

  const subtype = str(payload.subtype)

  return {
    notificationId,
    storeRef,
    accountToken: str(transaction.appAccountToken),
    notification: {
      platform: 'ios',
      kind,
      // Present only when Apple sent one. `DID_FAIL_TO_RENEW` means two different things
      // with and without `GRACE_PERIOD`, so an invented empty string here would resolve
      // the ambiguity in the direction that pauses a paying customer's access.
      ...(subtype === null ? {} : { subtype }),
      notifiedAt: payload.signedDate,
      expiresAt,
      environment,
      isTrial: isTrialPeriod(transaction),
    },
  }
}
