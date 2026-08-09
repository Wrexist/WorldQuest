/**
 * The two config files an iOS build reads before it compiles anything:
 * `apps/mobile/eas.json` and the EAS-relevant half of `apps/mobile/app.json`.
 *
 * ## Why this exists
 *
 * Both of the first two TestFlight attempts died on config, on a GitHub macOS
 * runner — the 10x-billed one — after checkout, install and a full `pnpm verify`,
 * without compiling a line. Neither was visible from any local command. This is
 * the local command.
 *
 * Run #1, 2026-08-09:
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
 * Run #2, minutes later, once the schema was clean:
 *
 *     EAS project not configured. To configure it non-interactively, choose the
 *     account that should own the project and run:
 *       eas init --account <name> --non-interactive
 *
 * `eas build --non-interactive` needs to know which EAS project it is building,
 * and app.json declared neither an `owner` nor an `extra.eas.projectId`, so
 * eas-cli refused to guess an owning account. Same class of bug as the first: a
 * missing field in a config file, invisible until the expensive runner reads it.
 *
 * ## What it checks
 *
 * In `eas.json`:
 *
 * 1. It parses as **strict** JSON — no comments, no trailing commas. Both
 *    workflows also `JSON.parse` it to patch in submit credentials at runtime.
 * 2. No key anywhere starts with `$`. That is run #1.
 * 3. The profiles the workflows name by hand actually exist. `--profile production`
 *    against a renamed profile fails at the same expensive moment.
 * 4. No App Store Connect credential is committed. `ascApiKeyPath`, `ascApiKeyId`
 *    and `ascApiKeyIssuerId` are written into this file at runtime from GitHub
 *    secrets and deleted afterwards; one appearing here is a leak, not a config.
 *
 * In `app.json`:
 *
 * 5. The app config identifies its EAS project — `owner`, or `extra.eas.projectId`,
 *    or both. That is run #2.
 *
 * It deliberately does not reimplement EAS's schema. A copy of someone else's
 * schema goes stale and then fails builds that were fine. It reads app.json as
 * plain JSON rather than evaluating the Expo config, because a config evaluation
 * needs the app's dependencies installed and this has to stay a second long.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const EAS_JSON = join(process.cwd(), 'apps/mobile/eas.json')
const APP_JSON = join(process.cwd(), 'apps/mobile/app.json')

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

// app.json — the project identity half. `owner` names the account that owns the
// EAS project; `extra.eas.projectId` names the project outright. Either resolves
// `eas build --non-interactive`; neither means it stops and asks, which on a CI
// runner means it stops.
const appConfig = (JSON.parse(readFileSync(APP_JSON, 'utf8')) as { expo?: Record<string, unknown> })
  .expo

if (appConfig === undefined) {
  problems.push('apps/mobile/app.json has no `expo` key — that is not an Expo app config.')
} else {
  const owner = appConfig.owner
  const extra = (appConfig.extra ?? {}) as { eas?: { projectId?: unknown } }
  const projectId = extra.eas?.projectId
  if (typeof owner !== 'string' && typeof projectId !== 'string') {
    problems.push(
      'apps/mobile/app.json declares neither `expo.owner` nor `expo.extra.eas.projectId` — ' +
        '`eas build --non-interactive` will fail with "EAS project not configured", because ' +
        'it cannot choose an owning account for you. Run `eas init` once and commit the ' +
        'result, or set `owner` to the Expo account that owns the project.',
    )
  }
}

if (problems.length > 0) {
  console.error(`\n✗ EAS config — ${problems.length} problem(s):\n`)
  for (const problem of problems) console.error(`  · ${problem}`)
  console.error(
    `\n  Every one of these fails the build on a macOS runner, after the bill,\n` +
      `  before anything compiles. See docs/engineering/eas-build-profiles.md.\n`,
  )
  process.exit(1)
}

console.log(
  '✓ eas.json is strict JSON with schema keys only and no committed credentials; ' +
    'app.json identifies its EAS project',
)
