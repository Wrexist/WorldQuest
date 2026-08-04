/**
 * The four checks composed, against a real chain and real forgeries.
 *
 * This is the only file that exercises the whole path a webhook takes — parse, chain,
 * signature, audience, nested envelope, read — and it does it without an Apple developer
 * account, because `scripts/make-jws-fixtures.cjs` generates a genuine ES256 chain and
 * signs genuine notifications with it.
 *
 * The interesting cases are the ones where everything is real except one thing.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { verifyAppleNotification, type AppleVerifyPolicy } from './apple-verify.js'

const fixtures = JSON.parse(
  readFileSync(join(import.meta.dirname, '__fixtures__', 'jws.json'), 'utf8'),
) as Record<string, string>

const POLICY: AppleVerifyPolicy = {
  rootFingerprint: fixtures['rootFingerprint']!,
  bundleId: 'com.worldquest.app',
  environment: 'production',
  // The fixtures are signed at a fixed instant; verifying "now" is that instant, so the
  // replay window is exercised rather than accidentally satisfied.
  now: Number(fixtures['signedDate']),
  maxAgeMs: 3 * 86_400_000,
}

describe('a genuine notification for this app', () => {
  it('verifies and reads through to the transaction inside', () => {
    const result = verifyAppleNotification(fixtures['appleValid']!, POLICY)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.notificationId).toBe('apple-uuid-0001')
    expect(result.value.storeRef).toBe('2000000000000001')
    expect(result.value.notification.kind).toBe('DID_RENEW')
    expect(result.value.notification.environment).toBe('production')
  })

  it('logs the raw JWS rather than our reading of it', () => {
    // A billing dispute is answered by what arrived, not by what we understood at the
    // time. Storing the parsed object makes a parser bug unrecoverable.
    const result = verifyAppleNotification(fixtures['appleValid']!, POLICY)
    expect(result.ok && result.payload).toEqual({ signedPayload: fixtures['appleValid'] })
  })

  it('reads a trial through both envelopes', () => {
    const result = verifyAppleNotification(fixtures['appleTrial']!, POLICY)
    expect(result.ok && result.value.notification.isTrial).toBe(true)
  })
})

describe('the forgeries — everything real except one thing', () => {
  it('rejects a genuine, correctly signed notification about another app', () => {
    // THE App Store Server Notification bug. Every signature here is Apple's, the chain
    // terminates at the pinned root, the payload is untouched — and it is about
    // com.attacker.app. A signature-only handler hands out Premium for this.
    const result = verifyAppleNotification(fixtures['appleWrongBundle']!, POLICY)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/bundleId is for a different app/)
  })

  it('rejects a sandbox notification on a production server', () => {
    // Sandbox receipts reach production endpoints routinely; it is how people test.
    const result = verifyAppleNotification(fixtures['appleSandbox']!, POLICY)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/wrong environment/)
  })

  it('accepts that same sandbox notification on a sandbox server', () => {
    const result = verifyAppleNotification(fixtures['appleSandbox']!, {
      ...POLICY,
      environment: 'sandbox',
    })
    expect(result.ok && result.value.notification.environment).toBe('sandbox')
  })

  it('rejects a perfect envelope wrapped around a forged transaction', () => {
    // The outer JWS verifies. The nested one is signed by the intermediate rather than
    // the leaf — and it carries originalTransactionId, the field that picks the account.
    // A handler that verifies only the envelope accepts an attacker's choice of victim.
    const result = verifyAppleNotification(fixtures['appleForgedTransaction']!, POLICY)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/transaction: signature does not verify/)
  })

  it('rejects a chain that does not terminate at the pinned root', () => {
    const result = verifyAppleNotification(fixtures['appleValid']!, {
      ...POLICY,
      rootFingerprint: 'AA:BB:CC',
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/pinned root/)
  })

  it('rejects anything that is not a JWS at all', () => {
    for (const junk of ['', 'nonsense', 'a.b', '{"signedPayload":"x"}']) {
      expect(verifyAppleNotification(junk, POLICY).ok).toBe(false)
    }
  })
})

describe('the replay window', () => {
  it('refuses a captured notification replayed after the window', () => {
    // A signature never expires. Without this, a captured SUBSCRIBED can be posted next
    // year to resurrect a lapsed subscription — with a perfectly valid signature.
    const result = verifyAppleNotification(fixtures['appleValid']!, {
      ...POLICY,
      now: POLICY.now + 4 * 86_400_000,
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/too old/)
  })

  it('still accepts one inside the three-day retry schedule', () => {
    const result = verifyAppleNotification(fixtures['appleValid']!, {
      ...POLICY,
      now: POLICY.now + 2 * 86_400_000,
    })
    expect(result.ok).toBe(true)
  })
})

describe('the order of the checks', () => {
  it('refuses on the signature before the claims are read', () => {
    // Order is the security property. `appleWrongBundle` is caught by the audience
    // check; this one is caught earlier, and it must be, because a handler that reads
    // claims first has already branched on attacker-controlled data.
    const result = verifyAppleNotification(fixtures['tampered']!, POLICY)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/signature does not verify/)
  })
})
