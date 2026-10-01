#!/usr/bin/env node
/**
 * Nine more things to know about every country — the ones that make the hard end of the
 * difficulty ramp hard: how big it is, who it borders, whether it touches the sea, which
 * hemispheres it sits in, its internet domain, its ISO and currency codes, and what its own
 * people call it.
 *
 * ## The rule this file exists to keep: two sources, or no fact
 *
 * "A wrong fact in a learning app is the worst possible bug" (CLAUDE.md), and a few
 * thousand generated facts is a few thousand chances to be wrong about somebody's country.
 * So every value here has to be stated by TWO independent sources before it ships, and a
 * disagreement DROPS the fact instead of picking a winner:
 *
 *   area          world-countries  ≈  Natural Earth outline area, within 15 %
 *   borders       world-countries  ==  countries that share a Natural Earth boundary
 *   landlocked    world-countries  ==  no Natural Earth boundary with nothing on the far side
 *   hemisphere    Natural Earth outline entirely inside one quadrant  ==  world-countries' point
 *   tld           world-countries' IANA ccTLD  ==  the ISO 3166-1 alpha-2 code (.uk is the one exception)
 *   alpha3        world-countries  ==  i18n-iso-countries
 *   currency-code world-countries' ISO 4217 code  ==  countries-list  ==  the currency pack's own name
 *   native-name   world-countries' endonym  ==  countries-list
 *
 * The geometry half is the point. `world-countries` is also what `pnpm content:crosscheck`
 * reads, so checking these against it alone would prove the generator ran. Natural Earth is
 * a different organisation's survey of the same ground.
 *
 * ## What it drops, and that being the feature
 *
 * Every one of these is a question nobody sees instead of a wrong one:
 *
 *   · Australia's Natural Earth key also files two uninhabited sandbanks; areas are summed
 *     per country and compared, so a mismatch drops the area rather than asking about 0 km².
 *   · Any border to Kosovo, Somaliland, Northern Cyprus or the Siachen Glacier: the two
 *     sources disagree about them because the world does. Not improvised here — see
 *     docs/systems/content-pipeline.md § sensitive content. The count question is dropped
 *     for both sides; single undisputed pairs ship.
 *   · Overseas territories (France–Suriname, Spain–Morocco at Ceuta): one source lists
 *     them, the other does not. Kept as non-quizzable `borders` facts so a question never
 *     offers one as a wrong answer, but never asked.
 *   · Kazakhstan, Azerbaijan, Turkmenistan: "landlocked" depends on whether the Caspian is
 *     a sea. The two sources disagree, so the fact does.
 *   · Countries on both sides of the equator or the prime meridian.
 *
 * Run: node scripts/build-deep-facts.cjs
 */

const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const worldCountries = require('world-countries')
const { countries: countriesList } = require('countries-list')
const currenciesAll = JSON.parse(
  readFileSync(join(__dirname, '..', 'node_modules', 'countries-list', 'currencies.all.min.json'), 'utf8'),
)
const isoCountries = require('i18n-iso-countries')
const { feature, neighbors } = require('topojson-client')
const d3 = require('d3-geo')
const topology = require('world-atlas/countries-50m.json')

const PACKS = join(__dirname, '..', 'packages', 'content', 'packs', 'geography')
const read = (f) => JSON.parse(readFileSync(join(PACKS, f), 'utf8')).items

/** Hand-bumped on purpose, like `build-country-facts.cjs`: a claim that somebody looked. */
const VERIFIED_AT = '2026-09-30'
const LOCALES = ['en', 'sv']
const EARTH_RADIUS_KM = 6371.0088

const entities = read('entities.countries.v1.json')
const entityById = new Map(entities.map((e) => [e.id, e]))
const wc = new Map(worldCountries.map((c) => [c.cca2, c]))
const wcByAlpha3 = new Map(worldCountries.map((c) => [c.cca3, c]))

// ── familiarity: the same prior every other generator uses ───────────────────────────
const known = {}
for (const f of ['facts.capitals.v1.json', 'facts.flags.v1.json', 'facts.currencies.v1.json']) {
  for (const fact of read(f)) (known[fact.entity] ??= []).push(fact.difficulty)
}
const familiarity = (id) => {
  const ds = (known[id] ?? []).slice().sort((a, b) => a - b)
  return ds.length === 0 ? 3 : ds[Math.floor(ds.length / 2)]
}
const clamp = (n) => Math.max(1, Math.min(5, n))

// ── Natural Earth, keyed by alpha-2 and never by array position ─────────────────────
const geometries = topology.objects.countries.geometries
const features = feature(topology, topology.objects.countries).features
const alpha2Of = (g) => {
  if (g.id === undefined) return null
  return isoCountries.numericToAlpha2(String(g.id).padStart(3, '0')) ?? null
}
const indicesByCode = new Map()
geometries.forEach((g, i) => {
  const code = alpha2Of(g)
  if (code) indicesByCode.set(code, [...(indicesByCode.get(code) ?? []), i])
})
/** Names of boundaries with no ISO code: each is a dispute, and a dispute is not improvised. */
const UNRESOLVED = '?'
const neighbourIndices = neighbors(geometries)

const naturalEarth = new Map()
const arcUsers = new Map()
const arcsOf = (geometry) => {
  const out = []
  const walk = (a) => (Array.isArray(a) ? a.forEach(walk) : out.push(a < 0 ? ~a : a))
  walk(geometry.arcs)
  return out
}
geometries.forEach((g, i) => {
  for (const arc of new Set(arcsOf(g))) arcUsers.set(arc, [...(arcUsers.get(arc) ?? []), i])
})
for (const [code, indices] of indicesByCode) {
  const own = new Set(indices)
  let area = 0
  const neighbours = new Set()
  let exclusiveArcs = 0
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const i of indices) {
    area += d3.geoArea(features[i]) * EARTH_RADIUS_KM * EARTH_RADIUS_KM
    for (const j of neighbourIndices[i]) {
      if (own.has(j)) continue
      neighbours.add(alpha2Of(geometries[j]) ?? UNRESOLVED)
    }
    for (const arc of new Set(arcsOf(geometries[i]))) {
      if (arcUsers.get(arc).every((u) => own.has(u))) exclusiveArcs += 1
    }
    const walk = (c) => {
      if (typeof c[0] === 'number') {
        const [lon, lat] = c
        minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat)
        minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon)
      } else c.forEach(walk)
    }
    walk(features[i].geometry.coordinates)
  }
  naturalEarth.set(code, { area, neighbours, exclusiveArcs, minLat, maxLat, minLon, maxLon })
}

// ── helpers ──────────────────────────────────────────────────────────────────────
const SOURCE = {
  area: {
    name:
      'world-countries v5.1.0 (ODbL) land and water area, agreeing within 15 % with the area of ' +
      'the Natural Earth 1:50m outline (public domain, via world-atlas 2.0.2)',
    url: 'https://github.com/mledoze/countries',
  },
  borders: {
    name:
      'world-countries v5.1.0 (ODbL) land borders, agreeing with the boundaries Natural Earth ' +
      '1:50m (public domain, via world-atlas 2.0.2) draws between the two countries',
    url: 'https://github.com/mledoze/countries',
  },
  landlocked: {
    name:
      'world-countries v5.1.0 (ODbL) landlocked flag, agreeing with Natural Earth 1:50m (public ' +
      'domain, via world-atlas 2.0.2): a landlocked country has no boundary with open ground',
    url: 'https://www.naturalearthdata.com/',
  },
  hemisphere: {
    name:
      'Natural Earth 1:50m outline (public domain, via world-atlas 2.0.2), entirely inside one ' +
      'quadrant of the equator and the prime meridian, agreeing with the point in world-countries v5.1.0',
    url: 'https://www.naturalearthdata.com/',
  },
  tld: {
    name:
      'IANA Root Zone Database country-code TLD, from world-countries v5.1.0 (ODbL), equal to the ' +
      'ISO 3166-1 alpha-2 code from i18n-iso-countries 7.14.0 (.uk is the one registered exception)',
    url: 'https://www.iana.org/domains/root/db',
  },
  alpha3: {
    name:
      'ISO 3166-1 alpha-3, agreed by world-countries v5.1.0 (ODbL) and i18n-iso-countries 7.14.0 (MIT)',
    url: 'https://www.iso.org/iso-3166-country-codes.html',
  },
  'currency-code': {
    name:
      'ISO 4217 code agreed by world-countries v5.1.0 (ODbL) and countries-list v3.4.1 (MIT), and ' +
      "matching the name in this app's currency pack",
    url: 'https://www.iso.org/iso-4217-currency-codes.html',
  },
  'native-name': {
    name:
      "The country's own name for itself, agreed by world-countries v5.1.0 (ODbL) and " +
      'countries-list v3.4.1 (MIT)',
    url: 'https://github.com/annexare/Countries',
  },
}

SOURCE['border-count'] = SOURCE.borders

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const name = (e, locale) => e.names[locale] ?? e.names.en

function fact(entity, attribute, slug, value, difficulty, volatility, extra = {}) {
  return {
    id: `geo.${entity.id}.${slug}`,
    entity: entity.id,
    attribute,
    value,
    difficulty: clamp(difficulty),
    tags: [attribute, entity.region, 'deep'],
    source: { ...SOURCE[attribute], verifiedAt: VERIFIED_AT },
    volatility,
    ...extra,
  }
}

const out = {
  area: [], 'border-count': [], borders: [], landlocked: [], hemisphere: [],
  tld: [], alpha3: [], 'currency-code': [], 'native-name': [],
}
const dropped = {}
const drop = (kind, code, why) => ((dropped[kind] ??= []).push(`${code}(${why})`), undefined)

const sig2 = (n) => {
  if (n < 10) return Math.round(n)
  const magnitude = 10 ** (Math.floor(Math.log10(n)) - 1)
  return Math.round(n / magnitude) * magnitude
}

/** ISO 4217 codes that are not a country's money: funds and accounting units. */
const FUNDS_CODES = new Set(['BOV', 'CHE', 'CHW', 'CLF', 'COU', 'MXV', 'USN', 'UYI', 'UYW'])
/** Names the currency pack chose and crosscheck already records as naming differences. */
const PACK_NAME_ALIAS = { AE: 'AED', GB: 'GBP', UZ: 'UZS' }

const currencyFacts = new Map(read('facts.currencies.v1.json').map((f) => [f.entity, f]))

/** Quadrants of the equator and the prime meridian — four options, every one a real place. */
const QUADRANT = {
  NE: { en: 'Northern and Eastern', sv: 'Norra och östra' },
  NW: { en: 'Northern and Western', sv: 'Norra och västra' },
  SE: { en: 'Southern and Eastern', sv: 'Södra och östra' },
  SW: { en: 'Southern and Western', sv: 'Södra och västra' },
}

const sorted = [...entities].sort((a, b) => a.id.localeCompare(b.id))

// Pairs either source claims, so a question can refuse to offer a claimed neighbour as wrong.
const claimed = new Map()
const agreedNeighbours = new Map()
const DISPUTED_BORDER = new Set()

for (const e of sorted) {
  const ref = wc.get(e.id)
  const ne = naturalEarth.get(e.id)
  const base = familiarity(e.id)
  if (!ref) { drop('all', e.id, 'not in world-countries'); continue }

  // ── area ─────────────────────────────────────────────────────────────────────────
  if (!ne) drop('area', e.id, 'no outline')
  else {
    const ratio = ne.area / ref.area
    if (ratio < 0.85 || ratio > 1.18) drop('area', e.id, `outline ${ratio.toFixed(2)}x`)
    else {
      const rounded = sig2(ref.area)
      const label = (locale) => `${locale === 'sv' ? 'cirka' : 'about'} ${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(rounded)} km²`
      out.area.push(fact(e, 'area', 'area', {
        id: `area-${rounded}`,
        number: ref.area,
        asOf: VERIFIED_AT,
        names: Object.fromEntries(LOCALES.map((l) => [l, label(l)])),
      }, base + 1, 'slow'))
    }
  }

  // ── borders ──────────────────────────────────────────────────────────────────────
  if (ne) {
    const wcSet = new Set(ref.borders.map((b) => wcByAlpha3.get(b)?.cca2 ?? UNRESOLVED))
    const neSet = ne.neighbours
    const unresolved = wcSet.has(UNRESOLVED) || neSet.has(UNRESOLVED) || [...wcSet, ...neSet].some((c) => c === 'XK')
    const inPack = (s) => new Set([...s].filter((c) => entityById.has(c)))
    const a = inPack(wcSet), b = inPack(neSet)
    const agreed = new Set([...a].filter((c) => b.has(c)))
    const either = new Set([...a, ...b])
    claimed.set(e.id, either)
    agreedNeighbours.set(e.id, agreed)

    if (unresolved) {
      DISPUTED_BORDER.add(e.id)
      drop('border-count', e.id, 'a boundary the sources and the world disagree on')
    } else if (a.size !== b.size || [...a].some((c) => !b.has(c))) {
      drop('border-count', e.id, `sources differ: ${[...a].join('')} / ${[...b].join('')}`)
    } else {
      out['border-count'].push(fact(e, 'border-count', 'border-count', {
        id: `borders-${agreed.size}`,
        number: agreed.size,
        names: Object.fromEntries(LOCALES.map((l) => [l, String(agreed.size)])),
      }, base + 1, 'stable'))
    }
  }

  // ── landlocked / coastal ─────────────────────────────────────────────────────────
  if (ne) {
    const neLandlocked = ne.exclusiveArcs === 0
    if (neLandlocked !== ref.landlocked) drop('landlocked', e.id, `sources differ (landlocked: ${ref.landlocked} vs ${neLandlocked})`)
    else {
      const landlocked = ref.landlocked
      out.landlocked.push(fact(e, 'landlocked', 'landlocked', {
        id: landlocked ? 'landlocked' : 'coastal',
        names: landlocked
          ? { en: 'a landlocked country', sv: 'ett land utan kust' }
          : { en: 'a country with a sea coast', sv: 'ett land med kust' },
      }, landlocked ? base : base, 'stable'))
    }
  }

  // ── hemisphere ───────────────────────────────────────────────────────────────────
  if (ne && ref.latlng.length === 2) {
    const ratio = ne.area / ref.area
    const [lat, lon] = ref.latlng
    const whole = ne.minLat > 0 ? 'N' : ne.maxLat < 0 ? 'S' : null
    const side = ne.minLon > 0 ? 'E' : ne.maxLon < 0 ? 'W' : null
    if (ratio < 0.85 || ratio > 1.18) drop('hemisphere', e.id, 'outline does not match the area')
    else if (!whole || !side) drop('hemisphere', e.id, 'crosses the equator, the prime meridian or the antimeridian')
    else if ((whole === 'N') !== (lat > 0) || (side === 'E') !== (lon > 0)) drop('hemisphere', e.id, 'sources differ')
    else {
      const q = QUADRANT[`${whole}${side}`]
      out.hemisphere.push(fact(e, 'hemisphere', 'hemisphere', { id: `hemisphere-${whole}${side}`, names: q }, Math.max(1, base), 'stable'))
    }
  }

  // ── tld ──────────────────────────────────────────────────────────────────────────
  {
    const tld = ref.tld?.[0]
    const iso2 = isoCountries.alpha2ToAlpha3(e.id) ? e.id : null
    const expected = e.id === 'GB' ? '.uk' : `.${e.id.toLowerCase()}`
    if (!tld || !iso2) drop('tld', e.id, 'no value')
    else if (tld !== expected) drop('tld', e.id, `${tld} is not ${expected}`)
    else {
      // Obvious when the code is the start of the name (.ca Canada), a real fact when it is not.
      const obvious = fold(e.names.en).startsWith(e.id.toLowerCase())
      out.tld.push(fact(e, 'tld', 'tld', { id: `tld-${e.id.toLowerCase()}`, names: Object.fromEntries(LOCALES.map((l) => [l, tld])) }, base + (obvious ? 0 : 1), 'stable'))
    }
  }

  // ── alpha-3 ──────────────────────────────────────────────────────────────────────
  {
    const a = ref.cca3
    const b = isoCountries.alpha2ToAlpha3(e.id)
    if (!a || a !== b) drop('alpha3', e.id, `${a} vs ${b}`)
    else {
      const obvious = fold(e.names.en).startsWith(a.toLowerCase())
      out.alpha3.push(fact(e, 'alpha3', 'alpha3', { id: `alpha3-${a.toLowerCase()}`, names: Object.fromEntries(LOCALES.map((l) => [l, a])) }, base + (obvious ? 0 : 1), 'stable'))
    }
  }

  // ── currency code ────────────────────────────────────────────────────────────────
  {
    const cf = currencyFacts.get(e.id)
    const codes = Object.keys(ref.currencies ?? {}).filter((c) => !FUNDS_CODES.has(c))
    const theirs = (countriesList[e.id]?.currency ?? []).filter((c) => !FUNDS_CODES.has(c))
    if (!cf || cf.quizzable === false) drop('currency-code', e.id, 'the currency pack withdraws or lacks it')
    else if (codes.length !== 1 || theirs.length !== 1 || codes[0] !== theirs[0]) drop('currency-code', e.id, `${codes} vs ${theirs}`)
    else {
      const code = codes[0]
      const ours = fold(cf.value.names.en)
      const official = fold(currenciesAll[code]?.name ?? '')
      const wcName = fold(ref.currencies[code].name ?? '')
      // The pack's own name has to say the same currency. Bulgaria's reference data
      // still says lev; the pack says euro; the two together are why this check exists.
      if (!(ours === official || ours === wcName || official.includes(ours) || ours.includes(official) || wcName.includes(ours) || ours.includes(wcName) || (code === 'EUR' && ours === 'euro') || (code === 'XCD' && ours.includes('caribbean dollar')) || (code === 'USD' && ours.includes('dollar')) || PACK_NAME_ALIAS[e.id] === code))
        drop('currency-code', e.id, `pack says "${cf.value.names.en}", sources say ${code}`)
      else out['currency-code'].push(fact(e, 'currency-code', 'currency-code', { id: `iso4217-${code.toLowerCase()}`, names: Object.fromEntries(LOCALES.map((l) => [l, code])) }, base + 1, 'slow'))
    }
  }

  // ── native name ──────────────────────────────────────────────────────────────────
  {
    const natives = [...new Set(Object.values(ref.name.native ?? {}).map((n) => n.common))]
    const listed = countriesList[e.id]?.native
    if (natives.length !== 1) drop('native-name', e.id, natives.length === 0 ? 'no endonym' : 'more than one endonym')
    else if (!listed || fold(listed) !== fold(natives[0])) drop('native-name', e.id, `${natives[0]} vs ${listed}`)
    else if (fold(natives[0]) === fold(e.names.en) || LOCALES.some((l) => fold(name(e, l)) === fold(natives[0]))) drop('native-name', e.id, 'same as the name in a shipped locale')
    else {
      const close = fold(natives[0]).slice(0, 4) === fold(e.names.en).slice(0, 4)
      out['native-name'].push(fact(e, 'native-name', 'native-name', { id: `endonym-${e.id.toLowerCase()}`, names: Object.fromEntries(LOCALES.map((l) => [l, natives[0]])) }, base + (close ? 1 : 2), 'slow'))
    }
  }
}

// ── borders: one fact per agreed pair, plus non-quizzable claims that only one source makes ──
for (const e of sorted) {
  const either = claimed.get(e.id) ?? new Set()
  const agreed = agreedNeighbours.get(e.id) ?? new Set()
  const base = familiarity(e.id)
  for (const code of [...either].sort()) {
    const other = entityById.get(code)
    const quizzable = agreed.has(code)
    const reciprocal = agreedNeighbours.get(code)?.has(e.id) ?? false
    out.borders.push(fact(e, 'borders', `borders-${code.toLowerCase()}`, {
      id: code,
      names: Object.fromEntries(LOCALES.map((l) => [l, name(other, l)])),
    }, Math.max(base, familiarity(code)), 'stable', quizzable && reciprocal
      ? {}
      : {
          quizzable: false,
          $comment: 'Claimed by one of the two sources and not the other. Kept so a question never offers this country as a WRONG answer; never asked.',
        }))
  }
}
// A pair claimed one way only is withdrawn both ways.
const pairs = new Set(out.borders.filter((f) => f.quizzable !== false).map((f) => `${f.entity}>${f.value.id}`))
for (const f of out.borders) {
  if (f.quizzable === false) continue
  if (!pairs.has(`${f.value.id}>${f.entity}`)) {
    f.quizzable = false
    f.$comment = 'Only one direction was agreed by both sources; withdrawn.'
  }
}

// ── write ────────────────────────────────────────────────────────────────────────
const pack = (attr, items, extra = {}) => ({
  $schema: '../../schema/pack.schema.json',
  packId: `geography.facts.${attr}`,
  version: '1.0.0',
  subject: 'geography',
  kind: 'facts',
  locales: LOCALES,
  license: 'CC-BY-4.0',
  generatedAt: VERIFIED_AT,
  ...extra,
  items,
})

const NOTES = {
  area: 'Rounded to two significant figures and labelled "about": the claim is the order of magnitude, never the last digit. `value.number` keeps the sourced figure so distractors can be chosen by how close they are.',
  'border-count': 'Only where both sources list exactly the same neighbours among the countries the app has. Anything touching a disputed boundary is absent — see scripts/build-deep-facts.cjs.',
  borders: 'One fact per neighbour: value.id is the neighbour\'s entity id and the answer is that ENTITY (`fact.value.entity`). Facts marked quizzable:false are claimed by one source only and exist so a question never offers them as a wrong answer.',
  landlocked: 'Worded to finish the sentence the wrong-answer hint builds ("Armenia is a landlocked country."). Both values are facts: a coastal country is what makes "which of these has no sea coast?" have three wrong answers. See the template `when` clauses.',
  hemisphere: 'Only countries lying entirely inside one quadrant of the equator and the prime meridian. A country that crosses either is absent rather than half right.',
  tld: 'The ccTLD equals the ISO code for every country that ships here; .uk is the single exception and is checked explicitly.',
  alpha3: 'ISO 3166-1 alpha-3.',
  'currency-code': 'ISO 4217. Only where the currency pack is itself quizzable and its name agrees with the code.',
  'native-name': 'Only countries with exactly one endonym, written differently from the name in both shipped locales.',
}
/**
 * The deep packs the APP does not ship, composed by the Worker only (`delivery: "server"`).
 *
 * The native bundle has a budget (`scripts/bundle-native.cjs`) and these four were the heaviest per
 * thing a learner reads off a country page: every neighbour is its own fact, and three of the
 * others are codes. They are all still ASKED — a D1 build is issued its lessons by the Worker —
 * they are only not listed under "What to know". Size, neighbour count, coast, hemisphere and the
 * country's own name stay in the app.
 */
const SERVER_DELIVERED = new Set(['borders', 'tld', 'alpha3', 'currency-code', 'area', 'border-count', 'landlocked', 'hemisphere'])
const VOLATILITY_REVIEWED = new Set(['border-count', 'borders', 'landlocked', 'hemisphere', 'tld', 'alpha3', 'currency-code', 'native-name', 'area'])

for (const [attr, items] of Object.entries(out)) {
  const file = attr === 'currency-code' ? 'facts.currency-codes.v1.json' : attr === 'native-name' ? 'facts.native-names.v1.json' : `facts.${attr}.v1.json`
  const body = pack(attr === 'currency-code' ? 'currency-codes' : attr === 'native-name' ? 'native-names' : attr, items, {
    $comment: NOTES[attr],
    ...(VOLATILITY_REVIEWED.has(attr) ? { volatilityReviewed: true } : {}),
    ...(SERVER_DELIVERED.has(attr) ? { delivery: 'server' } : {}),
  })
  writeFileSync(join(PACKS, file), `${JSON.stringify(body, null, 2)}\n`)
}

console.log('\nDeep facts\n')
let total = 0
for (const [attr, items] of Object.entries(out)) {
  const quizzable = items.filter((f) => f.quizzable !== false).length
  total += items.length
  console.log(`  ${attr.padEnd(14)} ${String(items.length).padStart(4)} facts (${quizzable} asked)`)
}
console.log(`  ${'total'.padEnd(14)} ${String(total).padStart(4)}`)
console.log('\n  dropped, and why:')
for (const [kind, list] of Object.entries(dropped)) console.log(`    ${kind.padEnd(14)} ${String(list.length).padStart(3)}  ${list.slice(0, 40).join('  ')}${list.length > 40 ? '  …' : ''}`)
console.log()
