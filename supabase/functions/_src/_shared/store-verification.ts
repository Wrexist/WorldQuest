/**
 * The checks that decide whether a store notification is ours to trust.
 *
 * Split from the cryptography on purpose, because they fail differently. Verifying an
 * ECDSA signature is a single platform call that is either right or throws. Deciding
 * *what a valid signature entitles the sender to* is policy, it is ours, and it is where
 * real implementations are wrong.
 *
 * ## The hole this exists to close
 *
 * The classic App Store Server Notification bug is not a broken signature check. It is a
 * correct one: the handler verifies that Apple signed the payload, concludes it is
 * authentic, and grants the subscription — without ever checking **which app the
 * notification is about**. Apple signs notifications for every app on the store. A
 * developer with any App Store account can have Apple sign a genuine notification for
 * their own bundle and post it at your endpoint, and a signature-only check accepts it.
 *
 * So `bundleId` is not a nicety. It is the difference between "Apple sent this" and
 * "Apple sent this *about us*", and only the second one means anything.
 *
 * ## What is here and what is not
 *
 * Here: pinning, expiry, chain order, audience, environment, replay window. Pure
 * functions over plain data, so every branch runs in a unit test with no key material.
 *
 * Not here: the signature itself. `issuedBy` is injected — in Node and in Deno it is
 * `child.verify(parent.publicKey)` from `node:crypto`, one line, using the platform's
 * audited implementation. Hand-rolling ASN.1 parsing or ECDSA verification would be the
 * single worst decision available in this file.
 *
 * Spec: docs/systems/monetization.md
 */

/**
 * One certificate from the JWS `x5c` header, as much of it as policy needs.
 *
 * Deliberately not the platform's certificate object: this module must be testable
 * without key material, and a policy that can only be exercised with real certificates
 * is a policy that gets exercised once, by hand, on the day it is written.
 */
export type ChainCert = {
  /** SHA-256 of the DER, uppercase hex with colons — `node:crypto`'s own format. */
  readonly fingerprint256: string
  readonly validFrom: number
  readonly validTo: number
  /**
   * Whether `parent` signed this certificate. THE cryptographic step, injected.
   *
   * The adapter is `(parent) => cert.verify(parent.publicKey)`. Nothing in this file
   * implements it, and nothing in this file should.
   */
  readonly issuedBy: (parent: ChainCert) => boolean
}

export type ChainPolicy = {
  /** The pinned root. Apple publishes AppleRootCA-G3; Google's is its own. */
  readonly rootFingerprint: string
  readonly now: number
}

/** A reason the notification was rejected, or null when it is good. */
export type Rejection = string | null

/**
 * Validate an `x5c` chain, leaf first, against a pinned root.
 *
 * Order matters and is checked rather than assumed: `x5c` is defined leaf-to-root, and a
 * handler that trusted the LAST element to be the root without verifying each link would
 * accept a chain whose root is genuine and whose leaf is anybody's.
 */
export function verifyChain(chain: readonly ChainCert[], policy: ChainPolicy): Rejection {
  // Apple sends leaf, intermediate, root. Fewer than two links means nothing was signed
  // by anything, and a one-element "chain" is a self-signed certificate asking to be
  // trusted on its own word.
  if (chain.length < 2) return 'chain too short'

  for (const [index, cert] of chain.entries()) {
    // An expired certificate is not a valid certificate, however good the signature is.
    // Checked for EVERY link: an expired intermediate invalidates everything under it.
    if (policy.now < cert.validFrom) return `certificate ${index} is not yet valid`
    if (policy.now > cert.validTo) return `certificate ${index} has expired`
  }

  // The pinned root, compared against the END of the chain rather than searched for
  // anywhere in it. A sender who appends the real Apple root to their own chain must not
  // be able to satisfy a check that merely asks "is the trusted root present?".
  const root = chain[chain.length - 1]!
  if (root.fingerprint256 !== policy.rootFingerprint) return 'chain does not terminate at the pinned root'

  // Every link, in order. This is the loop that makes the pin above mean something.
  for (let i = 0; i < chain.length - 1; i++) {
    if (!chain[i]!.issuedBy(chain[i + 1]!)) return `certificate ${i} was not issued by certificate ${i + 1}`
  }

  return null
}

/**
 * What a decoded, signature-valid payload must ALSO say before it is acted on.
 *
 * Every field optional, because this runs on data that arrived over the wire and a
 * missing field must be a rejection rather than a type error.
 */
export type NotificationClaims = {
  readonly bundleId?: string
  readonly environment?: string
  /** When the store signed it, epoch millis. */
  readonly signedDate?: number
}

export type ClaimPolicy = {
  /** Ours. A notification about a different app is not a notification for us. */
  readonly bundleId: string
  readonly environment: 'sandbox' | 'production'
  readonly now: number
  /**
   * How old a notification may be and still be acted on.
   *
   * A replay window, not a freshness nicety: a signature stays valid for ever, so a
   * captured `SUBSCRIBED` notification could be posted again next year to resurrect a
   * lapsed subscription. Generous enough to survive a store's own retry schedule —
   * Apple retries for up to three days — and finite, which is the point.
   */
  readonly maxAgeMs: number
}

export function verifyClaims(claims: NotificationClaims, policy: ClaimPolicy): Rejection {
  // THE check. Apple signs notifications for every app on the store, so a valid
  // signature proves Apple sent it and says nothing about who it is about.
  if (claims.bundleId === undefined) return 'no bundleId'
  if (claims.bundleId !== policy.bundleId) return 'bundleId is for a different app'

  // A sandbox notification carries a real Apple signature. Only this line stops it
  // granting production access.
  if (claims.environment === undefined) return 'no environment'
  if (claims.environment.toLowerCase() !== policy.environment) return 'wrong environment'

  if (claims.signedDate === undefined) return 'no signedDate'
  // Clock skew cuts both ways, and a notification from the future is a clock problem or
  // a forgery — either way not something to act on.
  if (claims.signedDate > policy.now + 60_000) return 'signedDate is in the future'
  if (policy.now - claims.signedDate > policy.maxAgeMs) return 'notification is too old to act on'

  return null
}
