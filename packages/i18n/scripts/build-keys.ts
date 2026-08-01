/**
 * Writes `src/keys.ts` from `locales/en/`.
 *
 * Two things come out of this, and the second is the valuable one:
 *
 *   1. `TranslationKey` — a union of every key that exists, so `t('home:greting')`
 *      is a compile error rather than the literal string "home:greting" rendered on
 *      screen to a user.
 *   2. `TranslationParams` — the placeholders each key actually needs. Forgetting one
 *      is also a compile error. That matters because the failure mode is silent: a
 *      missing `{time}` renders as the literal text `{time}`, which reads as a bug to
 *      a user and as nothing at all to a test that only checks the key resolved.
 *      We shipped exactly that bug once and only caught it by looking at a screenshot.
 *
 * English is the source of truth for shape. `pnpm i18n:check` separately guarantees
 * every other locale carries the same keys with the same placeholders — so typing
 * against `en` types against all of them.
 *
 * Run: pnpm i18n:types
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateKeys } from './keys.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outFile = join(root, 'src', 'keys.ts')

const { source, stats } = generateKeys(join(root, 'locales', 'en'))

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, source)

console.log(`Typed keys\n`)
console.log(`  namespaces  ${stats.namespaces.length}  (${stats.namespaces.join(', ')})`)
console.log(`  keys        ${stats.keyCount}`)
console.log(`  with params ${stats.withParams}`)
console.log(`\n✓ wrote src/keys.ts`)
