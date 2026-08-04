/**
 * The checks that decide whether a store notification is ours to trust.
 *
 * Written attack-first. Each test is a thing somebody can actually send, and the
 * assertion is that it is refused — because every one of these is accepted by a handler
 * that verifies the signature and stops there, which is the shape almost every
 * first-draft webhook has.
 */

import { describe, expect, it } from 'vitest'
import {
  verifyChain,
  verifyClaims,
  type ChainCert,
  type ClaimPolicy,
} from './store-verification.js'

const NOW = Date.parse('2026-08-03T12:00:00Z')
const YEAR = 365 * 86_400_000

const ROOT_FP = 'AA:BB:CC:DD'
const EVIL_FP = '99:88:77:66'

/**
 * A certificate that knows who signed it.
 *
 * `issuedBy` compares identity rather than doing crypto, which is exactly the seam the
 * module documents: the real adapter is `cert.verify(parent.publicKey)`, and the policy
 * under test here is everything around that call.
 */
const cert = (
  id: string,
  signedBy: string | null,
  over: Partial<ChainCert> = {},
): ChainCert & { id: string } => ({
  id,
  fingerprint256: id,
  validFrom: NOW - YEAR,
  validTo: NOW + YEAR,
  issuedBy: (parent) => signedBy === (parent as ChainCert & { id: string }).id,
  ...over,
})

const leaf = () => cert('leaf', 'inter')
const inter = () => cert('inter', ROOT_FP)
const root = () => cert(ROOT_FP, null)

describe('the certificate chain', () => {
  it('accepts a well-formed chain that terminates at the pinned root', () => {
    expect(verifyChain([leaf(), inter(), root()], { rootFingerprint: ROOT_FP, now: NOW })).toBeNull()
  })

  it('refuses a chain rooted anywhere else', () => {
    // The attacker's chain is internally perfect. Only the pin rejects it.
    const evilRoot = cert(EVIL_FP, null)
    const evilInter = cert('inter', EVIL_FP)
    expect(
      verifyChain([cert('leaf', 'inter'), evilInter, evilRoot], { rootFingerprint: ROOT_FP, now: NOW }),
    ).toMatch(/pinned root/)
  })

  it('refuses a chain that merely CONTAINS the pinned root', () => {
    // Append the genuine Apple root to your own chain and a naive "is the trusted root
    // in here?" check passes. The pin is compared against the end of the chain only.
    const forged = [cert('leaf', 'evil-inter'), cert('evil-inter', EVIL_FP), cert(EVIL_FP, null), root()]
    expect(verifyChain(forged, { rootFingerprint: ROOT_FP, now: NOW })).toMatch(/not issued by/)
  })

  it('refuses a chain whose links do not actually sign each other', () => {
    // Right certificates, wrong order — or a leaf swapped for someone else's.
    const stranger = cert('stranger', 'somebody-else')
    expect(verifyChain([stranger, inter(), root()], { rootFingerprint: ROOT_FP, now: NOW })).toMatch(
      /certificate 0 was not issued by/,
    )
  })

  it('refuses a single self-signed certificate offered as a chain', () => {
    expect(verifyChain([root()], { rootFingerprint: ROOT_FP, now: NOW })).toMatch(/too short/)
  })

  it('refuses an expired leaf', () => {
    const stale = cert('leaf', 'inter', { validTo: NOW - 1 })
    expect(verifyChain([stale, inter(), root()], { rootFingerprint: ROOT_FP, now: NOW })).toMatch(/expired/)
  })

  it('refuses an expired INTERMEDIATE, not just the leaf', () => {
    // The one people miss. An expired intermediate invalidates everything beneath it,
    // and a check that only looks at the leaf accepts the lot.
    const staleInter = cert('inter', ROOT_FP, { validTo: NOW - 1 })
    expect(verifyChain([leaf(), staleInter, root()], { rootFingerprint: ROOT_FP, now: NOW })).toMatch(
      /certificate 1 has expired/,
    )
  })

  it('refuses a certificate that is not valid yet', () => {
    const early = cert('leaf', 'inter', { validFrom: NOW + 1 })
    expect(verifyChain([early, inter(), root()], { rootFingerprint: ROOT_FP, now: NOW })).toMatch(
      /not yet valid/,
    )
  })
})

describe('the claims, once the signature is known to be good', () => {
  const policy: ClaimPolicy = {
    bundleId: 'com.worldquest.app',
    environment: 'production',
    now: NOW,
    maxAgeMs: 3 * 86_400_000,
  }
  const claims = { bundleId: 'com.worldquest.app', environment: 'Production', signedDate: NOW - 1000 }

  it('accepts a genuine, current notification about this app', () => {
    expect(verifyClaims(claims, policy)).toBeNull()
  })

  it('refuses a genuinely Apple-signed notification about SOMEONE ELSE\'S app', () => {
    // The whole reason this file exists. Apple signs notifications for every app on the
    // store, so anyone with a developer account can obtain a real, valid, correctly
    // signed notification and post it here. A signature-only handler grants Premium.
    expect(verifyClaims({ ...claims, bundleId: 'com.attacker.app' }, policy)).toMatch(/different app/)
  })

  it('refuses a notification with no bundleId at all', () => {
    expect(verifyClaims({ ...claims, bundleId: undefined }, policy)).toMatch(/no bundleId/)
  })

  it('refuses a sandbox notification on a production server', () => {
    expect(verifyClaims({ ...claims, environment: 'Sandbox' }, policy)).toMatch(/wrong environment/)
  })

  it('compares the environment case-insensitively, because Apple capitalises it', () => {
    expect(verifyClaims({ ...claims, environment: 'PRODUCTION' }, policy)).toBeNull()
  })

  it('refuses a replayed notification from last year', () => {
    // A signature never expires. Without this, a captured SUBSCRIBED can be posted again
    // whenever the sender likes, to resurrect a subscription that lapsed months ago.
    expect(verifyClaims({ ...claims, signedDate: NOW - YEAR }, policy)).toMatch(/too old/)
  })

  it('allows a notification the store has been retrying for two days', () => {
    // Apple retries for up to three days. A window tighter than that rejects real
    // notifications during an outage, which is the failure mode of over-correcting here.
    expect(verifyClaims({ ...claims, signedDate: NOW - 2 * 86_400_000 }, policy)).toBeNull()
  })

  it('refuses a notification dated in the future', () => {
    expect(verifyClaims({ ...claims, signedDate: NOW + 3_600_000 }, policy)).toMatch(/future/)
  })

  it('tolerates a minute of clock skew', () => {
    expect(verifyClaims({ ...claims, signedDate: NOW + 30_000 }, policy)).toBeNull()
  })

  it('refuses a notification with no signedDate, rather than treating it as now', () => {
    expect(verifyClaims({ ...claims, signedDate: undefined }, policy)).toMatch(/no signedDate/)
  })
})
