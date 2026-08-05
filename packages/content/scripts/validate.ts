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

/**
 * Warn this far before the error. A fact that fails CI on a Tuesday morning blocks
 * whoever happens to be pushing; a fact that has been warning for two months is a
 * scheduled piece of work. Same numbers, radically different experience of them.
 */
const STALE_WARNING_FRACTION = 0.75

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

/**
 * entity → region, read up front so the difficulty report below can group by it.
 *
 * Cheap and worth it: `difficulty` is authored by hand, once, by one person, and applies
 * to every user on earth. Nothing has ever measured whether it says more about the facts
 * or about whoever wrote it.
 */
const entityRegion = new Map<string, string>()
for (const file of packFiles) {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { items?: { id?: string; type?: string; region?: string }[] }
  for (const item of parsed.items ?? []) {
    if (item.type === 'country' && item.id && item.region) entityRegion.set(item.id, item.region)
  }
}
const seenIds = new Map<string, string>()
/** Every volatility tag seen per pack — see the uniformity check below the loop. */
const volatilityByPack = new Map<string, string[]>()
/** Packs that have declared their uniform volatility deliberate. */
const reviewedVolatility = new Set<string>()
/** Authored difficulty per `pack → region` — see the bias report below the loop. */
const difficultyByRegion = new Map<string, Map<string, number[]>>()
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
  if (pack.volatilityReviewed === true) reviewedVolatility.add(rel)

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

    if (typeof item.difficulty === 'number') {
      const region = entityRegion.get(item.entity)
      if (region) {
        // Per PACK, not pooled. Pooling averages a skewed pack against an even one and
        // reports a smaller number than either — the wrong direction for a bias check,
        // and it took the real 1.9 in the capitals pack down to 1.4 across all four.
        const perRegion = difficultyByRegion.get(rel) ?? new Map<string, number[]>()
        perRegion.set(region, [...(perRegion.get(region) ?? []), item.difficulty as number])
        difficultyByRegion.set(rel, perRegion)
      }
    }

    // 3. Sourcing and freshness.
    const verifiedAt = item.source?.verifiedAt
    if (!item.source?.url) {
      warnings.push({ file: rel, message: `${item.id}: source has no URL` })
    }
    // A fact whose source is another file in this repository has no external provenance
    // at all — the citation is circular and answers nothing a reader could check. The
    // locations pack cited `entities.countries.v1.json` on GitHub for all 65 of its
    // facts, via a `blob/main` link into a private repo that 404s for everybody.
    if (typeof item.source?.url === 'string' && /github\.com\/[Ww]rexist\/[Ww]orld[Qq]uest/.test(item.source.url)) {
      errors.push({
        file: rel,
        message:
          `${item.id}: source points back into this repository — a fact whose source is ` +
          `our own file has no provenance. Cite what the value actually came from.`,
      })
    }
    if (verifiedAt) {
      const ageDays = (TODAY.getTime() - new Date(verifiedAt).getTime()) / 86_400_000
      const limit = MAX_AGE_DAYS[item.volatility as keyof typeof MAX_AGE_DAYS] ?? 365
      if (item.volatility !== 'fast' && ageDays > limit) {
        errors.push({
          file: rel,
          message: `${item.id}: verifiedAt is ${Math.round(ageDays)} days old (${item.volatility} limit is ${limit})`,
        })
      } else if (item.volatility !== 'fast' && ageDays > limit * STALE_WARNING_FRACTION) {
        warnings.push({
          file: rel,
          message:
            `${item.id}: verifiedAt is ${Math.round(ageDays)} days old and expires at ` +
            `${limit} — re-verify before it fails`,
        })
      }
    }

    // Every capital carried `volatility: "stable"`, all 65 of them, which is what turns
    // this whole freshness mechanism off: `stable` is a two-year window, so a pack
    // verified once is unchallenged until 2028. Two of those countries are actively
    // relocating their seat of government — Indonesia to Nusantara by law since 2022,
    // Egypt to the New Administrative Capital — and both read `stable`.
    //
    // A tag that is the same on every row is not a classification, and there is no
    // mechanical test for "is this one really stable?". So the check is comparative: a
    // pack where EVERY fact claims the longest window is a pack nobody graded, and that
    // is visible without knowing any geography.
    if (item.volatility !== undefined) volatilityByPack.set(rel, [
      ...(volatilityByPack.get(rel) ?? []),
      item.volatility as string,
    ])

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

// ── 9. An achievement must be achievable ────────────────────────────────────
//
// Seven of the twelve shipped achievements had tiers nobody could ever reach.
// `ach.flags.collector` asked for 100 and then 195 flags against a pack holding 65.
// `ach.capitals.collector`, the same, against 64 quizzable capitals.
// `ach.countries.complete` wanted 75 and 195 of 65 countries.
// `ach.explorer.continents` wanted 7 regions from a pack that defines 6.
//
// `showProgress: true` made it worse than dead weight: the screen drew a bar creeping
// towards a number that does not exist, for ever. In a product whose rules forbid dark
// patterns and shame copy, a permanently unreachable goal with a visible progress bar is
// exactly the mechanic being forbidden.
//
// So the ceiling is declared in the pack — `"ceiling": { "of": "facts", "attribute":
// "flag" }` — and counted here from the packs themselves. Both directions are checked,
// and the second one is the half that keeps working:
//
//   · a threshold ABOVE the ceiling is unreachable, which is the bug above;
//   · a TOP tier BELOW the ceiling means the pack grew and the achievement did not, so
//     "collect them all" quietly became "collect two thirds of them".
//
// An achievement with no `ceiling` is unbounded by construction — lessons completed,
// days of streak — and is skipped rather than guessed at.
{
  type PackItem = {
    id?: string
    type?: string
    attribute?: string
    entity?: string
    region?: string
    quizzable?: boolean
    volatility?: string
    sensitivity?: string
    ceiling?: { of?: string; attribute?: string }
    rule?: { type?: string; members?: string[]; distinctBy?: string }
    tiers?: { tier: string; threshold: number }[]
  }
  type LoadedPack = { kind?: string; items?: PackItem[] }

  const quizzable = (item: PackItem): boolean =>
    item.quizzable !== false && item.volatility !== 'fast' && item.sensitivity !== 'review-required'

  const allItems = packFiles.map((file) => ({
    rel: relative(repoRoot, file),
    pack: stripComments(JSON.parse(readFileSync(file, 'utf8'))) as LoadedPack,
  }))
  const facts = allItems.flatMap((p) => (p.pack.items ?? []).filter((i) => i.attribute && i.entity))
  const entities = allItems.flatMap((p) => (p.pack.items ?? []).filter((i) => i.type === 'country'))

  const ceilingOf = (spec: NonNullable<PackItem['ceiling']>): number | null => {
    switch (spec.of) {
      case 'facts':
        return facts.filter(
          (f) => quizzable(f) && (!spec.attribute || f.attribute === spec.attribute),
        ).length
      case 'entities':
        return entities.length
      case 'regions':
        return new Set(entities.map((e) => e.region)).size
      default:
        return null
    }
  }

  // ── a set nobody can complete ─────────────────────────────────────────────
  //
  // `set-completion` rules name their members explicitly, and nothing checked that the
  // members exist. `ach.set.nordics` asks for SE, NO, DK, FI and **IS** — and Iceland is
  // not in the pack, so its single gold tier was unreachable by one country, invisibly,
  // in a way the ceiling check above cannot see because a set has no ceiling to declare.
  // `ach.explorer.continents` listed 'AN' for the same reason: a plausible member of a
  // set the content does not contain.
  //
  // A phantom member is worse than a threshold that is too high. A high threshold at
  // least looks ambitious; a member list reads as a decision about which countries count.
  const entityIds = new Set(entities.map((e) => e.id).filter(Boolean))
  const regionIds = new Set(entities.map((e) => e.region).filter(Boolean))

  for (const { rel, pack } of allItems) {
    if (pack.kind !== 'achievements') continue
    for (const item of pack.items ?? []) {
      const members = item.rule?.type === 'set-completion' ? (item.rule.members ?? []) : []
      for (const member of members) {
        const known =
          item.rule?.distinctBy === 'region' ? regionIds.has(member) : entityIds.has(member)
        if (!known) {
          errors.push({
            file: rel,
            message:
              `${item.id}: set member "${member}" is in no pack — the set cannot be ` +
              `completed, and a phantom member reads as a decision rather than an omission`,
          })
        }
      }

      if (!item.ceiling) continue
      const max = ceilingOf(item.ceiling)
      if (max === null) {
        errors.push({ file: rel, message: `${item.id}: unknown ceiling "of": ${item.ceiling.of}` })
        continue
      }
      const tiers = item.tiers ?? []
      for (const tier of tiers) {
        if (tier.threshold > max) {
          errors.push({
            file: rel,
            message:
              `${item.id}: ${tier.tier} needs ${tier.threshold} but only ${max} exist — ` +
              `an unreachable tier with a progress bar is the dark pattern the rules forbid`,
          })
        }
      }
      const top = tiers[tiers.length - 1]
      if (top && top.threshold < max) {
        errors.push({
          file: rel,
          message:
            `${item.id}: top tier ${top.tier} is ${top.threshold} but ${max} exist — ` +
            `the pack grew and "collect them all" quietly stopped meaning all of them`,
        })
      }
    }
  }
}

// ── 10. A volatility tag that is the same on every row is not a classification ──
//
// All 65 capitals read `stable`, which is a two-year re-verification window — so the
// freshness machinery above could not fire on any of them until 2028, including on the
// two countries actively relocating their seat of government.
//
// There is no mechanical test for "is this one really stable?", so this asks the question
// that IS mechanical: did anybody grade this pack at all? A pack of more than ten facts
// where every single one claims the longest window is a pack where the field was filled
// in once and copied down.
for (const [rel, tags] of volatilityByPack) {
  if (tags.length < 10) continue
  // A pack may say "yes, we looked, and they really are all stable" — a continent does
  // not move, and a national flag changes on a scale of decades. `volatilityReviewed`
  // turns the silence into a claim somebody made, which is the same trade the
  // reachability allowlist and the escape-hatch allowlist both take.
  if (reviewedVolatility.has(rel)) continue
  if (new Set(tags).size === 1 && tags[0] === 'stable') {
    warnings.push({
      file: rel,
      message:
        `all ${tags.length} facts are volatility "stable" — that is a 2-year window on ` +
        `every row, which switches the freshness check off. Grade the ones that move.`,
    })
  }
}

// ── 11. Authored difficulty is a prior, and priors carry the author's horizon ───
//
// The schema already calls `difficulty` an "authored prior" the engine overrides per
// user, which is the right design. What nothing measured is how far the prior starts
// from neutral — and it starts a long way. Across the capitals pack the mean authored
// difficulty runs from 1.8 in Europe to 3.7 in Africa: every Western European capital is
// 1 or 2 and every African one is 3 to 5.
//
// That is a real signal for the learner it was written for — a Swedish twelve-year-old
// genuinely finds Stockholm easier than Gaborone. It is not a fact about the world, and
// it is applied to every user. A child in Accra is told Accra is hard and Stockholm is
// easy, and the item selector orders their new content accordingly.
//
// (Named in prose rather than by its identifier on purpose: `pnpm reachability` greps
// consumer sources for engine export names, and this file is one of its consumers.
// Writing the symbol here makes the selector look "wired up" from a comment — the
// crude-question failure mode that script documents in its own header.)
//
// The real fix is empirical and needs data the product does not have yet: `review_log`
// records every answer, so after enough reviews the prior can be replaced by observed
// p(correct) per cohort — the same threshold `fsrs.ts` already names for re-fitting its
// weights. Until then the least this can do is stop the bias being invisible. It is a
// warning with a number in it, printed on every run, so it is a thing somebody decided
// to live with rather than a thing nobody knew.
for (const [rel, perRegion] of difficultyByRegion) {
  const means = [...perRegion.entries()]
    .filter(([, ds]) => ds.length >= 4)
    .map(([region, ds]) => ({ region, mean: ds.reduce((a, b) => a + b, 0) / ds.length }))
    .sort((a, b) => a.mean - b.mean)

  const lowest = means[0]
  const highest = means[means.length - 1]
  if (means.length < 3 || !lowest || !highest) continue
  if (highest.mean - lowest.mean > 1.5) {
    warnings.push({
      file: rel,
      message:
        `authored difficulty runs ${lowest.mean.toFixed(1)} (${lowest.region}) to ` +
        `${highest.mean.toFixed(1)} (${highest.region}) — a prior written from one ` +
        `learner's horizon and applied to every user on earth. Not a bug to fix by ` +
        `hand; see docs/systems/content-pipeline.md on replacing it with observed ` +
        `p(correct) from review_log.`,
    })
  }
}

// ── 12. A region tag must agree with the region fact ────────────────────────
//
// Facts carry subregion tags — `southern-africa`, `east-asia` — and templates select on
// them, so a wrong one puts a country in the wrong lesson and, worse, makes it a
// plausible distractor for the region it is not in. That is the wrong-fact bug this
// repo treats as the most serious kind it can ship.
//
// The truth already exists: `geo.<CC>.location` is the region fact, generated from the
// entity pack. A tag on any OTHER fact for the same entity that names a different
// subregion is a second, hand-maintained copy of that answer, and hand-maintained
// copies disagree. `geo.ZW.currency` was tagged `eastern-africa` against a location
// fact of `southern-africa` — one row out of hundreds, which is exactly the kind of
// thing review finds by luck and a script finds every time.
{
  type Tagged = { id?: string; entity?: string; attribute?: string; tags?: string[]; value?: unknown }
  type TaggedPack = { items?: Tagged[] }

  const loaded = packFiles.map((file) => ({
    rel: relative(repoRoot, file),
    pack: stripComments(JSON.parse(readFileSync(file, 'utf8'))) as TaggedPack,
  }))

  // The region fact's own value, by entity.
  //
  // Keyed on `value.id`, which is the tag vocabulary. The display name is NOT: the
  // region whose id is `eastern-africa` is called "East Africa" in English, so slugging
  // the name yields `east-africa` and matches no tag anywhere. Writing this check the
  // wrong way round first is how that was found — it went green against a file with the
  // bug still in it, which is the failure mode every validator has to be tested against.
  const regionOf = new Map<string, string>()
  for (const { pack } of loaded) {
    for (const item of pack.items ?? []) {
      if (item.attribute !== 'location' || !item.entity) continue
      const value = item.value as { id?: string } | undefined
      if (value?.id) regionOf.set(item.entity, value.id)
    }
  }
  const subregions = new Set(regionOf.values())

  for (const { rel, pack } of loaded) {
    for (const item of pack.items ?? []) {
      if (!item.entity || item.attribute === 'location') continue
      const expected = regionOf.get(item.entity)
      if (!expected) continue
      const named = (item.tags ?? []).filter((tag) => subregions.has(tag))
      const wrong = named.filter((tag) => tag !== expected)
      if (wrong.length > 0) {
        errors.push({
          file: rel,
          message:
            `${item.id}: tagged ${wrong.join(', ')} but geo.${item.entity}.location says ` +
            `${expected} — a region tag is a copy of the region fact, and this copy disagrees`,
        })
      }
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
