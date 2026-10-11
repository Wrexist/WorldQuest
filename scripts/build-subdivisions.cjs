#!/usr/bin/env node
/**
 * The United States' fifty states and Sweden's twenty-one counties (län): who they are, their
 * capitals (county seats — residensstäder), which part of the country each lies in, and an
 * outline map of each. The owner asked for both (2026-10-11); the research that ranked them
 * first is docs/plan/learning-system-research-2026-10-11.md §4 — US states lead Sporcle's
 * all-time charts, and Sweden is this app's home market.
 *
 * ## Two sources, or no fact — the rule `build-deep-facts.cjs` keeps, kept here
 *
 *   entity        Natural Earth admin-1 (public domain)  ==  Wikidata P300 (CC0), by ISO 3166-2
 *                 code, and NE's own `wikidataid` must name the same item
 *   capital/seat  Wikidata P36  ==  GeoNames (CC BY 4.0) — the city GeoNames files as the seat
 *                 (PPLA) or national capital (PPLC) of that same first-level division, matched
 *                 on its name or any of its recorded alternate names
 *   US region     US Census Bureau "Regions and Divisions" (reg_div.txt)  ==  Natural Earth's
 *                 `region` field
 *   SE region     Eurostat NUTS 2021 (SE1/SE2/SE3 by code prefix)  ==  Wikidata P605
 *
 * A disagreement drops the fact rather than choosing a winner. GeoNames is used to CHECK and
 * never shipped, so nothing of it is redistributed; it is credited in the pack's comment anyway.
 *
 * ## Opt-in, not mixed in
 *
 * Every entity here carries `within` (`US`, `SE`): its facts are introduced only in a lesson
 * that asks for them (`ComposeInput.nested`), never in a mixed lesson or a daily quest. See
 * `Entity.within` in packages/engines/src/content/types.ts.
 *
 * ## Maps
 *
 * Two masks per subdivision, like `build-maps.cjs` once drew for countries, tinted at runtime
 * from tokens (`LocatorMap`): the subdivision, and the land around it with the first-level
 * borders of its country cut out as thin gaps — so Nevada reads as one state among states
 * rather than a blob in a continent. Every vertex is Natural Earth's.
 *
 * Run: node scripts/build-subdivisions.cjs [--refresh]   (--refresh re-queries Wikidata and
 * rewrites scripts/data/subdivisions-snapshot.json; review that diff)
 */

const { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { execFileSync } = require('node:child_process')
const { geoMercator, geoPath, geoArea, geoBounds, geoCentroid } = require('d3-geo')
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')

const ROOT = join(__dirname, '..')
const CACHE = join(ROOT, 'node_modules', '.cache', 'subdivisions')
const PACKS = join(ROOT, 'packages', 'content', 'packs', 'geography')
const SNAPSHOT = join(__dirname, 'data', 'subdivisions-snapshot.json')
const ASSETS = join(ROOT, 'apps', 'mobile', 'assets', 'geo')
const INDEX = join(ROOT, 'apps', 'mobile', 'src', 'lib', 'subdivision-maps.generated.ts')
const VERIFIED_AT = new Date().toISOString().slice(0, 10)
const UA = { 'User-Agent': 'WorldQuest content build (https://github.com/Wrexist/WorldQuest)' }

const SOURCES = {
  admin1: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson',
  countries: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson',
  cities: 'https://download.geonames.org/export/dump/cities5000.zip',
  census: 'https://www2.census.gov/geo/docs/maps-data/maps/reg_div.txt',
  nuts: 'https://gisco-services.ec.europa.eu/distribution/v2/nuts/csv/NUTS_AT_2021.csv',
}

/** The two sets, and the words each one is asked in. */
const SETS = [
  {
    parent: 'US',
    keep: (p) => p.iso_a2 === 'US' && p.type_en === 'State',
    capitalAttribute: 'state-capital',
    regionAttribute: 'us-region',
    region: 'us',
    expected: 50,
  },
  {
    parent: 'SE',
    keep: (p) => p.iso_a2 === 'SE' && p.type_en === 'County',
    capitalAttribute: 'county-seat',
    regionAttribute: 'se-region',
    region: 'se',
    expected: 21,
  },
]

/** Census region (reg_div.txt heading) → value. Names are the Bureau's; Swedish is how Swedish atlases say it. */
const US_REGIONS = {
  NORTHEAST: { id: 'us-northeast', names: { en: 'the Northeast', sv: 'nordöstra USA' } },
  MIDWEST: { id: 'us-midwest', names: { en: 'the Midwest', sv: 'Mellanvästern' } },
  SOUTH: { id: 'us-south', names: { en: 'the South', sv: 'södra USA' } },
  WEST: { id: 'us-west', names: { en: 'the West', sv: 'västra USA' } },
}
/** NE's spelling of the same four. */
const NE_REGION = { Northeast: 'NORTHEAST', Midwest: 'MIDWEST', South: 'SOUTH', West: 'WEST' }

const fold = (s) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

async function cached(name, url) {
  const file = join(CACHE, name)
  if (existsSync(file)) return file
  mkdirSync(CACHE, { recursive: true })
  const response = await fetch(url, { headers: UA })
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  writeFileSync(file, Buffer.from(await response.arrayBuffer()))
  return file
}

async function wikidata() {
  if (existsSync(SNAPSHOT) && !process.argv.includes('--refresh')) return JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
  const query = `SELECT ?code ?item ?en ?sv ?links ?cap ?capEn ?capSv ?nuts WHERE {
    ?item wdt:P300 ?code . FILTER(STRSTARTS(?code, "US-") || STRSTARTS(?code, "SE-"))
    OPTIONAL { ?item rdfs:label ?en . FILTER(LANG(?en) = "en") }
    OPTIONAL { ?item rdfs:label ?sv . FILTER(LANG(?sv) = "sv") }
    OPTIONAL { ?item wikibase:sitelinks ?links }
    OPTIONAL { ?item wdt:P36 ?cap .
      OPTIONAL { ?cap rdfs:label ?capEn . FILTER(LANG(?capEn) = "en") }
      OPTIONAL { ?cap rdfs:label ?capSv . FILTER(LANG(?capSv) = "sv") } }
    OPTIONAL { ?item wdt:P605 ?nuts }
  }`
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`
  const json = await (await fetch(url, { headers: UA })).json()
  const rows = {}
  for (const b of json.results.bindings) {
    const v = (k) => b[k]?.value
    const row = (rows[v('code')] ??= { code: v('code'), item: v('item').split('/').pop(), en: v('en'), sv: v('sv'), sitelinks: Number(v('links') ?? 0), capitals: {}, nuts: [] })
    if (v('cap')) row.capitals[v('cap').split('/').pop()] = { en: v('capEn'), sv: v('capSv') }
    if (v('nuts') && !row.nuts.includes(v('nuts'))) row.nuts.push(v('nuts'))
  }
  const snapshot = { fetchedAt: VERIFIED_AT, source: 'Wikidata (CC0), query in scripts/build-subdivisions.cjs', rows: Object.fromEntries(Object.entries(rows).sort()) }
  writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 1) + '\n')
  return snapshot
}

/** reg_div.txt → state name → region key. */
function censusRegions(text) {
  const out = new Map()
  let region = null
  for (const line of text.split(/\r?\n/)) {
    const heading = /^REGION\s+\w+:\s*([A-Z]+)/.exec(line)
    if (heading) { region = heading[1]; continue }
    const state = /^([A-Za-z .]+?)\s+\((\d{2})\)/.exec(line)
    if (state && region) out.set(state[1].trim(), region)
  }
  return out
}

/** GeoNames: country + admin1 → the seats and capitals filed there, with every name each is known by. */
function geonamesSeats(zipFile) {
  const text = execFileSync('python', ['-I', '-c', 'import sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read("cities5000.txt"))', zipFile], { maxBuffer: 1 << 28 }).toString('utf8')
  const seats = new Map()
  for (const line of text.split('\n')) {
    const f = line.split('\t')
    if (f.length < 11 || (f[7] !== 'PPLA' && f[7] !== 'PPLC')) continue
    const key = `${f[8]}.${f[10]}`
    const names = new Set([f[1], f[2], ...f[3].split(',')].filter(Boolean).map(fold))
    seats.set(key, [...(seats.get(key) ?? []), names])
  }
  return seats
}

const difficultyByRank = (rank, total) => (rank < total * 0.2 ? 2 : rank < total * 0.5 ? 3 : rank < total * 0.8 ? 4 : 5)

;(async () => {
  const admin1 = JSON.parse(readFileSync(await cached('admin1.geojson', SOURCES.admin1), 'utf8'))
  const countries = JSON.parse(readFileSync(await cached('countries.geojson', SOURCES.countries), 'utf8'))
  const seats = geonamesSeats(await cached('cities5000.zip', SOURCES.cities))
  const census = censusRegions(readFileSync(await cached('reg_div.txt', SOURCES.census), 'utf8'))
  const nutsRows = readFileSync(await cached('nuts2021.csv', SOURCES.nuts), 'utf8').split(/\r?\n/).map((l) => l.split(','))
  const nutsName = new Map(nutsRows.filter((r) => r[0] === 'SE').map((r) => [r[1], r[2]]))
  const { rows: wd, fetchedAt } = await wikidata()

  const entities = []
  const facts = []
  const drops = []
  const maps = []

  for (const set of SETS) {
    const features = admin1.features.filter((f) => set.keep(f.properties))
    if (features.length !== set.expected) throw new Error(`${set.parent}: Natural Earth has ${features.length}, expected ${set.expected}`)
    const ranked = [...features].sort((a, b) => (wd[b.properties.iso_3166_2]?.sitelinks ?? 0) - (wd[a.properties.iso_3166_2]?.sitelinks ?? 0))

    for (const feature of features) {
      const p = feature.properties
      const code = p.iso_3166_2
      const row = wd[code]
      // Entity: the same item in both sources, or nothing.
      if (row === undefined || row.item !== p.wikidataid) { drops.push(`${code}: Natural Earth and Wikidata name different items`); continue }
      const names = { en: set.parent === 'SE' ? row.en : p.name, sv: row.sv ?? p.name_sv }
      if (!names.en || !names.sv) { drops.push(`${code}: no name in both languages`); continue }
      const difficulty = difficultyByRank(ranked.indexOf(feature), features.length)

      // Region: two sources agree, or no region fact (and no map question, which hangs on it).
      let region = null
      if (set.parent === 'US') {
        const fromCensus = census.get(p.name)
        const fromNe = NE_REGION[p.region]
        if (fromCensus !== undefined && fromCensus === fromNe) region = { ...US_REGIONS[fromCensus], subregion: `us-${fold(p.region_sub).replace(/ /g, '-')}`, source: { name: 'US Census Bureau, Census Regions and Divisions of the United States; agrees with Natural Earth', url: SOURCES.census } }
        else drops.push(`${code}: Census says ${fromCensus}, Natural Earth ${fromNe}`)
      } else {
        const nuts3 = row.nuts.find((n) => /^SE\d{3}$/.test(n))
        const label = nuts3 === undefined ? undefined : nutsName.get(nuts3)
        const nuts1 = nuts3?.slice(0, 3)
        // Eurostat lists the county under that code, by name: the two agree on which county it is.
        if (nuts1 !== undefined && label !== undefined && fold(label).startsWith(fold(row.sv.replace(/s? län$/, '')).slice(0, 4))) {
          const sv = nutsName.get(nuts1)
          const en = { SE1: 'East Sweden', SE2: 'South Sweden', SE3: 'North Sweden' }[nuts1]
          region = { id: `se-${nuts1.toLowerCase()}`, names: { en, sv }, subregion: `se-${nuts3.slice(0, 4).toLowerCase()}`, source: { name: `Eurostat NUTS 2021, ${nuts1} “${sv}” (${nuts3} ${label}); agrees with Wikidata P605`, url: 'https://ec.europa.eu/eurostat/web/nuts' } }
        } else drops.push(`${code}: Eurostat and Wikidata disagree on its NUTS region`)
      }

      entities.push({
        id: code,
        type: 'subdivision',
        names,
        region: set.parent,
        ...(region ? { subregion: region.subregion } : {}),
        within: set.parent,
        assets: {
          map: { path: `geo/subdivisions/${code}.png`, licenseRef: 'natural-earth-admin1' },
          mapContext: { path: `geo/subcontext/${code}.png`, licenseRef: 'natural-earth-admin1-context' },
        },
      })
      maps.push({ code, parent: set.parent, feature })

      const tags = [set.region, 'subdivision']
      if (region) {
        facts.push({
          id: `geo.${code}.${set.regionAttribute}`,
          entity: code,
          attribute: set.regionAttribute,
          value: { id: region.id, names: region.names },
          difficulty,
          tags,
          source: { ...region.source, verifiedAt: VERIFIED_AT },
          volatility: 'stable',
        })
      }

      // Capital / county seat: Wikidata and GeoNames agree, or no fact.
      const capitals = Object.entries(row.capitals)
      if (capitals.length !== 1) { drops.push(`${code}: Wikidata gives ${capitals.length} capitals`); continue }
      const [capId, cap] = capitals[0]
      const filed = seats.get(p.gn_a1_code ?? '') ?? (set.parent === 'US' ? seats.get(`US.${code.slice(3)}`) : undefined) ?? []
      const agrees = filed.some((names) => names.has(fold(cap.en ?? '')) || (cap.sv !== undefined && names.has(fold(cap.sv))))
      if (!cap.en || !cap.sv || !agrees) { drops.push(`${code}: GeoNames does not file ${cap.en} as its seat`); continue }
      // "What is the seat of Uppsala County?" — Uppsala. The name is the answer, so the fact is
      // kept for the country page and never asked; the engine would refuse it anyway, and a fact
      // nobody can be asked is one the accessibility parity check rightly counts as missing.
      const stem = (s) => fold(s).replace(/ /g, '').slice(0, 4)
      const named = ['en', 'sv'].some((l) => cap[l] && names[l] && (stem(names[l]) === stem(cap[l]) || fold(names[l]).split(' ').includes(fold(cap[l]))))
      facts.push({
        id: `geo.${code}.${set.capitalAttribute}`,
        ...(named ? { quizzable: false } : {}),
        entity: code,
        attribute: set.capitalAttribute,
        value: { id: capId.toLowerCase(), names: { en: cap.en, sv: cap.sv } },
        difficulty,
        tags,
        source: {
          name: `Wikidata, “${cap.en}” (${capId}), ${set.parent === 'US' ? 'capital' : 'seat'} of ${row.en} (${row.item}); agrees with GeoNames`,
          url: `https://www.wikidata.org/wiki/${capId}`,
          verifiedAt: fetchedAt,
        },
        volatility: 'stable',
      })
    }
  }

  // ── packs ───────────────────────────────────────────────────────────────────────────
  const header = (packId, kind, comment) => ({
    $schema: '../../schema/pack.schema.json', $comment: comment, packId, version: '1.0.0', subject: 'geography', kind, locales: ['en', 'sv'], license: 'CC-BY-4.0', generatedAt: VERIFIED_AT,
  })
  writeFileSync(join(PACKS, 'entities.subdivisions.v1.json'), JSON.stringify({
    ...header('geography.entities.subdivisions', 'entities', 'GENERATED by scripts/build-subdivisions.cjs — do not edit by hand. The fifty US states and Sweden’s twenty-one counties. Each is `within` its country: opt-in learning, never mixed into an ordinary lesson. Names and codes agree between Natural Earth admin-1 (public domain) and Wikidata (CC0).'),
    attribution: 'Outlines and codes from Natural Earth admin-1 (public domain); names from Wikidata (CC0).',
    assetLicenses: {
      'natural-earth-admin1': { license: 'Public domain (Natural Earth)', attribution: 'Natural Earth 1:10m admin-1 states and provinces, public domain. Rasterised by scripts/build-subdivisions.cjs.' },
      'natural-earth-admin1-context': { license: 'Public domain (Natural Earth)', attribution: 'The land around the subdivision, with its country’s first-level borders cut out, from Natural Earth 1:10m (public domain), drawn in the same frame as geo/subdivisions/<CODE>.png.' },
    },
    items: entities.sort((a, b) => a.id.localeCompare(b.id)),
  }, null, 2) + '\n')
  const byAttribute = (prefix) => facts.filter((f) => f.attribute.endsWith(prefix)).sort((a, b) => a.id.localeCompare(b.id))
  writeFileSync(join(PACKS, 'facts.subdivision-capitals.v1.json'), JSON.stringify({
    ...header('geography.facts.subdivision-capitals', 'facts', 'GENERATED by scripts/build-subdivisions.cjs. State capitals and county seats (residensstäder): Wikidata P36, each confirmed by GeoNames (CC BY 4.0, used to check only) filing that city as the seat of the same first-level division. A disagreement dropped the fact.'),
    // Server-delivered: the Worker issues these lessons and the offline reference catalogue
    // carries them for the country page, so the app's bundle (5.21 MB budget) does not.
    delivery: 'server',
    items: [...byAttribute('state-capital'), ...byAttribute('county-seat')],
  }, null, 2) + '\n')
  writeFileSync(join(PACKS, 'facts.subdivision-regions.v1.json'), JSON.stringify({
    ...header('geography.facts.subdivision-regions', 'facts', 'GENERATED by scripts/build-subdivisions.cjs. Which part of its country each state or county lies in: the US Census Bureau’s four regions (agreeing with Natural Earth), Eurostat’s three NUTS-1 regions of Sweden (agreeing with Wikidata P605). The map question for each subdivision hangs on this fact, as a country’s hangs on its continent.'),
    delivery: 'server',
    items: [...byAttribute('us-region'), ...byAttribute('se-region')],
  }, null, 2) + '\n')

  // ── maps ────────────────────────────────────────────────────────────────────────────
  const W = 600, H = 450, FRACTION = 0.24
  rmSync(join(ASSETS, 'subdivisions'), { recursive: true, force: true })
  rmSync(join(ASSETS, 'subcontext'), { recursive: true, force: true })
  mkdirSync(join(ASSETS, 'subdivisions'), { recursive: true })
  mkdirSync(join(ASSETS, 'subcontext'), { recursive: true })
  const land = { type: 'FeatureCollection', features: countries.features }
  const browser = await chromium.launch(launchOptions())
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  const shoot = async (body) => {
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${body}</svg>`)
    return page.screenshot({ omitBackground: true })
  }
  /** The largest polygon only, for framing: Alaska's Aleutians and Hawaii's chain stay drawn, but do not move the camera. */
  const mainPolygon = (geometry) => geometry.type !== 'MultiPolygon' ? geometry
    : { type: 'Polygon', coordinates: [...geometry.coordinates].sort((a, b) => geoArea({ type: 'Polygon', coordinates: b }) - geoArea({ type: 'Polygon', coordinates: a }))[0] }
  for (const { code, parent, feature } of maps) {
    const subject = mainPolygon(feature.geometry)
    const inset = (1 - FRACTION) / 2
    const projection = geoMercator().rotate([-geoCentroid(subject)[0], 0]).fitExtent([[W * inset, H * inset], [W * (1 - inset), H * (1 - inset)]], subject)
    const path = geoPath(projection)
    const siblings = admin1.features.filter((f) => f.properties.iso_a2 === parent)
    const borders = siblings.map((f) => path(f.geometry)).join(' ')
    // Land, with every first-level border of the country cut out as a 2.5px gap.
    const context = await shoot(`<mask id="m"><rect width="${W}" height="${H}" fill="white"/><path d="${borders}" fill="none" stroke="black" stroke-width="2.5" stroke-linejoin="round"/></mask><path d="${path(land)}" fill="white" mask="url(#m)"/>`)
    writeFileSync(join(ASSETS, 'subcontext', `${code}.png`), context)
    writeFileSync(join(ASSETS, 'subdivisions', `${code}.png`), await shoot(`<path d="${path(feature.geometry)}" fill="white"/>`))
    const [[west, south], [east, north]] = geoBounds(subject)
    const a = projection([west, north]), b = projection([east, south])
    const px = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))
    if (!(px > Math.min(W, H) * FRACTION * 0.5)) throw new Error(`${code} did not fit its frame (${Math.round(px)}px)`)
  }
  await browser.close()

  const codes = maps.map((m) => m.code).sort()
  writeFileSync(INDEX, `/**
 * GENERATED by scripts/build-subdivisions.cjs — do not edit. The state and county outline
 * masks, keyed by the content pack's asset path. Static imports so Metro finds every file.
 */
import type { AssetModule } from './flags.generated.js'
${codes.map((c, i) => `import s${i} from '../../assets/geo/subdivisions/${c}.png'\nimport c${i} from '../../assets/geo/subcontext/${c}.png'`).join('\n')}

// Compact keys, like maps.generated.ts: the bundle has little headroom.
const codes = '${codes.join(' ')}'.split(' ')
const subjects = [${codes.map((_, i) => `s${i}`).join(', ')}]
const contexts = [${codes.map((_, i) => `c${i}`).join(', ')}]
export const SUBDIVISION_MAP_BY_PATH: Readonly<Record<string, AssetModule>> = Object.fromEntries(codes.flatMap((code, i) => [
  ['geo/subdivisions/' + code + '.png', subjects[i]!],
  ['geo/subcontext/' + code + '.png', contexts[i]!],
]))
`)

  console.log(`✓ ${entities.length} subdivisions, ${facts.length} facts, ${maps.length * 2} map masks`)
  if (drops.length > 0) console.log(`  dropped — two sources disagreed:\n    ${drops.join('\n    ')}`)
})().catch((error) => {
  console.error('✗', error.message)
  process.exit(1)
})
