/**
 * Localisation gate.
 *
 * Runs in CI on every commit. English leaks back in within a month without this —
 * and a concatenated or untranslated string is invisible until a Swedish user hits
 * it and quietly leaves.
 *
 * Run: pnpm i18n:check
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const localesDir = join(root, 'locales')

const SHIPPED_LOCALES = ['en', 'sv'] as const
const BASE = 'en'

/** Short or ambiguous strings mistranslate without context. */
const NOTE_REQUIRED_MAX_LENGTH = 15

type Problem = { message: string }
const errors: Problem[] = []
const warnings: Problem[] = []

const readNamespace = (locale: string, file: string): Record<string, string> =>
  JSON.parse(readFileSync(join(localesDir, locale, file), 'utf8'))

/**
 * ICU-aware. A naive /\{(\w+)/ also captures the first word of a plural branch —
 * `{count, plural, =0 {No streak yet} ...}` yields a phantom "No" placeholder, and
 * the Swedish translation yields "Ingen", so every ICU string looks mismatched.
 * A real placeholder is always followed by `}` or `,`.
 */
const placeholdersOf = (value: string): string[] =>
  [...new Set([...value.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]!))].sort()

const baseFiles = readdirSync(join(localesDir, BASE)).filter((f) => f.endsWith('.json'))
let keyCount = 0
let noteCount = 0

for (const file of baseFiles) {
  const base = readNamespace(BASE, file)
  const realKeys = Object.keys(base).filter((k) => !k.endsWith('__note'))
  keyCount += realKeys.length

  for (const key of realKeys) {
    const value = base[key]!

    // 1. Namespaced key format.
    if (!/^[a-z][a-zA-Z0-9]*:[a-zA-Z0-9_.]+$/.test(key)) {
      errors.push({ message: `${file}: key "${key}" is not namespace:screen.element` })
    }

    // 2. Translator context where it matters.
    const hasNote = base[`${key}__note`] !== undefined
    if (hasNote) noteCount++
    const needsNote =
      value.length <= NOTE_REQUIRED_MAX_LENGTH || value.includes('{')
    if (needsNote && !hasNote) {
      warnings.push({
        message: `${file}: "${key}" is short or has a placeholder but has no __note`,
      })
    }

    // 3. Plurals must use ICU, not a hand-rolled conditional.
    if (/\{count\}/.test(value) && !/plural/.test(value)) {
      warnings.push({
        message: `${file}: "${key}" interpolates {count} without an ICU plural — Swedish and German need forms English does not`,
      })
    }

    // 4. Tone rules from the voice guide, enforced rather than remembered.
    const banned = [/\bOops\b/i, /\bUh oh\b/i, /Don't lose/i, /falling behind/i, /LAST CHANCE/i]
    for (const pattern of banned) {
      if (pattern.test(value)) {
        errors.push({ message: `${file}: "${key}" uses banned guilt/shame copy: "${value}"` })
      }
    }
  }

  // 5. Every shipped locale must be complete, with matching placeholders.
  for (const locale of SHIPPED_LOCALES) {
    if (locale === BASE) continue
    const path = join(localesDir, locale, file)
    if (!existsSync(path)) {
      errors.push({ message: `${locale}/${file} is missing entirely` })
      continue
    }
    const target = readNamespace(locale, file)
    for (const key of realKeys) {
      if (target[key] === undefined) {
        errors.push({ message: `${locale}/${file}: missing key "${key}"` })
        continue
      }
      const a = placeholdersOf(base[key]!)
      const b = placeholdersOf(target[key]!)
      if (a.join(',') !== b.join(',')) {
        errors.push({
          message: `${locale}/${file}: "${key}" placeholder mismatch — en has [${a}], ${locale} has [${b}]`,
        })
      }
    }
    for (const key of Object.keys(target)) {
      if (!key.endsWith('__note') && base[key] === undefined) {
        warnings.push({ message: `${locale}/${file}: orphan key "${key}" not present in en` })
      }
    }
  }
}

console.log(`Localisation check\n`)
console.log(`  namespaces        ${baseFiles.length}`)
console.log(`  keys (en)         ${keyCount}`)
console.log(`  translator notes  ${noteCount}`)
console.log(`  shipped locales   ${SHIPPED_LOCALES.join(', ')}\n`)

for (const w of warnings) console.log(`  ⚠  ${w.message}`)
for (const e of errors) console.error(`  ✗  ${e.message}`)

if (errors.length > 0) {
  console.error(`\n✗ ${errors.length} error(s)`)
  process.exit(1)
}
console.log(`\n✓ all locales complete${warnings.length ? ` (${warnings.length} warning(s))` : ''}`)
