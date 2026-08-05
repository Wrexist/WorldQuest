/**
 * Generate the location facts from the entity pack.
 *
 * ## Why this is generated rather than authored
 *
 * Every country already declares a `subregion` in `entities.countries.v1.json`. The
 * location fact restates it so the composer can quiz it — and if the two could ever
 * disagree, one of them would be a wrong fact that is quietly wrong on exactly one
 * screen. Hand-editing sixty-five rows is how that happens. Deriving them means it
 * cannot.
 *
 * This invents no geography. It is a projection of data the pack already holds, in the
 * shape the fact schema wants.
 *
 * ## What it unlocks
 *
 * `tpl.country-to-map.mc4` — "Which country is this?" over the locator map — and its
 * screen-reader-safe sibling `tpl.location-of.mc4`, "Where in the world is Sweden?".
 * Both hang on this attribute, so 65 entities become 130 new quizzable items without a
 * single new fact being researched. Against a content backlog of 193 facts versus a
 * ~600 target, that is the cheapest real progress available.
 *
 * ## The grouping is ours, and the source field says so
 *
 * UN M49 places Cuba and Mexico in "Latin America and the Caribbean"; this pack groups
 * them under North America, which is true continentally and is what a ten-year-old is
 * taught. Citing M49 as the source would therefore be a false citation, and this repo
 * treats a wrong fact as unshippable.
 *
 * The first answer to that was to point `source.url` at this repo's own entities pack on
 * GitHub — which is worse, in two ways. A fact whose source is another file in the same
 * repository has no external provenance at all; the citation is circular and answers
 * nothing a reader could check. And the URL was a `blob/main` link into a private
 * repository, so it 404s for everyone outside the org, including the org.
 *
 * So the source now says what it actually is: OUR classification, on a continental model
 * somebody else defines. The name carries the editorial claim and the URL carries the
 * external basis for the continent boundaries we group by. `content:validate` refuses a
 * source URL pointing back into this repository, so the circular version cannot return.
 *
 * Run: pnpm build:locations
 */

const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const PACKS = join(process.cwd(), 'packages', 'content', 'packs', 'geography')
const ENTITIES = join(PACKS, 'entities.countries.v1.json')
const OUT = join(PACKS, 'facts.locations.v1.json')

/**
 * The packs that already encode how familiar each country is.
 *
 * Difficulty is derived from these rather than set to a constant, and that is not a
 * nicety — it is the difference between these facts being reachable and drowning
 * everything else. `composeLesson` sorts a new user's facts EASIEST FIRST, so 65 facts
 * all at difficulty 1 sit at the head of that list and a first lesson becomes 74 %
 * "where in the world is X?". Every other attribute spreads across 1–5; a flat block
 * is the same starvation bug compose.ts already documents, pointed the other way.
 *
 * Familiarity is a property of the COUNTRY, not of the attribute — someone who finds
 * Kyrgyzstan's capital hard finds its location hard too — so the honest number is what
 * the existing facts already say about that country rather than a fresh guess from me.
 */
const FAMILIARITY = ['facts.capitals.v1.json', 'facts.flags.v1.json', 'facts.currencies.v1.json']

/**
 * Display names per subregion key, en + sv.
 *
 * In the PACK rather than in i18n, because a fact value is content: `packages/i18n`
 * holds the app's chrome, and a fact's answer is translated where the fact lives. Same
 * rule as a country name.
 */
const SUBREGIONS = {
  'east-asia': { en: 'East Asia', sv: 'Östasien' },
  'eastern-africa': { en: 'East Africa', sv: 'Östafrika' },
  'eastern-europe': { en: 'Eastern Europe', sv: 'Östeuropa' },
  'north-america': { en: 'North America', sv: 'Nordamerika' },
  'northern-africa': { en: 'North Africa', sv: 'Nordafrika' },
  'northern-europe': { en: 'Northern Europe', sv: 'Nordeuropa' },
  oceania: { en: 'Oceania', sv: 'Oceanien' },
  'south-america': { en: 'South America', sv: 'Sydamerika' },
  'south-asia': { en: 'South Asia', sv: 'Sydasien' },
  'south-east-asia': { en: 'South-East Asia', sv: 'Sydostasien' },
  'southern-africa': { en: 'Southern Africa', sv: 'Södra Afrika' },
  'southern-europe': { en: 'Southern Europe', sv: 'Sydeuropa' },
  'western-africa': { en: 'West Africa', sv: 'Västafrika' },
  'western-europe': { en: 'Western Europe', sv: 'Västeuropa' },
}

/** Four options need four members. A thinner subregion cannot fill a question. */
const MIN_MEMBERS = 4

const entities = JSON.parse(readFileSync(ENTITIES, 'utf8')).items

/** entity → the difficulties its other facts already carry. */
const known = {}
for (const file of FAMILIARITY) {
  for (const f of JSON.parse(readFileSync(join(PACKS, file), 'utf8')).items) {
    ;(known[f.entity] ??= []).push(f.difficulty)
  }
}

/**
 * The median of what this country's other facts say, and 3 when it has none.
 *
 * Median rather than mean: difficulty is an ordinal 1–5 authored by hand, and averaging
 * ordinals invents values between the ones anybody actually judged. 3 is the schema's
 * midpoint and the honest answer for a country nothing else has an opinion about.
 */
const difficultyFor = (id) => {
  const ds = (known[id] ?? []).slice().sort((a, b) => a - b)
  if (ds.length === 0) return 3
  return ds[Math.floor(ds.length / 2)]
}

// A subregion with no display name would ship a raw key like "south-east-asia" as an
// answer option. Loudly, rather than as a slug in front of a child.
const unnamed = [...new Set(entities.map((e) => e.subregion))].filter((s) => !(s in SUBREGIONS))
if (unnamed.length > 0) {
  console.error(
    `✗ no display name for: ${unnamed.join(', ')}\n` +
      '  Add them to SUBREGIONS above, in en AND sv. A missing name ships the key.',
  )
  process.exit(1)
}

const counts = {}
for (const e of entities) counts[e.subregion] = (counts[e.subregion] ?? 0) + 1

const items = [...entities]
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((e) => ({
    id: `geo.${e.id}.location`,
    entity: e.id,
    attribute: 'location',
    value: { id: e.subregion, names: SUBREGIONS[e.subregion] },
    difficulty: difficultyFor(e.id),
    tags: ['location', e.subregion, 'core'],
    source: {
      name:
        'WorldQuest editorial classification, on the seven-continent model ' +
        '(deliberately NOT UN M49 — see the note at the top of build-locations.cjs)',
      url: 'https://www.britannica.com/science/continent',
      verifiedAt: '2026-08-05',
    },
    volatility: 'stable',
  }))

writeFileSync(
  OUT,
  JSON.stringify(
    {
      $schema: '../../schema/pack.schema.json',
      $comment:
        'Where each country is, as a fact rather than a field. Derived MECHANICALLY from ' +
        '`subregion` in entities.countries.v1.json — this file invents no geography, it ' +
        'restates what the entity pack already declares so the composer can quiz it. ' +
        'Regenerate with `pnpm build:locations` whenever a country is added; hand-editing one ' +
        "row would let a country's location fact disagree with its own entity, which is a " +
        'wrong fact of the worst kind: quietly wrong, and only on one screen. ' +
        "The GROUPING is this app's own, not UN M49 — M49 places Cuba and Mexico in 'Latin " +
        "America and the Caribbean' while this pack groups them under North America, which is " +
        'true continentally and is what a ten-year-old is taught. The source field points at ' +
        'the entities pack rather than at M49 for exactly that reason: citing a standard we ' +
        'have deliberately diverged from would be a false citation.',
      packId: 'geography.locations',
      version: '1.0.0',
      subject: 'geography',
      kind: 'facts',
      locales: ['en', 'sv'],
      license: 'CC-BY-4.0',
      generatedAt: '2026-08-03',
      items,
    },
    null,
    2,
  ) + '\n',
)

const thin = Object.entries(counts).filter(([, n]) => n < MIN_MEMBERS)

console.log(`Locations → ${items.length} facts across ${Object.keys(counts).length} subregions\n`)
for (const [sub, n] of Object.entries(counts).sort()) {
  console.log(`  ${sub.padEnd(18)} ${n}${n < MIN_MEMBERS ? '  ← too thin for a 4-option question' : ''}`)
}
if (thin.length > 0) {
  console.error(
    `\n✗ ${thin.length} subregion(s) have fewer than ${MIN_MEMBERS} members.\n` +
      '  "Where is X?" cannot fill four options from a subregion nobody else is in, and the\n' +
      '  composer would drop those questions silently. Add countries, or the facts are inert.',
  )
  process.exit(1)
}
console.log(`\n✓ wrote ${items.length} location facts`)
