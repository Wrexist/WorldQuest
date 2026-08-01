/**
 * The key-type generator, as a pure function.
 *
 * Separated from the script that writes the file so a test can call it and compare
 * against what is committed. A generated file that has drifted from its source is
 * worse than no generated file: it type-checks, so it looks correct, right up until a
 * key that no longer exists renders as itself on a screen.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ICU-aware, and identical to the one in check.ts on purpose — if these two ever
 * disagree, the generated types and the CI gate disagree, and one of them is lying.
 * A real placeholder is always followed by `}` or `,`; the first word of a plural
 * branch (`{count, plural, =0 {No streak yet}}` → "No") never is.
 */
export const placeholdersOf = (value: string): string[] =>
  [...new Set([...value.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]!))].sort()

export type KeyStats = {
  readonly namespaces: readonly string[]
  readonly keyCount: number
  readonly withParams: number
}

/**
 * `Record<never, never>` rather than `{}` for keys with no placeholders: its `keyof`
 * is `never`, which is what lets `t()` drop the params argument entirely for simple
 * keys instead of demanding an empty object at every call site.
 */
const paramsType = (params: readonly string[]): string =>
  params.length === 0
    ? 'Record<never, never>'
    : `{ ${params.map((p) => `${p}: string | number`).join('; ')} }`

export function generateKeys(englishDir: string): { source: string; stats: KeyStats } {
  const entries: { key: string; params: string[]; namespace: string }[] = []

  for (const file of readdirSync(englishDir).filter((f) => f.endsWith('.json')).sort()) {
    const namespace = file.replace(/\.json$/, '')
    const bundle = JSON.parse(readFileSync(join(englishDir, file), 'utf8')) as Record<string, string>

    for (const [key, value] of Object.entries(bundle)) {
      // Translator notes are build-time metadata, not strings anyone renders.
      if (key.endsWith('__note')) continue
      entries.push({ key, params: placeholdersOf(value), namespace })
    }
  }

  entries.sort((a, b) => a.key.localeCompare(b.key))
  const namespaces = [...new Set(entries.map((e) => e.namespace))].sort()

  const source = `/**
 * GENERATED FILE — do not edit.
 *
 * Source: packages/i18n/locales/en/
 * Regenerate: pnpm i18n:types
 *
 * ${entries.length} keys across ${namespaces.length} namespaces.
 */

/** Every key that exists in the English catalogue. Keys are permanent. */
export type TranslationKey =
${entries.map((e) => `  | '${e.key}'`).join('\n')}

/** The placeholders each key requires, derived from the English value. */
export type TranslationParams = {
${entries.map((e) => `  '${e.key}': ${paramsType(e.params)}`).join('\n')}
}

/** One bundle per namespace, so a screen can load only the strings it renders. */
export type Namespace =
${namespaces.map((n) => `  | '${n}'`).join('\n')}

export const NAMESPACES = [
${namespaces.map((n) => `  '${n}',`).join('\n')}
] as const satisfies readonly Namespace[]
`

  return {
    source,
    stats: {
      namespaces,
      keyCount: entries.length,
      withParams: entries.filter((e) => e.params.length > 0).length,
    },
  }
}
