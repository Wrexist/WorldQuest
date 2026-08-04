/**
 * Generate a certificate chain and signed JWS payloads for the store-notification tests.
 *
 * Apple will not hand out a test notification, and a verifier tested only against
 * hand-made objects is a verifier that has never parsed a real certificate. So this
 * builds a chain shaped exactly like Apple's — root → intermediate → leaf, ES256, the
 * leaf's `x5c` carrying all three — signs a payload with it, and writes the lot as
 * fixtures.
 *
 * The fixtures are COMMITTED, so the tests need neither openssl nor this script. Run it
 * only to add a case. The keys are throwaway and generated here; nothing secret exists.
 *
 * Run: node scripts/make-jws-fixtures.cjs
 */

const { execFileSync } = require('node:child_process')
const { mkdirSync, readFileSync, writeFileSync, existsSync } = require('node:fs')
const { createSign, createPrivateKey } = require('node:crypto')
const { join } = require('node:path')

const OUT = join(__dirname, '..', 'supabase', 'functions', '_src', '_shared', '__fixtures__')
const TMP = join(OUT, '.work')

const sh = (cmd, args) => execFileSync(cmd, args, { cwd: TMP, stdio: ['ignore', 'pipe', 'pipe'] })

/** One ES256 key plus a certificate, signed by `issuer` or self-signed when null. */
function makeCert(name, subject, issuer) {
  sh('openssl', ['ecparam', '-genkey', '-name', 'prime256v1', '-noout', '-out', `${name}.key`])
  if (issuer === null) {
    sh('openssl', ['req', '-x509', '-new', '-key', `${name}.key`, '-sha256', '-days', '7300',
      '-subj', subject, '-out', `${name}.pem`])
    return
  }
  sh('openssl', ['req', '-new', '-key', `${name}.key`, '-subj', subject, '-out', `${name}.csr`])
  sh('openssl', ['x509', '-req', '-in', `${name}.csr`, '-CA', `${issuer}.pem`, '-CAkey',
    `${issuer}.key`, '-CAcreateserial', '-days', '7300', '-sha256', '-out', `${name}.pem`])
}

/** PEM → the base64 DER body, which is exactly what a JWS `x5c` entry holds. */
const derOf = (name) =>
  readFileSync(join(TMP, `${name}.pem`), 'utf8')
    .replace(/-----(BEGIN|END) CERTIFICATE-----/g, '')
    .replace(/\s+/g, '')

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/**
 * Sign a compact JWS with ES256.
 *
 * `dsaEncoding: 'ieee-p1363'` is not optional: OpenSSL's default is DER, and JOSE
 * requires the raw r‖s concatenation. Getting this wrong produces a signature that
 * verifies with `openssl` and fails in every JWT library on earth.
 */
function sign(header, payload, keyName) {
  const encoded = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const signer = createSign('SHA256')
  signer.update(encoded)
  const key = createPrivateKey(readFileSync(join(TMP, `${keyName}.key`)))
  return `${encoded}.${b64url(signer.sign({ key, dsaEncoding: 'ieee-p1363' }))}`
}

mkdirSync(TMP, { recursive: true })

makeCert('root', '/CN=WorldQuest Test Root', null)
makeCert('inter', '/CN=WorldQuest Test Intermediate', 'root')
makeCert('leaf', '/CN=WorldQuest Test Leaf', 'inter')
// An unrelated but internally perfect chain: the pin is the only thing that rejects it.
makeCert('evilRoot', '/CN=Attacker Root', null)
makeCert('evilLeaf', '/CN=Attacker Leaf', 'evilRoot')

const x5c = [derOf('leaf'), derOf('inter'), derOf('root')]
const header = { alg: 'ES256', x5c }

/**
 * When these notifications claim to have been signed — derived from the chain, not chosen.
 *
 * A hardcoded constant here made every chain assertion fail the moment the certificates
 * were regenerated: openssl stamps `validFrom` with the wall clock, so a fixed date that
 * was comfortably inside the window last month is "certificate 0 is not yet valid" today.
 * A day after the chain starts is inside every window by construction, for ever.
 */
const { X509Certificate: Cert } = require('node:crypto')
const SIGNED_DATE =
  Date.parse(new Cert(readFileSync(join(TMP, 'leaf.pem'))).validFrom) + 86_400_000

const payload = {
  notificationType: 'DID_RENEW',
  notificationUUID: 'test-uuid-0001',
  signedDate: SIGNED_DATE,
  data: { bundleId: 'com.worldquest.app', environment: 'Production' },
}

/**
 * A realistic App Store Server Notification v2, nested JWS and all.
 *
 * `signedTransactionInfo` is not a field inside the envelope — it is its own compact JWS
 * with its own `x5c`, signed separately, and it is where `originalTransactionId` lives.
 * That is the value which decides *whose* subscription a notification is about, so the
 * fixtures have to reproduce the nesting or the verifier is never asked to walk into it.
 */
const transactionInfo = {
  originalTransactionId: '2000000000000001',
  transactionId: '2000000000000002',
  bundleId: 'com.worldquest.app',
  environment: 'Production',
  purchaseDate: SIGNED_DATE - 30 * 86_400_000,
  expiresDate: SIGNED_DATE + 30 * 86_400_000,
  inAppOwnershipType: 'PURCHASED',
  type: 'Auto-Renewable Subscription',
}

const notificationFor = (over = {}, txOver = {}, txKey = 'leaf') => {
  const tx = sign(header, { ...transactionInfo, ...txOver }, txKey)
  return sign(
    header,
    {
      notificationType: 'DID_RENEW',
      notificationUUID: 'apple-uuid-0001',
      version: '2.0',
      signedDate: SIGNED_DATE,
      data: {
        appAppleId: 1234567890,
        bundleId: 'com.worldquest.app',
        bundleVersion: '1',
        environment: 'Production',
        signedTransactionInfo: tx,
        ...over,
      },
    },
    'leaf',
  )
}

const fixtures = {
  $comment:
    'Generated by scripts/make-jws-fixtures.cjs. Throwaway keys, no secrets. A chain ' +
    "shaped like Apple's so the verifier is exercised against real DER rather than " +
    'against objects shaped like what we hoped DER looks like.',
  rootFingerprint: null, // filled below, from the parsed certificate
  signedDate: SIGNED_DATE,
  x5c,
  evilX5c: [derOf('evilLeaf'), derOf('evilRoot')],
  valid: sign(header, payload, 'leaf'),
  // Same header and payload, signed by the WRONG key. Chain is perfect; signature is not.
  wrongSigner: sign(header, payload, 'inter'),
  // A payload edited after signing — the classic "decode and trust" failure.
  tampered: (() => {
    const good = sign(header, payload, 'leaf')
    const [h, , s] = good.split('.')
    const evil = b64url(JSON.stringify({ ...payload, data: { ...payload.data, bundleId: 'com.attacker.app' } }))
    return `${h}.${evil}.${s}`
  })(),

  // ── the full v2 shape ──────────────────────────────────────────────────────
  appleValid: notificationFor(),
  // A genuine, correctly signed notification about somebody ELSE'S app. Every signature
  // in it is real; only the bundleId check rejects it, which is the entire reason that
  // check exists.
  appleWrongBundle: notificationFor({ bundleId: 'com.attacker.app' }),
  appleSandbox: notificationFor({ environment: 'Sandbox' }),
  // The envelope is perfect and its nested transaction is signed by the intermediate
  // rather than the leaf. A handler that verifies only the outer JWS accepts this, and
  // with it an originalTransactionId of the sender's choosing.
  appleForgedTransaction: notificationFor({}, {}, 'inter'),
  appleTrial: notificationFor({}, { offerType: 1, offerDiscountType: 'FREE_TRIAL' }),
}

fixtures.rootFingerprint = new Cert(readFileSync(join(TMP, 'root.pem'))).fingerprint256

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'jws.json'), JSON.stringify(fixtures, null, 2) + '\n')

console.log(`✓ wrote ${join('supabase', 'functions', '_src', '_shared', '__fixtures__', 'jws.json')}`)
console.log(`  chain of ${x5c.length}, root ${fixtures.rootFingerprint.slice(0, 17)}…`)
if (existsSync(TMP)) console.log(`  keys left in ${TMP} — untracked, safe to delete`)
