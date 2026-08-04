/**
 * What the content library actually contains, and where the next hour should go.
 *
 * `pnpm content:stats` has been in this package's CLAUDE.md and in package.json since
 * the beginning without existing — the last of the three advertised commands to be
 * written. It is the planning counterpart to the other two: `validate` says whether
 * the content is legal, `preview` says whether it reads well, and this says whether
 * there is enough of it and which gap costs the most.
 *
 * The number that matters is at the bottom. An entity in a subregion with fewer than
 * four members cannot be asked about at all — `buildQuestion` refuses rather than
 * offer an absurd option — so a country added to a lonely subregion contributes
 * nothing until its neighbours arrive. That turns "add 20 countries" into "add these
 * 20 countries", which is a different afternoon.
 *
 * Run: pnpm content:stats [packId | subject]
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildIndex,
  buildQuestion,
  isQuizzable,
  isAmbiguous,
  isSelfAnswering,
  seededRng,
  type Entity,
  type Fact,
  type Template,
} from '@worldquest/engines'
import { SUPPORTED_LOCALES } from '@worldquest/i18n'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packsDir = join(root, 'packs')
const filter = process.argv[2]

type Pack = { packId: string; subject: string; kind: string; items: unknown[] }

const packs: Pack[] = []
for (const subject of readdirSync(packsDir)) {
  for (const file of readdirSync(join(packsDir, subject))) {
    if (!file.endsWith('.json')) continue
    packs.push(JSON.parse(readFileSync(join(packsDir, subject, file), 'utf8')) as Pack)
  }
}

const matching = packs.filter(
  (pack) =>
    filter === undefined || pack.packId.includes(filter) || pack.subject.includes(filter),
)

if (matching.length === 0) {
  console.error(`No pack matches "${filter}". Available:`)
  for (const pack of packs) console.error(`  ${pack.packId}`)
  process.exit(1)
}

const pick = <T>(kind: string): T[] =>
  matching.filter((pack) => pack.kind === kind).flatMap((pack) => pack.items as T[])

const entities = pick<Entity>('entities')
const facts = pick<Fact>('facts')
const templates = pick<Template>('templates')

const index = buildIndex({ entities, facts, templates })

/** Count occurrences, then print biggest-first. Used for every breakdown below. */
function tally<T>(items: readonly T[], key: (item: T) => string | undefined): [string, number][] {
  const counts = new Map<string, number>()
  for (const item of items) {
    const k = key(item) ?? '(unset)'
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

const pad = (value: string, width: number): string => value.padEnd(width)
const bar = (n: number, max: number): string => '█'.repeat(Math.max(1, Math.round((n / max) * 24)))

function section(title: string, rows: [string, number][]): void {
  if (rows.length === 0) return
  console.log(`  ${title}`)
  const width = Math.max(...rows.map(([label]) => label.length))
  const max = Math.max(...rows.map(([, n]) => n))
  for (const [label, n] of rows) {
    console.log(`    ${pad(label, width)}  ${String(n).padStart(4)}  ${bar(n, max)}`)
  }
  console.log()
}

console.log(`\nContent stats\n`)
console.log(`  packs      ${matching.length}`)
console.log(`  entities   ${entities.length}`)
console.log(`  facts      ${facts.length}`)
console.log(`  templates  ${templates.length}`)
console.log(`  items      ${index.items.length}`)

// The leverage ratio, and the whole argument for content-as-data in one number.
// Below ~2 the templates are not earning their complexity; a jump means a template
// landed, not that anyone authored anything.
const perFact = facts.length === 0 ? 0 : index.items.length / facts.length
console.log(`  items/fact ${perFact.toFixed(1)}\n`)

section('entities by region', tally(entities, (e) => e.region))
section('entities by subregion', tally(entities, (e) => e.subregion))
section('facts by attribute', tally(facts, (f) => f.attribute))
section('facts by volatility', tally(facts, (f) => f.volatility))
section('facts by difficulty', tally(facts, (f) => `${f.difficulty}`))
section('items by template', tally(index.items, (i) => i.templateId))

// ── sourcing ───────────────────────────────────────────────────────────────────
//
// Enforced by `pnpm content:validate`, reported here because the aggregate is what
// tells you a re-verification pass is due before any single fact expires.

const sourced = facts.filter((f) => f.source !== undefined)
const dates = sourced
  .map((f) => f.source!.verifiedAt)
  .filter((d) => d.length > 0)
  .sort()

console.log('  sourcing')
console.log(`    with a source     ${sourced.length}/${facts.length}`)
if (dates.length > 0) {
  console.log(`    verified oldest   ${dates[0]}`)
  console.log(`    verified newest   ${dates[dates.length - 1]}`)
}
const unsourced = facts.filter((f) => f.source === undefined)
for (const fact of unsourced) console.log(`    ✗ ${fact.id} has no source`)
console.log()

// ── locale coverage ────────────────────────────────────────────────────────────
//
// A fact missing a value for a shipped locale renders in English inside an otherwise
// Swedish lesson. `nameOf` falls back rather than crashing, which is right at runtime
// and is exactly why nobody notices.

console.log('  locale coverage')
for (const locale of SUPPORTED_LOCALES) {
  const missingEntities = entities.filter((e) => e.names[locale] === undefined)
  const missingFacts = facts.filter(
    (f) => f.value.names !== undefined && f.value.names[locale] === undefined,
  )
  const total = entities.length + facts.length
  const missing = missingEntities.length + missingFacts.length
  const pct = total === 0 ? 100 : Math.round(((total - missing) / total) * 100)
  console.log(`    ${locale}  ${String(pct).padStart(3)}%  ${missing} missing`)
  for (const entity of missingEntities) console.log(`         · entity ${entity.id}`)
  for (const fact of missingFacts) console.log(`         · fact   ${fact.id}`)
}
console.log()

// ── askability ─────────────────────────────────────────────────────────────────
//
// The actionable number. An item the engine will not build is authored content that
// no user can ever see, and the cause is almost always a subregion with too few
// members to draw plausible distractors from.

const rng = seededRng(1)
const blocked = new Map<string, string[]>()
const selfAnswering: string[] = []
const ambiguous: string[] = []
let askable = 0

for (const item of index.items) {
  if (buildQuestion(index, item, 'en', rng) !== null) {
    askable++
    continue
  }
  // Refused by design, not for want of neighbours. Counting it as a coverage gap
  // would send an author off to add countries that cannot possibly help.
  if (isSelfAnswering(index, item, 'en')) {
    selfAnswering.push(item.id)
    continue
  }
  // Shared values — the euro, the CFA franc. Adding countries makes this WORSE, so
  // reporting it as a coverage gap would be advice pointing the wrong way.
  if (isAmbiguous(index, item, 'en')) {
    ambiguous.push(item.id)
    continue
  }
  const entity = index.entities.get(item.entityId)
  const where = entity?.subregion ?? entity?.region ?? '(no subregion)'
  const bucket = blocked.get(where)
  if (bucket) bucket.push(item.id)
  else blocked.set(where, [item.id])
}

const unquizzable = facts.filter((f) => !isQuizzable(f))

console.log('  askability')
console.log(`    askable today     ${askable}/${index.items.length}`)
if (ambiguous.length > 0) {
  console.log(`    many answers      ${ambiguous.length} (skipped by design)`)
}
if (selfAnswering.length > 0) {
  console.log(`    self-answering    ${selfAnswering.length} (skipped by design)`)
  for (const id of selfAnswering) console.log(`         · ${id}`)
}
if (unquizzable.length > 0) {
  // Not a gap to fill: a `fast` or `review-required` fact is deliberately never a
  // quiz answer. It still teaches — it just teaches on a country page.
  console.log(`    not quizzable     ${unquizzable.length} (by design)`)
  for (const fact of unquizzable) console.log(`         · ${fact.id} (${fact.volatility})`)
}
console.log()

if (blocked.size > 0) {
  console.log('  blocked for want of neighbours — add entities here first:')
  const ordered = [...blocked.entries()].sort((a, b) => b[1].length - a[1].length)
  for (const [where, items] of ordered) {
    const members = entities.filter((e) => e.subregion === where).length
    console.log(`    ${where}  — ${members} entit${members === 1 ? 'y' : 'ies'}, ${items.length} item(s) unreachable`)
  }
  console.log()
}

const reachable = index.items.length - selfAnswering.length - ambiguous.length
console.log(
  `  ${askable} of ${reachable} askable questions are reachable by a user today` +
    (selfAnswering.length > 0 ? ` (${selfAnswering.length} more give the answer away).` : '.') +
    '\n',
)
