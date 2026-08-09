/**
 * `apps/mobile/eas.json` must be strict JSON with schema keys only.
 *
 * ## Why this exists
 *
 * On 2026-08-09 the iOS TestFlight workflow failed on a GitHub macOS runner — the
 * 10x-billed one — after checkout, install and a full `pnpm verify`, without
 * compiling a line:
 *
 *     eas.json is not valid.
 *     - "build.development.$comment" is not allowed
 *     - "build.preview.$comment" is not allowed
 *     ...
 *
 * This repo documents its JSON in the JSON, either as a `$comment` key or as a
 * `$comment:<sibling>` key. That works everywhere it is used — npm ignores unknown
 * keys in `package.json`, our own pack validator allows `$comment` explicitly — and
 * it does not work in `eas.json`, because `eas-cli` validates against a closed
 * schema that rejects every key it does not know.
 *
 * The prose moved to `docs/engineering/eas-build-profiles.md`. This makes sure it
 * stays moved: the failure mode is silent locally, discovered only by paying for a
 * macOS runner, and the convention that causes it is one this repo teaches.
 *
 * ## What it checks
 *
 * 1. The file parses as **strict** JSON — no comments, no trailing commas. Both
 *    workflows also `JSON.parse` it to patch in submit credentials at runtime.
 * 2. No key anywhere starts with `$`. That is the whole bug above.
 * 3. The profiles the workflows name by hand actually exist. `--profile production`
 *    against a renamed profile fails at the same expensive moment.
 * 4. No App Store Connect credential is committed. `ascApiKeyPath`, `ascApiKeyId`
 *    and `ascApiKeyIssuerId` are written into this file at runtime from GitHub
 *    secrets and deleted afterwards; one appearing here is a leak, not a config.
 *
 * It deliberately does not reimplement EAS's schema. A copy of someone else's
 * schema goes stale and then fails builds that were fine.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const EAS_JSON = join(process.cwd(), 'apps/mobile/eas.json')

/** Profiles named literally elsewhere, and by whom. */
const REQUIRED_BUILD_PROFILES: Record<string, string> = {
  preview: 'docs/plan/device-pass.md runs `eas build --profile preview`',
  production: 'both TestFlight workflows run `eas build --profile production`',
}
const REQUIRED_SUBMIT_PROFILES: Record<string, string> = {
  production: 'both TestFlight workflows run `eas submit --profile production`',
}

/** Written at runtime from secrets — never committed. */
const CREDENTIAL_KEYS = ['ascApiKeyPath', 'ascApiKeyId', 'ascApiKeyIssuerId']

const problems: string[] = []

const source = readFileSync(EAS_JSON, 'utf8')

let config: Record<string, unknown>
try {
  config = JSON.parse(source) as Record<string, unknown>
} catch (error) {
  console.error(
    `\n✗ apps/mobile/eas.json is not strict JSON — ${(error as Error).message}\n\n` +
      `  eas-cli and both TestFlight workflows parse this file as strict JSON.\n` +
      `  Comments and trailing commas are not available here; put the prose in\n` +
      `  docs/engineering/eas-build-profiles.md instead.\n`,
  )
  process.exit(1)
}

function walk(node: unknown, path: string): void {
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, `${path}[${i}]`))
    return
  }
  if (node === null || typeof node !== 'object') return

  for (const [key, value] of Object.entries(node)) {
    const here = path === '' ? key : `${path}.${key}`
    if (key.startsWith('$')) {
      problems.push(
        `"${here}" — eas-cli rejects unknown keys, including this repo's $comment ` +
          `convention. Move the note to docs/engineering/eas-build-profiles.md.`,
      )
    }
    if (CREDENTIAL_KEYS.includes(key)) {
      problems.push(
        `"${here}" — an App Store Connect credential is committed. The workflows ` +
          `write these at runtime from GitHub secrets and delete them afterwards.`,
      )
    }
    walk(value, here)
  }
}

walk(config, '')

const build = (config.build ?? {}) as Record<string, unknown>
const submit = (config.submit ?? {}) as Record<string, unknown>

for (const [profile, why] of Object.entries(REQUIRED_BUILD_PROFILES)) {
  if (!(profile in build)) problems.push(`build.${profile} is missing — ${why}.`)
}
for (const [profile, why] of Object.entries(REQUIRED_SUBMIT_PROFILES)) {
  if (!(profile in submit)) problems.push(`submit.${profile} is missing — ${why}.`)
}

if (problems.length > 0) {
  console.error(`\n✗ apps/mobile/eas.json — ${problems.length} problem(s):\n`)
  for (const problem of problems) console.error(`  · ${problem}`)
  console.error(
    `\n  Every one of these fails the build on a macOS runner, after the bill,\n` +
      `  before anything compiles. See docs/engineering/eas-build-profiles.md.\n`,
  )
  process.exit(1)
}

console.log('✓ eas.json is strict JSON, schema keys only, no committed credentials')
