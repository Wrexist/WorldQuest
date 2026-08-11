#!/usr/bin/env node
/**
 * Two more things to know about every country: what they speak, and what you dial.
 *
 * ## Why a generator and not a hand-written pack
 *
 * The same reason `build-locations.cjs` and `build-flags.cjs` are generators. A hundred
 * and eleven facts typed by hand is a hundred and eleven chances to be wrong about
 * somebody's country, and "a wrong fact in a learning app is the worst possible bug"
 * (CLAUDE.md). These come out of `countries-list` — MIT, ISO 3166-1 alpha-2 keyed, ISO
 * 639-1 languages, E.164 calling codes — so the data has one provenance and one place to
 * be corrected.
 *
 * Language NAMES come from CLDR through `Intl.DisplayNames` rather than from the dataset,
 * which carries English and the endonym only. Swedish needed a third spelling and the
 * alternative was translating forty-six language names by hand, which is exactly the
 * inventing this repo forbids. Node ships full ICU; the strings are baked into the pack
 * at build time, so nothing at runtime depends on the device having it.
 *
 * ## The questions this deliberately does NOT generate
 *
 * **Countries with more than one principal language.** Belgium speaks Dutch, French and
 * German, and a four-option question with three right answers is not a hard question, it
 * is a broken one. The engine's `isAmbiguous` only guards reverse questions, so this is
 * the layer that has to care. Forty-six of the sixty-five qualify.
 *
 * **Countries whose name gives the language away.** "What language do they speak in
 * Sweden?" is answered by anybody who can read, in English and in Swedish both, and the
 * same is true of France, Germany, Japan, Italy, Poland and a dozen more. `isSelfAnswering`
 * does not catch these: it matches whole words, and *Sverige* / *svenska* share a stem
 * rather than a word. Filtering them here is what makes the attribute worth having —
 * what is left is Austria, Brazil, Mexico, Egypt, Switzerland, the questions where
 * knowing the answer means knowing something.
 *
 * That filter runs in BOTH shipped locales and drops the fact if either one gives it
 * away. A question that is fair in Swedish and free in English is not a fair question;
 * it is a question that quietly measures which language you are reading it in.
 *
 * Calling codes have no such problem — no country's name contains its dialling code —
 * so all sixty-five ship.
 */

const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { countries } = require('countries-list')

const PACKS = join(__dirname, '..', 'packages', 'content', 'packs', 'geography')
const ENTITIES = join(PACKS, 'entities.countries.v1.json')

/**
 * The date the generated values were last checked against the dataset.
 *
 * Hand-bumped rather than `new Date()`, deliberately. `verifiedAt` is a claim that a
 * human looked, and a build stamping today's date on every run turns that claim into a
 * timestamp of the last time anybody ran a script — which is worse than no claim at all
 * because it looks like one.
 */
const VERIFIED_AT = '2026-08-10'

/**
 * Where each attribute's numbers actually come from, named per attribute.
 *
 * The dataset is the immediate source and the standard behind it is the real one, so
 * both are stated. A reader checking a disputed calling code needs E.164, not a
 * node_modules path.
 */
const SOURCES = {
  language: {
    // "Principal language", not "official language". The dataset's `languages` field is
    // a list of ISO 639-1 codes in principal-first order, and several countries in it
    // have no official language in law at all — the United States and Australia both
    // have English by universal use rather than by statute. Calling the first code
    // "the official language" would state a legal fact this pack cannot support, which
    // in a learning app is the expensive kind of wrong. The prompt users read has
    // always said "what language do people speak", and this now says the same thing.
    name:
      'countries-list v3.4.1 (MIT), ISO 639-1 principal language (first listed, ' +
      'de jure or de facto); language names from CLDR via Intl.DisplayNames',
    url: 'https://github.com/annexare/Countries',
    verifiedAt: VERIFIED_AT,
  },
  'calling-code': {
    name: 'countries-list v3.4.1 (MIT), ITU-T Recommendation E.164 country calling code',
    url: 'https://www.itu.int/rec/T-REC-E.164/en',
    verifiedAt: VERIFIED_AT,
  },
}

/**
 * The packs whose hand-authored difficulties say how well known a country is.
 *
 * Same list and same reasoning as `build-locations.cjs`: a country somebody judged easy
 * for its capital is an easy country, and its language should not arrive rated 3 because
 * a generator had no opinion. Copied rather than shared because the two scripts run
 * independently and a shared module between build scripts is a dependency neither needs.
 */
const FAMILIARITY = ['facts.capitals.v1.json', 'facts.flags.v1.json', 'facts.currencies.v1.json']

const entities = JSON.parse(readFileSync(ENTITIES, 'utf8')).items

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
 * ordinals invents values between the ones anybody actually judged.
 */
const difficultyFor = (id) => {
  const ds = (known[id] ?? []).slice().sort((a, b) => a - b)
  if (ds.length === 0) return 3
  return ds[Math.floor(ds.length / 2)]
}

const LOCALES = ['en', 'sv']
const languageName = Object.fromEntries(
  LOCALES.map((l) => [l, new Intl.DisplayNames([l], { type: 'language' })]),
)

/**
 * Whether a country's name hands over its language.
 *
 * A shared four-character opening, case- and accent-folded. Crude on purpose: the thing
 * being detected is a shared stem, the two words are always adjacent in the same
 * sentence, and a rule with an exception list is a rule somebody has to maintain against
 * a dataset that changes. Four characters catches Sweden/Swedish, Sverige/svenska,
 * France/French, Frankrike/franska, Poland/Polish and Japan/japanska, and leaves
 * Austria/German and Brazil/Portuguese alone, which is exactly the split wanted.
 *
 * It over-rejects rather than under-rejects — Chile/Chilean-Spanish-shaped near misses
 * lose a fact they could have kept. That is the correct direction: a fact dropped is a
 * question nobody sees, and a giveaway kept is a question that teaches nothing while
 * telling the user they knew it.
 */
const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const givesItAway = (countryName, langName) => {
  const a = fold(countryName)
  const b = fold(langName)
  return a.slice(0, 4) === b.slice(0, 4)
}

const languageFacts = []
const callingFacts = []
const skipped = { multilingual: [], selfAnswering: [], unknownLanguage: [] }

for (const entity of [...entities].sort((a, b) => a.id.localeCompare(b.id))) {
  const row = countries[entity.id]
  if (row === undefined) {
    console.error(`✗ ${entity.id} is in the entity pack and not in countries-list`)
    process.exit(1)
  }

  // ---- calling code -------------------------------------------------------------
  // `phone` is an array because a handful of territories share or carry several. Only
  // the unambiguous ones become a question, for the same reason multilingual countries
  // do not: four options with two right answers is not a question.
  if (row.phone.length === 1) {
    const dial = `+${row.phone[0]}`
    callingFacts.push({
      id: `geo.${entity.id}.calling-code`,
      entity: entity.id,
      attribute: 'calling-code',
      value: {
        id: `dial-${row.phone[0]}`,
        // The same string in both locales, and that is not laziness: a dialling code is
        // digits and a plus sign, and "translating" it would mean inventing a second
        // spelling for a number that has one.
        names: Object.fromEntries(LOCALES.map((l) => [l, dial])),
      },
      difficulty: difficultyFor(entity.id),
      tags: ['calling-code', entity.region, 'core'],
      source: SOURCES['calling-code'],
      volatility: 'stable',
    })
  }

  // ---- language -----------------------------------------------------------------
  if (row.languages.length !== 1) {
    skipped.multilingual.push(entity.id)
    continue
  }

  const code = row.languages[0]
  const names = {}
  let resolved = true
  for (const locale of LOCALES) {
    const name = languageName[locale].of(code)
    // `Intl.DisplayNames` returns the CODE back when CLDR has no name for it, which
    // would ship "mis" as an answer option in front of a child.
    if (name === undefined || name === code) resolved = false
    else names[locale] = name
  }
  if (!resolved) {
    skipped.unknownLanguage.push(`${entity.id}:${code}`)
    continue
  }

  const away = LOCALES.some((l) => givesItAway(entity.names[l] ?? entity.names['en'], names[l]))
  if (away) {
    skipped.selfAnswering.push(entity.id)
    continue
  }

  languageFacts.push({
    id: `geo.${entity.id}.language`,
    entity: entity.id,
    attribute: 'language',
    value: { id: `lang-${code}`, names },
    difficulty: difficultyFor(entity.id),
    tags: ['language', entity.region, `lang:${code}`, 'core'],
    source: SOURCES.language,
    // `slow`, like a currency and unlike a flag. Which language a country's people
    // principally speak shifts with migration and with the odd act of parliament — not
    // fast, but not never — so a two-year re-verification window is the wrong promise
    // to make about this column.
    volatility: 'slow',
  })
}

const pack = (packId, items, extra = {}) => ({
  $schema: '../../schema/pack.schema.json',
  packId,
  version: '1.0.0',
  subject: 'geography',
  kind: 'facts',
  locales: LOCALES,
  license: 'CC-BY-4.0',
  generatedAt: VERIFIED_AT,
  ...extra,
  items,
})

writeFileSync(
  join(PACKS, 'facts.languages.v1.json'),
  `${JSON.stringify(pack('geography.facts.languages', languageFacts), null, 2)}\n`,
)
writeFileSync(
  join(PACKS, 'facts.calling-codes.v1.json'),
  `${JSON.stringify(
    pack('geography.facts.calling-codes', callingFacts, {
      /**
       * Yes, all sixty-five really are stable, and somebody looked.
       *
       * `validate.ts` warns when a pack's volatility column is uniform, because a field
       * that is the same on every row is usually one nobody graded. This one is graded:
       * an E.164 country code is assigned by the ITU and outlives governments — the
       * recent ones exist because a NEW COUNTRY appeared, which arrives here as a new
       * entity rather than as a changed value on an old one.
       */
      volatilityReviewed: true,
    }),
    null,
    2,
  )}\n`,
)

console.log(`\nCountry facts from countries-list\n`)
console.log(`  languages      ${String(languageFacts.length).padStart(3)} facts`)
console.log(`  calling codes  ${String(callingFacts.length).padStart(3)} facts`)
console.log(`\n  not asked, and why:`)
console.log(`    ${String(skipped.multilingual.length).padStart(3)} more than one language listed`)
console.log(`    ${String(skipped.selfAnswering.length).padStart(3)} the country's name gives the language away`)
if (skipped.unknownLanguage.length > 0) {
  console.log(`    ${String(skipped.unknownLanguage.length).padStart(3)} no CLDR name: ${skipped.unknownLanguage.join(', ')}`)
}
console.log(`\n✓ wrote facts.languages.v1.json and facts.calling-codes.v1.json\n`)
