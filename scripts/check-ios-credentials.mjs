#!/usr/bin/env node
// Does the EAS project actually hold iOS signing credentials?
//
// ## Why this exists
//
// `eas build --platform ios --profile production --non-interactive` does NOT create
// signing credentials. Read the CLI's own code (eas-cli 21.7.0,
// credentials/ios/actions/SetUpDistributionCertificate.js):
//
//     async runNonInteractiveAsync(_ctx, currentCertificate) {
//       Log.warn('Distribution Certificate is not validated for non-interactive builds.');
//       if (!currentCertificate) {
//         throw new MissingCredentialsNonInteractiveError();
//       }
//       return currentCertificate;
//     }
//
// It returns what already exists or it throws "Credentials are not set up. Run this
// command again in interactive mode." There is no environment variable, no flag and
// no App Store Connect key that changes this — EXPO_ASC_* only supply an existing
// key, they do not authorise minting a certificate.
//
// So a store build has exactly one prerequisite this repo cannot satisfy from CI: an
// Apple distribution certificate and an App Store provisioning profile, created once
// by a human running `eas credentials` with an Apple Developer login. Until that has
// happened, every run fails — and it fails on the macOS runner, which bills at 10x,
// after the compile has been paid for.
//
// This asks EAS the same question the build asks, over its public GraphQL API, in
// about a second, on the cheap runner.
//
// ## Fail-open by design
//
// It exits non-zero ONLY on positive evidence: a well-formed answer from EAS saying
// the credentials are absent, expired, or attached to a different bundle id. No
// token, no network, an unexpected response shape, a GraphQL error — all warn and
// exit 0. A preflight that blocks a release because it could not reach a server is
// worse than no preflight; the build itself remains the source of truth.
//
// Not part of `pnpm verify`: it needs the network and an EXPO_TOKEN. The workflows
// run it directly.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APP_JSON = path.join(ROOT, 'apps', 'mobile', 'app.json')

// eas-cli builds this as getExpoApiBaseUrl() + '/graphql'
// (commandUtils/context/contextUtils/createGraphqlClient.js), with a Bearer token.
// The override exists so the decision logic below can be exercised against a stub —
// the query itself has never been run against the live API from this repo, because
// no environment that has worked on it could reach api.expo.dev.
const GRAPHQL_URL = process.env.EAS_GRAPHQL_URL ?? 'https://api.expo.dev/graphql'
/** Store builds. The enum value is IosDistributionType.AppStore in eas-cli's schema. */
const DISTRIBUTION_TYPE = 'APP_STORE'
/** Warn this far ahead of an expiry, so a release is never the thing that discovers it. */
const EXPIRY_WARNING_DAYS = 30

const warn = (...a) => console.warn('[ios-credentials]', ...a)

/** Warn and exit 0 — we could not answer the question, so we do not block on it. */
function inconclusive(reason) {
  warn(`skipped — ${reason}`)
  warn('The build itself will still tell you; this check only ever saves you the wait.')
  process.exit(0)
}

/** Exit 1 — EAS answered, and the answer means the build cannot succeed. */
function blocked(headline, detail) {
  console.error(`\n✗ ${headline}\n`)
  for (const line of detail) console.error(`  ${line}`)
  console.error(
    [
      '',
      '  Fix it once, from a machine with the Apple Developer login for this app:',
      '',
      '      cd apps/mobile',
      '      eas credentials        # iOS → production → distribution certificate',
      '                             #                  → App Store provisioning profile',
      '',
      '  EAS stores them against the project and every later CI build reuses them.',
      '  It cannot be done from CI: eas-cli refuses to mint credentials in',
      '  --non-interactive mode, by design. See docs/engineering/eas-build-profiles.md.',
      '',
    ].join('\n'),
  )
  process.exit(1)
}

const QUERY = `
  query WorldQuestIosCredentials($fullName: String!) {
    app {
      byFullName(fullName: $fullName) {
        id
        iosAppCredentials {
          id
          appleAppIdentifier { bundleIdentifier }
          iosAppBuildCredentialsList {
            id
            iosDistributionType
            distributionCertificate { id validityNotAfter }
            provisioningProfile { id expiration status }
          }
        }
      }
    }
  }
`

const token = process.env.EXPO_TOKEN
if (!token) inconclusive('EXPO_TOKEN is not set')

const { expo } = JSON.parse(fs.readFileSync(APP_JSON, 'utf8'))
const owner = expo?.owner
const slug = expo?.slug
const bundleIdentifier = expo?.ios?.bundleIdentifier
if (!owner || !slug) {
  inconclusive('apps/mobile/app.json has no owner/slug (scripts/check-eas-config.ts covers that)')
}
const fullName = `@${owner}/${slug}`

let payload
try {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: QUERY, variables: { fullName } }),
  })
  if (!response.ok) {
    inconclusive(`EAS returned HTTP ${response.status} for ${fullName}`)
  }
  payload = await response.json()
} catch (error) {
  inconclusive(`could not reach ${GRAPHQL_URL} — ${error.message}`)
}

if (payload.errors?.length) {
  inconclusive(`EAS GraphQL error — ${payload.errors.map((e) => e.message).join('; ')}`)
}

const app = payload.data?.app?.byFullName
if (!app) inconclusive(`EXPO_TOKEN cannot see the project ${fullName}`)

const credentialSets = app.iosAppCredentials
if (!Array.isArray(credentialSets)) inconclusive('unexpected response shape from EAS')

console.log(`Project ${fullName} · bundle ${bundleIdentifier}`)

// From here on the answer is authoritative: EAS told us what it holds.
const forThisBundle = credentialSets.filter(
  (set) => set.appleAppIdentifier?.bundleIdentifier === bundleIdentifier,
)

if (forThisBundle.length === 0) {
  const others = credentialSets
    .map((set) => set.appleAppIdentifier?.bundleIdentifier)
    .filter(Boolean)
  blocked(
    'EAS holds no iOS credentials for this bundle identifier.',
    others.length > 0
      ? [
          `EAS has credentials for: ${others.join(', ')}`,
          `app.json asks for:       ${bundleIdentifier}`,
          'One of the two is wrong — either the bundle id changed, or the credentials',
          'were set up against a different app.',
        ]
      : [
          'The project has no iOS credentials at all. This is the expected state for a',
          'project nobody has built for iOS yet — it is not a misconfiguration, it is a',
          'step that has not been done.',
        ],
  )
}

const storeCredentials = forThisBundle
  .flatMap((set) => set.iosAppBuildCredentialsList ?? [])
  .filter((entry) => entry.iosDistributionType === DISTRIBUTION_TYPE)

if (storeCredentials.length === 0) {
  blocked(
    `EAS holds iOS credentials for ${bundleIdentifier}, but none for store distribution.`,
    [
      'The `production` profile builds for the App Store, which needs an APP_STORE',
      'distribution certificate and matching provisioning profile. An internal or',
      'ad-hoc set (from a `preview` build) does not substitute for one.',
    ],
  )
}

const now = Date.now()
const problems = []
const warnings = []

for (const entry of storeCredentials) {
  const certificate = entry.distributionCertificate
  const profile = entry.provisioningProfile

  if (!certificate) problems.push('a store credential set has no distribution certificate')
  if (!profile) problems.push('a store credential set has no provisioning profile')

  for (const [label, expiry] of [
    ['distribution certificate', certificate?.validityNotAfter],
    ['provisioning profile', profile?.expiration],
  ]) {
    if (!expiry) continue
    const days = Math.floor((new Date(expiry).getTime() - now) / 86_400_000)
    if (days < 0) problems.push(`the ${label} expired ${-days} day(s) ago (${expiry})`)
    else if (days <= EXPIRY_WARNING_DAYS) warnings.push(`the ${label} expires in ${days} day(s)`)
    else console.log(`  ✓ ${label} valid for ${days} more day(s)`)
  }

  // Apple marks a profile INVALID when the certificate behind it is revoked or the
  // app id's capabilities changed. EAS reports the string verbatim.
  if (profile?.status && profile.status.toUpperCase() !== 'ACTIVE') {
    problems.push(`the provisioning profile status is ${profile.status}, not ACTIVE`)
  }
}

if (problems.length > 0) {
  blocked('The iOS store credentials on EAS cannot sign a build.', problems)
}

for (const line of warnings) warn(line)
console.log('\n✓ EAS holds valid iOS store credentials — the build can sign\n')
