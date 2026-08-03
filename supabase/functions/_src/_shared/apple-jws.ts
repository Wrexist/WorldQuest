/**
 * Decoding an App Store Server Notification, and the one cryptographic call.
 *
 * This is the adapter the policy in `store-verification.ts` was written around. It does
 * three things and nothing else: split the compact JWS, turn the `x5c` header into
 * certificates the policy can reason about, and ask the platform whether the signature
 * is good.
 *
 * ## Why `node:crypto` and not a hand-rolled parser
 *
 * X.509 is ASN.1, ASN.1 is a parser, and a parser reachable by an unauthenticated POST
 * is an attack surface. `X509Certificate` is the platform's, it is audited, and Deno
 * supports it through node compatibility — which is why the edge function can use the
 * same code this repo tests under Node.
 *
 * ## The one detail that silently breaks everything
 *
 * ECDSA signatures have two encodings. OpenSSL emits DER; JOSE requires the raw r‖s
 * concatenation. `dsaEncoding: 'ieee-p1363'` selects the second. Get it wrong and the
 * signature verifies with `openssl dgst` and fails in every JWT library on earth, which
 * is a confusing afternoon at best and a "let's just skip verification" at worst.
 *
 * Tested against a real chain — see `scripts/make-jws-fixtures.cjs`. Apple will not hand
 * out a test notification, and a verifier exercised only against hand-made objects has
 * never parsed a certificate.
 */

import { X509Certificate, createVerify } from 'node:crypto'
import type { ChainCert } from './store-verification.js'

export type DecodedJws = {
  readonly header: { readonly alg?: string; readonly x5c?: readonly string[] }
  readonly payload: Record<string, unknown>
  /** The bytes that were signed: `header.payload`, still base64url. */
  readonly signingInput: string
  readonly signature: Buffer
}

const fromB64Url = (s: string): Buffer => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

/**
 * Split and parse, without trusting a byte of it.
 *
 * Returns null rather than throwing on anything malformed: the caller is a webhook, the
 * input is from a stranger, and "not a JWS" is an ordinary Tuesday rather than an
 * exceptional condition.
 */
export function decodeJws(compact: string): DecodedJws | null {
  const parts = compact.split('.')
  if (parts.length !== 3) return null

  try {
    const header = JSON.parse(fromB64Url(parts[0]!).toString('utf8')) as DecodedJws['header']
    const payload = JSON.parse(fromB64Url(parts[1]!).toString('utf8')) as Record<string, unknown>
    if (typeof header !== 'object' || header === null) return null
    if (typeof payload !== 'object' || payload === null) return null

    return {
      header,
      payload,
      signingInput: `${parts[0]}.${parts[1]}`,
      signature: fromB64Url(parts[2]!),
    }
  } catch {
    return null
  }
}

/**
 * The `x5c` header as certificates the policy can walk.
 *
 * `issuedBy` is the whole cryptographic contribution of this file: does the parent's
 * public key verify this certificate's signature? Everything else — ordering, pinning,
 * expiry — is policy, and lives where it can be tested without key material.
 */
export function chainFrom(x5c: readonly string[] | undefined): ChainCert[] | null {
  if (x5c === undefined || x5c.length === 0) return null

  try {
    const parsed = x5c.map((der) => new X509Certificate(Buffer.from(der, 'base64')))

    return parsed.map((cert, index) => ({
      fingerprint256: cert.fingerprint256,
      validFrom: Date.parse(cert.validFrom),
      validTo: Date.parse(cert.validTo),
      issuedBy: (parent) => {
        // Positional, because the policy hands back the object it was given and the
        // certificates themselves are what must be compared, not the wrappers.
        const parentIndex = chainIndex(parent)
        if (parentIndex === null) return false
        const parentCert = parsed[parentIndex]
        if (parentCert === undefined) return false
        // `verify` answers "did this key sign this certificate", which is the question.
        // `checkIssued` only compares names, and names are not a signature.
        return cert.verify(parentCert.publicKey)
      },
    }))

    // A closure over the array above, so `issuedBy` can find the platform certificate
    // that corresponds to the plain object the policy passed back.
    function chainIndex(target: ChainCert): number | null {
      const found = parsed.findIndex((c) => c.fingerprint256 === target.fingerprint256)
      return found === -1 ? null : found
    }
  } catch {
    // A certificate that will not parse is a certificate we do not trust.
    return null
  }
}

/**
 * Does the leaf's key vouch for these bytes?
 *
 * ES256 only. Accepting `alg` from the header and dispatching on it is the `alg: none`
 * family of bugs — the sender does not get to choose how their signature is checked.
 */
export function verifySignature(jws: DecodedJws, leafDer: string): boolean {
  if (jws.header.alg !== 'ES256') return false

  try {
    const leaf = new X509Certificate(Buffer.from(leafDer, 'base64'))
    const verifier = createVerify('SHA256')
    verifier.update(jws.signingInput)
    // `leaf.publicKey` is already a KeyObject — wrapping it in `createPublicKey` was the
    // first draft and it does not round-trip. Pass it straight through.
    return verifier.verify({ key: leaf.publicKey, dsaEncoding: 'ieee-p1363' }, jws.signature)
  } catch {
    return false
  }
}
