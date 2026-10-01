#!/usr/bin/env node
/**
 * Add the countries in scripts/data/countries-2026.cjs to the geography packs: the
 * entity, and its capital, currency and flag facts. Idempotent: a country already in the
 * entities pack is left exactly as it is, so re-running after an edit to the data adds
 * nothing twice and never rewrites a sourced fact somebody has since corrected by hand.
 *
 * What it does NOT write, because other generators own it and derive it from the entity:
 * locations (build-locations), languages and calling codes (build-country-facts), flag
 * images (build-flags), maps (build-maps). Run those after this.
 *
 * Names come from CLDR through Intl.DisplayNames, English and Swedish, the same source
 * build-country-facts uses for language names, so nothing is translated by hand except
 * where the data row overrides a CLDR UI form ("Myanmar (Burma)", "St. Kitts & Nevis").
 * Swedish currency names come from CLDR too. `verifiedAt` is the authoring date, set by
 * hand below and never `new Date()` — see VERIFIED_AT in build-country-facts.cjs.
 *
 * Run: node scripts/expand-countries.cjs
 */
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const DATA = require('./data/countries-2026.cjs')

const VERIFIED_AT = '2026-09-29'
const PACKS = join(__dirname, '..', 'packages', 'content', 'packs', 'geography')
const file = (name) => join(PACKS, name)
const read = (name) => JSON.parse(readFileSync(file(name), 'utf8'))
const write = (name, pack) => writeFileSync(file(name), JSON.stringify(pack, null, 2) + '\n')

const regionEn = new Intl.DisplayNames('en', { type: 'region' })
const regionSv = new Intl.DisplayNames('sv', { type: 'region' })
const currencySv = new Intl.DisplayNames('sv', { type: 'currency' })

const CONTINENT_TAG = { EU: 'europe', AS: 'asia', AF: 'africa', NA: 'north-america', SA: 'south-america', OC: 'oceania' }
const wiki = (title) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%2C/g, ',').replace(/%27/g, "'")}`
const bumpMinor = (v) => { const [a, b] = v.split('.').map(Number); return `${a}.${b + 1}.0` }

/** Currency article titles that are not simply the English name. */
const CURRENCY_ARTICLE = {
  USD: 'United States dollar', EUR: 'Euro', GBP: 'Pound sterling', XCD: 'Eastern Caribbean dollar',
  XOF: 'West African CFA franc', XAF: 'Central African CFA franc', AUD: 'Australian dollar', CHF: 'Swiss franc',
  AED: 'United Arab Emirates dirham', KGS: 'Kyrgyzstani som', TMT: 'Turkmenistan manat', STN: 'São Tomé and Príncipe dobra',
  WST: 'Samoan tālā', TOP: 'Tongan paʻanga', BAM: 'Bosnia and Herzegovina convertible mark', ILS: 'Israeli new shekel',
}

const entities = read('entities.countries.v1.json')
const capitals = read('facts.capitals.v1.json')
const currencies = read('facts.currencies.v1.json')
const flags = read('facts.flags.v1.json')

// Shared currencies take the exact wording the pack already uses for them.
const existingCurrency = new Map()
for (const f of currencies.items) {
  const code = { FR: 'EUR', US: 'USD', AU: 'AUD', CH: 'CHF' }[f.entity]
  if (code) existingCurrency.set(code, f.value)
}

const have = new Set(entities.items.map((e) => e.id))
const skipped = []
let added = 0

for (const [id, row] of Object.entries(DATA)) {
  if (have.has(id)) continue
  added += 1
  const nameEn = row.name ?? regionEn.of(id)
  const nameSv = row.sv ?? regionSv.of(id)
  const tagContinent = CONTINENT_TAG[row.r]

  entities.items.push({
    id, type: 'country',
    names: { en: nameEn, sv: nameSv },
    ...(row.inSentence && row.inSentence !== nameEn ? { namesInSentence: { en: row.inSentence } } : {}),
    region: row.r, subregion: row.s,
    assets: {
      flag: { path: `flags/${id}.png`, licenseRef: 'flag-icons' },
      map: { path: `geo/countries/${id}.png`, licenseRef: 'natural-earth-country' },
      mapContext: { path: `geo/context/${id}.png`, licenseRef: 'natural-earth-region' },
    },
  })

  const [capEn, capSv, capDifficulty] = row.cap
  const capTitle = (row.capWiki ?? capEn).replace(/_/g, ' ')
  capitals.items.push({
    ...(row.capReview ? { $comment: `CONTESTED — needs a second author's sign-off before it can be quizzed. ${row.capReview} Resolve it deliberately, per docs/systems/content-pipeline.md#sensitive-content.` } : {}),
    id: `geo.${id}.capital`, entity: id, attribute: 'capital',
    value: { names: { en: capEn, sv: capSv } },
    difficulty: capDifficulty,
    tags: ['capital', tagContinent, row.s, 'core'],
    source: { name: `English Wikipedia, “${capTitle}”`, url: wiki(row.capWiki ?? capEn), verifiedAt: VERIFIED_AT },
    volatility: 'stable',
    ...(row.capReview ? { sensitivity: 'review-required', quizzable: false } : {}),
  })

  if (row.cur) {
    const [code, en, shortEn, shortSv, difficulty] = row.cur
    const shared = existingCurrency.get(code)
    // CLDR still calls the tālā West Samoan, a name the country dropped in 1997.
    const sv = code === 'WST' ? 'samoansk tala' : currencySv.of(code)
    const value = shared ?? {
      names: { en, sv: sv && sv !== code ? sv : en },
      shortNames: { en: shortEn, sv: shortSv },
    }
    const article = CURRENCY_ARTICLE[code] ?? en
    currencies.items.push({
      id: `geo.${id}.currency`, entity: id, attribute: 'currency', value, difficulty,
      tags: ['currency', row.s, 'core'],
      source: { name: `English Wikipedia, “${article}”`, url: wiki(article), verifiedAt: VERIFIED_AT },
      volatility: 'slow',
    })
  } else {
    skipped.push(`${id} currency: ${row.curSkip}`)
  }

  if (row.flagReview) {
    skipped.push(`${id} flag: ${row.flagReview}`)
  } else {
    const [en, sv, like, difficulty] = row.flag
    const subject = row.inSentence ?? nameEn
    const article = `Flag of ${subject}`
    flags.items.push({
      id: `geo.${id}.flag`, entity: id, attribute: 'flag',
      value: { id: `flag-${id}`, names: { en, sv } },
      difficulty,
      tags: ['flag', row.s, ...like, 'core'],
      source: { name: `English Wikipedia, “${article}”`, url: wiki(article), verifiedAt: VERIFIED_AT },
      volatility: 'stable',
    })
  }
}

if (added > 0) {
  for (const pack of [entities, capitals, currencies, flags]) pack.version = bumpMinor(pack.version)
  write('entities.countries.v1.json', entities)
  write('facts.capitals.v1.json', capitals)
  write('facts.currencies.v1.json', currencies)
  write('facts.flags.v1.json', flags)
}
console.log(`added ${added} countries (${entities.items.length} in the pack)`)
for (const line of skipped) console.log(`  not written: ${line}`)
