/**
 * Pseudo-locale generator — `en-XA`.
 *
 * German and Finnish run roughly 40 % longer than English. Testing a layout only in
 * English means discovering that in a screenshot from a translator, months later,
 * after the layout has been copied into six other screens. Pseudo-localisation moves
 * that discovery to today: same words, inflated and accented, so truncation and
 * clipping are visible before anyone translates anything.
 *
 * Accents also make untranslated strings obvious. Anything still rendering in plain
 * ASCII when the app is running `en-XA` never went through `t()`.
 *
 * Placeholders and ICU structure are left strictly alone — mangling `{count, plural,
 * ...}` would produce a broken bundle rather than a wide one.
 *
 * Run: pnpm i18n:pseudo
 *
 * Spec: docs/engineering/localization.md §3.6
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXPANSION, pseudo } from './pseudo-text.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const englishDir = join(root, 'locales', 'en')
const outDir = join(root, 'locales', 'en-XA')

const files = readdirSync(englishDir).filter((f) => f.endsWith('.json')).sort()
const widest: { key: string; before: number; after: number }[] = []

mkdirSync(outDir, { recursive: true })

for (const file of files) {
  const bundle = JSON.parse(readFileSync(join(englishDir, file), 'utf8')) as Record<string, string>
  const out: Record<string, string> = {}

  for (const [key, value] of Object.entries(bundle)) {
    if (key.endsWith('__note')) continue
    out[key] = pseudo(value)
    widest.push({ key, before: value.length, after: out[key]!.length })
  }

  writeFileSync(join(outDir, file), `${JSON.stringify(out, null, 2)}\n`)
}

widest.sort((a, b) => b.after - a.after)

console.log(`Pseudo-locale en-XA\n`)
console.log(`  namespaces  ${files.length}`)
console.log(`  strings     ${widest.length}`)
console.log(`  expansion   +${Math.round(EXPANSION * 100)}%\n`)
console.log(`  Longest strings — check these layouts first:\n`)
for (const { key, before, after } of widest.slice(0, 10)) {
  console.log(`    ${String(after).padStart(4)} chars (was ${String(before).padStart(3)})  ${key}`)
}
console.log(`\n✓ wrote locales/en-XA/ (gitignored — regenerate with pnpm i18n:pseudo)`)
