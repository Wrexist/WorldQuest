/**
 * Do the pack's fact VALUES agree with an independent dataset?
 *
 * ## The gap this closes
 *
 * `pnpm content:validate` checks that every fact carries a source, a `verifiedAt` and a
 * volatility window. It cannot check that the value is RIGHT — nothing inside this repo
 * can, because the answer lives outside it. So the strongest statement the pipeline could
 * make about "Sweden's capital is Stockholm" was that somebody had written down where
 * they got it.
 *
 * `PROJECT.md` calls a wrong fact in a learning app "the worst possible bug", and the
 * scheduler is built to make a user certain of what it teaches. A wrong fact does not get
 * corrected by repetition; it gets *installed* by it.
 *
 * This asks a second dataset the same questions. It is the same method that found the
 * FSRS difficulty-ordering bug: a property test proves a thing is self-consistent, and
 * only a reference proves it is correct.
 *
 * ## The reference, and why this one
 *
 * `world-countries@5.1.0` (ODbL), pinned exactly. Independence is the whole point:
 * `countries-list` is already a devDependency here and is what several of these packs
 * were GENERATED from, so checking against it would only prove the generator ran.
 *
 * Pinned rather than ranged because the reference is data. A minor release that renames a
 * capital would turn this red for a reason that has nothing to do with a change anybody
 * made here — which is how a check earns the reputation that gets it deleted.
 *
 * ## A disagreement is not automatically a bug
 *
 * The first run reported six, and all six were the reference being looser or answering a
 * different question. They are recorded in `ACCEPTED` below with the reason, so the check
 * is silent until something NEW disagrees. That is the same discipline
 * `scripts/reachability.ts` uses on its allowlist, for the same reason: "we forgot" and
 * "we decided not to" look identical in a diff unless somebody writes the difference down.
 *
 * Never resolve a disagreement by editing the pack to match the reference. The pack cites
 * ITU-T and ISO where the reference cites a community dataset, and on two of the six the
 * pack is the better-sourced of the two. Disputed territories and seats of government are
 * handled by `docs/systems/content-pipeline.md`, not by whichever list loaded first.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import countries from 'world-countries'

const PACK = join(dirname(fileURLToPath(import.meta.url)), '..', 'packs', 'geography')

type RefCountry = {
  readonly cca2: string
  readonly name: { readonly common: string }
  readonly capital?: readonly string[]
  readonly currencies?: Readonly<Record<string, { readonly name?: string }>>
  readonly idd?: { readonly root?: string; readonly suffixes?: readonly string[] }
  readonly region?: string
  readonly languages?: Readonly<Record<string, string>>
}

// Through `unknown`: the package ships its own generated types, and they are both wider
// than this file needs (every ISO field, translated names, geometry) and narrower in one
// place that matters — `capital` is typed as a fixed-length tuple per country. Narrowing
// to the shape actually read is the honest cast; matching their type would mean copying a
// declaration this file does not use.
const byCode = new Map(
  (countries as unknown as readonly RefCountry[]).map((c) => [c.cca2, c] as const),
)

/**
 * Differences that are real, understood, and not defects.
 *
 * Keyed `attribute:entity`. Each one is a claim that SOMEBODY CHECKED, and the reason has
 * to survive being read by the next person — "looks fine" is not an entry.
 */
const ACCEPTED: Readonly<Record<string, string>> = {
  'capital:MN':
    'Ulaanbaatar is the modern standard romanisation and what Mongolia uses; the reference ' +
    'carries the older Russian-derived "Ulan Bator". The pack cites Wikipedia and is right. ' +
    '(Its Swedish value IS "Ulan Bator", which is the conventional Swedish form.)',
  'capital:US':
    'Punctuation. "Washington, D.C." against "Washington D.C." — both name the same city.',
  'currency:US':
    'The pack stores a readable name, "US dollar"; the reference stores the ISO code and a ' +
    'formal name. A question asking a ten-year-old for "USD" would be a different question.',
  'callingCode:US':
    'The pack cites ITU-T E.164, which defines +1 as the country calling code. The ' +
    "reference's `idd.suffixes` are NANP AREA codes — a different concept, and the pack " +
    'has the more authoritative source of the two.',
  'callingCode:CA': 'Same as US: +1 is the E.164 country code, not an area code.',
  'language:AT':
    'Austria\'s official language is German. The reference labels it "Austro-Bavarian ' +
    'German", which is a dialect grouping rather than the official language, and the pack ' +
    'cites ISO 639-1.',
}

type Fact = {
  readonly id: string
  readonly entity: string
  readonly value: Record<string, unknown>
}

const items = <T>(file: string): readonly T[] =>
  (JSON.parse(readFileSync(join(PACK, file), 'utf8')) as { items: readonly T[] }).items

/** The English value, which is the one the reference can be compared against. */
const en = (value: Record<string, unknown>): string => {
  const names = value['names'] as Record<string, string> | undefined
  return names?.['en'] ?? JSON.stringify(value)
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/[’']/g, "'")

type Finding = { readonly key: string; readonly ours: string; readonly theirs: string }
const findings: Finding[] = []
let checked = 0

const check = (
  attribute: string,
  entity: string,
  ours: string,
  theirs: readonly string[],
): void => {
  checked++
  if (theirs.some((t) => norm(t) === norm(ours))) return
  findings.push({ key: `${attribute}:${entity}`, ours, theirs: JSON.stringify(theirs.slice(0, 4)) })
}

for (const fact of items<Fact>('facts.capitals.v1.json')) {
  const ref = byCode.get(fact.entity)
  if (ref !== undefined) check('capital', fact.entity, en(fact.value), ref.capital ?? [])
}

for (const fact of items<Fact>('facts.currencies.v1.json')) {
  const ref = byCode.get(fact.entity)
  if (ref === undefined) continue
  const currencies = ref.currencies ?? {}
  check('currency', fact.entity, en(fact.value), [
    ...Object.keys(currencies),
    ...Object.values(currencies).map((c) => c.name ?? ''),
  ])
}

for (const fact of items<Fact>('facts.calling-codes.v1.json')) {
  const ref = byCode.get(fact.entity)
  if (ref === undefined) continue
  const root = ref.idd?.root ?? ''
  check(
    'callingCode',
    fact.entity,
    en(fact.value).replace(/\s/g, ''),
    (ref.idd?.suffixes ?? []).map((s) => `${root}${s}`),
  )
}

for (const fact of items<Fact>('facts.languages.v1.json')) {
  const ref = byCode.get(fact.entity)
  if (ref !== undefined) {
    check('language', fact.entity, en(fact.value), Object.values(ref.languages ?? {}))
  }
}

/**
 * Region and the country's own English name, from the entity file.
 *
 * The name is a fact the app renders on every screen and asks about directly, so it is
 * worth the same scrutiny as a capital. `NA` and `SA` both map to the reference's
 * "Americas" — the pack splits a continent the reference does not.
 */
const REGION: Readonly<Record<string, string>> = {
  EU: 'Europe',
  AS: 'Asia',
  AF: 'Africa',
  NA: 'Americas',
  SA: 'Americas',
  OC: 'Oceania',
  AN: 'Antarctic',
}

type Entity = {
  readonly id: string
  readonly region?: string
  readonly names?: Record<string, string>
}

for (const entity of items<Entity>('entities.countries.v1.json')) {
  const ref = byCode.get(entity.id)
  if (ref === undefined) continue
  const expected = REGION[entity.region ?? '']
  if (expected !== undefined) check('region', entity.id, expected, [ref.region ?? ''])
  const ours = entity.names?.['en']
  if (ours !== undefined) check('name', entity.id, ours, [ref.name.common])
}

// ── report ────────────────────────────────────────────────────────────────────
const fresh = findings.filter((f) => ACCEPTED[f.key] === undefined)
const stale = Object.keys(ACCEPTED).filter((key) => !findings.some((f) => f.key === key))

console.log(`\nContent cross-check — world-countries@5.1.0\n`)
console.log(`  values checked        ${checked}`)
console.log(`  known differences     ${findings.length - fresh.length} of ${Object.keys(ACCEPTED).length} recorded`)

for (const f of fresh) {
  console.log(`\n  ✗ ${f.key}\n      ours ${JSON.stringify(f.ours)}\n      ref  ${f.theirs}`)
}

for (const key of stale) {
  console.log(`\n  ! ${key} is recorded as a known difference and no longer differs — remove its entry`)
}

if (fresh.length > 0 || stale.length > 0) {
  console.error(
    `\n✗ ${fresh.length} unexplained difference(s), ${stale.length} stale allowance(s).\n` +
      `  A difference is not automatically a bug — the reference is looser than ITU-T or ISO in\n` +
      `  places, and on two of the recorded six the pack is the better-sourced side. Check the\n` +
      `  fact's own source, then either fix the pack or add an entry to ACCEPTED with the reason.\n` +
      `  Never edit a fact to match the reference without reading both sources.\n`,
  )
  process.exit(1)
}

console.log(`\n✓ every checked value agrees with an independent dataset, or has a recorded reason\n`)
