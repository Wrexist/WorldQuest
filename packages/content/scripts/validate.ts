/**
 * Content validation gate.
 *
 * Runs in CI on every commit. Content is the one thing users notice being wrong,
 * and a wrong fact in a learning app is a P1 bug — so the rules that keep content
 * trustworthy are enforced by a machine, not by discipline.
 *
 * Run: pnpm content:validate
 */

import ajvModule from 'ajv/dist/2020.js'
import ajvFormatsModule from 'ajv-formats'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(root, '..', '..')

type Problem = { file: string; message: string }
const errors: Problem[] = []
const warnings: Problem[] = []

/** Volatile facts go stale. These are the re-verification windows from the spec. */
const MAX_AGE_DAYS = { stable: 730, slow: 365, fast: 0 } as const
const TODAY = new Date('2026-07-31')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.json')) out.push(full)
  }
  return out
}

function stripComments(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripComments)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !k.startsWith('$comment'))
        .map(([k, v]) => [k, stripComments(v)]),
    )
  }
  return value
}

/**
 * ajv and ajv-formats ship CommonJS with `export =`. Under NodeNext ESM the callable
 * lands on `.default` at runtime while the types point at the namespace, so both need
 * normalising. Typed rather than cast to `any` — `any` is banned (PROJECT.md §5.1).
 */
type SchemaError = { instancePath: string; message?: string }
type ValidateFn = ((data: unknown) => boolean) & { errors?: SchemaError[] | null }
type AjvInstance = { compile: (schema: unknown) => ValidateFn }
type AjvCtor = new (opts: { allErrors?: boolean; strict?: boolean }) => AjvInstance

const interop = <T>(mod: unknown): T =>
  ((mod as { default?: unknown }).default ?? mod) as T

const Ajv2020 = interop<AjvCtor>(ajvModule)
const addFormats = interop<(ajv: AjvInstance) => void>(ajvFormatsModule)

const schema = JSON.parse(readFileSync(join(root, 'schema', 'pack.schema.json'), 'utf8'))
// The pack schema targets draft 2020-12, so it needs Ajv's 2020 build.
const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(schema)

const packFiles = walk(join(root, 'packs'))
const seenIds = new Map<string, string>()
let factCount = 0
let sensitiveCount = 0
let todoCount = 0

for (const file of packFiles) {
  const rel = relative(repoRoot, file)
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  const pack = stripComments(raw) as Record<string, unknown>
  delete pack.$schema

  // 1. Schema
  if (!validate(pack)) {
    for (const e of validate.errors ?? []) {
      errors.push({ file: rel, message: `schema ${e.instancePath || '/'} ${e.message}` })
    }
    continue
  }

  const locales = pack.locales as string[]
  const items = pack.items as Record<string, any>[]

  for (const item of items) {
    // 2. IDs are permanent and must be unique — they ship in save data.
    if (typeof item.id === 'string') {
      const previous = seenIds.get(item.id)
      if (previous) {
        errors.push({ file: rel, message: `duplicate id "${item.id}" (also in ${previous})` })
      }
      seenIds.set(item.id, rel)
    }

    // A fact belongs to an entity. Templates have an `attribute` too, so
    // testing that alone would treat every template as an unsourced fact.
    if (item.attribute === undefined || item.entity === undefined) continue
    factCount++

    // 3. Sourcing and freshness.
    const verifiedAt = item.source?.verifiedAt
    if (!item.source?.url) {
      warnings.push({ file: rel, message: `${item.id}: source has no URL` })
    }
    if (verifiedAt) {
      const ageDays = (TODAY.getTime() - new Date(verifiedAt).getTime()) / 86_400_000
      const limit = MAX_AGE_DAYS[item.volatility as keyof typeof MAX_AGE_DAYS] ?? 365
      if (item.volatility !== 'fast' && ageDays > limit) {
        errors.push({
          file: rel,
          message: `${item.id}: verifiedAt is ${Math.round(ageDays)} days old (${item.volatility} limit is ${limit})`,
        })
      }
    }

    // 4. Volatile facts must never be quiz answers.
    if (item.volatility === 'fast' && item.quizzable !== false) {
      errors.push({
        file: rel,
        message: `${item.id}: volatility "fast" cannot be quizzable — leaders, GDP and rankings go stale`,
      })
    }

    // 5. Locale completeness for every shipped language.
    const names = item.value?.names
    if (names) {
      for (const locale of locales) {
        if (!names[locale]) {
          errors.push({ file: rel, message: `${item.id}: missing "${locale}" value` })
        }
      }
    }

    // 6. Sensitive content needs a human, and must not be silently quizzable.
    if (item.sensitivity === 'review-required') {
      sensitiveCount++
      if (item.quizzable !== false) {
        errors.push({
          file: rel,
          message: `${item.id}: sensitivity "review-required" must set quizzable:false until a human signs off`,
        })
      }
    }

    // 7. Unsourced placeholders are fine — silently shipping them is not.
    if (JSON.stringify(item).includes('TODO(verify)')) {
      todoCount++
      warnings.push({ file: rel, message: `${item.id}: contains TODO(verify)` })
    }
  }

  // 8. Templates: a visual question needs a screen-reader-safe sibling that tests
  //    the SAME fact, so a blind user's learning state is identical to anyone's.
  for (const item of items) {
    if (item.a11y && item.a11y.screenReaderSafe === false && !item.a11y.equivalentTemplate) {
      errors.push({
        file: rel,
        message: `${item.id}: not screen-reader safe and declares no equivalentTemplate`,
      })
    }
    if (item.distractors?.strategy === 'random-global') {
      errors.push({
        file: rel,
        message: `${item.id}: random-global distractors are for test fixtures only`,
      })
    }
    // `other-values` draws from every entity that has this attribute, which is right
    // when the OPTIONS are values — four of fourteen subregions — and badly wrong when
    // the options are entities: "which country's flag is this?" would offer any country
    // on earth, turning a hard question into a free one. The distinction is exactly the
    // one `visually-similar` was once missing.
    const usesOtherValues =
      item.distractors?.strategy === 'other-values' ||
      item.distractors?.fallback === 'other-values'
    if (usesOtherValues && item.answer?.from === 'entity.names') {
      errors.push({
        file: rel,
        message:
          `${item.id}: other-values distractors need a fact-value answer, not an entity ` +
          `one — drawing entities globally for an entity-answer question makes it trivial`,
      })
    }
  }
}

console.log(`Content validation\n`)
console.log(`  packs      ${packFiles.length}`)
console.log(`  facts      ${factCount}`)
console.log(`  unique ids ${seenIds.size}`)
console.log(`  sensitive  ${sensitiveCount} (flagged for human review)`)
console.log(`  TODO       ${todoCount}\n`)

for (const w of warnings) console.log(`  ⚠  ${w.file}: ${w.message}`)
for (const e of errors) console.error(`  ✗  ${e.file}: ${e.message}`)

if (errors.length > 0) {
  console.error(`\n✗ ${errors.length} error(s)`)
  process.exit(1)
}
console.log(`\n✓ all packs valid${warnings.length ? ` (${warnings.length} warning(s))` : ''}`)
