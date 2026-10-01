#!/usr/bin/env node
/**
 * Fetch the raw material for the "fame" packs — the companies, people, places, dishes and
 * clubs a player should know — and freeze it in `scripts/data/fame-snapshot.json`.
 *
 * ## Why Wikidata, and why ranked by sitelinks
 *
 * There is no list of "who should a ten-year-old know" to copy, and inventing one is the
 * exact failure CLAUDE.md forbids: a wrong fact in a learning app is the worst bug. So the
 * facts come from Wikidata (CC0), which states WHERE each thing is from in a form a program
 * can check, and the RANK comes from something nobody here chose: `wikibase:sitelinks`, the
 * number of Wikipedia language editions that have an article about the thing. A volunteer
 * community in each of ~300 languages independently decided it was worth an article, which is
 * as close to "everyone should know this" as a number gets — Messi has 225, a Sunday-league
 * striker has 5 — and it is the signal `scripts/build-fame-facts.cjs` turns into the 1–5
 * difficulty the lesson ramp climbs.
 *
 * ## Why QLever, and why a snapshot
 *
 * Wikidata's own query service times out on a sort over every footballer that ever lived;
 * QLever (University of Freiburg) answers the same query in two seconds. The result is frozen
 * in the repo so a build is reproducible offline and a value changes only when somebody
 * re-runs this on purpose and reads the diff — the same reason `world-countries` is pinned
 * rather than ranged.
 *
 * Nothing here decides anything. Every filter that keeps or drops a row lives in
 * `build-fame-facts.cjs`, where it can be read next to the thing it protects.
 *
 * Run: node scripts/fetch-fame-snapshot.cjs
 */

const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs')
const { join } = require('node:path')

const OUT = join(__dirname, 'data', 'fame-snapshot.json')
const ENDPOINT = 'https://qlever.cs.uni-freiburg.de/api/wikidata'
const UA = 'WorldQuest-content-builder/1.0 (isacmolin@gmail.com)'

/**
 * `--reuse=companies` keeps that section from the existing snapshot. The company query joins
 * a class tree and QLever sometimes times out while PLANNING it, for reasons that have nothing
 * to do with the query; a fetch that has to win that lottery every time is a fetch nobody re-runs.
 */
const REUSE = new Set((process.argv.find((a) => a.startsWith('--reuse=')) ?? '').replace('--reuse=', '').split(',').filter(Boolean))
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}

const PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX schema: <http://schema.org/>
`

/** The countries this app has, as ISO alpha-2 — a Wikidata country outside it is not a row. */
const entities = JSON.parse(readFileSync(join(__dirname, '..', 'packages', 'content', 'packs', 'geography', 'entities.countries.v1.json'), 'utf8')).items
const CODES = new Set(entities.map((e) => e.id))

async function sparql(body, label) {
  for (let attempt = 1; attempt <= 8; attempt++) {
    const started = Date.now()
    try {
      const r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sparql-query', Accept: 'application/sparql-results+json', 'User-Agent': UA },
        body: PREFIXES + body,
      })
      const text = await r.text()
      if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 160)}`)
      const rows = JSON.parse(text).results.bindings
      console.log(`  ${label.padEnd(28)} ${String(rows.length).padStart(6)} rows  ${((Date.now() - started) / 1000).toFixed(1)}s`)
      return rows
    } catch (error) {
      console.log(`  ${label} attempt ${attempt} failed: ${String(error.message).slice(0, 140)}`)
      await new Promise((r) => setTimeout(r, 4000 * attempt))
    }
  }
  throw new Error(`gave up on ${label}`)
}

const q = (row, key) => row[key]?.value
const qid = (uri) => uri?.replace('http://www.wikidata.org/entity/', '')
const tidy = (rows, extra = () => ({})) =>
  rows
    .map((r) => ({
      id: qid(q(r, 'x')),
      en: q(r, 'en'),
      sv: q(r, 'sv') ?? null,
      code: q(r, 'code'),
      sitelinks: Number(q(r, 's')),
      ...extra(r),
    }))
    .filter((r) => r.id && r.en && CODES.has(r.code) && Number.isFinite(r.sitelinks))

const LABELS = `?x rdfs:label ?en . FILTER(LANG(?en) = "en")
  OPTIONAL { ?x rdfs:label ?sv . FILTER(LANG(?sv) = "sv") }`

/** Occupations a person may be filed under — the build script decides which category each means. */
const OCCUPATIONS = [
  // sport
  'Q937857', 'Q3665646', 'Q10833314', 'Q11774891', 'Q10871364', 'Q12299841', 'Q378622', 'Q11338576', 'Q11513337', 'Q10843402', 'Q2309784', 'Q2066131',
  // music
  'Q177220', 'Q639669', 'Q36834', 'Q2252262', 'Q855091', 'Q486748', 'Q130857', 'Q753110', 'Q488205', 'Q183945',
  // screen
  'Q33999', 'Q10800557', 'Q2526255', 'Q10798782', 'Q2259451',
  // science
  'Q901', 'Q169470', 'Q593644', 'Q170790', 'Q205375', 'Q11063', 'Q864503',
  // letters and art
  'Q36180', 'Q6625963', 'Q49757', 'Q214917', 'Q482980', 'Q1028181', 'Q1281618', 'Q42973',
]

/** Things that are "places worth knowing": classes whose instances a tourist board would print on a postcard. */
const LANDMARK_CLASSES = [
  'Q12518', 'Q23413', 'Q16560', 'Q12280', 'Q33506', 'Q2977', 'Q4989906', 'Q46169', 'Q44539', 'Q32815', 'Q12516', 'Q179700', 'Q11303', 'Q483110', 'Q34038', 'Q16970', 'Q570116', 'Q9259',
]

async function main() {
  const snapshot = { fetchedAt: new Date().toISOString().slice(0, 10), source: 'Wikidata (CC0) via QLever', persons: [], occupations: {}, companies: [], landmarks: [], disputedPlaces: [], groups: [], clubs: [], highestPoints: [] }

  console.log('\nFetching from QLever\n')

  // ── people: born in the country they are a citizen of, and of no other ──────────────
  snapshot.persons = tidy(await sparql(`SELECT DISTINCT ?x ?en ?sv ?code ?s WHERE {
  VALUES ?occ { ${OCCUPATIONS.map((o) => `wd:${o}`).join(' ')} }
  ?x wdt:P31 wd:Q5 ; wdt:P106 ?occ ; wikibase:sitelinks ?s ; wdt:P27 ?c ; wdt:P19 ?b .
  ?b wdt:P17 ?c . ?c wdt:P297 ?code .
  FILTER(xsd:integer(?s) >= 35)
  FILTER NOT EXISTS { ?x wdt:P27 ?o . FILTER(?o != ?c) }
  ${LABELS}
}`, 'people'))
  // One row per person even if a label repeats across language variants.
  const seen = new Set()
  snapshot.persons = snapshot.persons.filter((p) => !seen.has(p.id) && seen.add(p.id))

  // Every occupation of every candidate, in chunks: the category a person is filed under is
  // decided by ALL of what they do, so a novelist who once played football is a novelist.
  const ids = snapshot.persons.map((p) => p.id)
  for (let i = 0; i < ids.length; i += 1500) {
    const chunk = ids.slice(i, i + 1500)
    const rows = await sparql(`SELECT ?x ?occ WHERE { VALUES ?x { ${chunk.map((id) => `wd:${id}`).join(' ')} } ?x wdt:P106 ?occ }`, `occupations ${i}-${i + chunk.length}`)
    for (const r of rows) (snapshot.occupations[qid(q(r, 'x'))] ??= []).push(qid(q(r, 'occ')))
  }

  if (REUSE.has('companies') && previous.companies) {
    console.log(`  companies                     reused from the existing snapshot (${previous.companies.length})`)
    snapshot.companies = previous.companies
  } else {
    // ── companies: the country it says it is from and the country its head office is in agree ──
    snapshot.companies = tidy(await sparql(`SELECT DISTINCT ?x ?en ?sv ?code ?s ?ind ?coord WHERE {
    ?x wdt:P31/wdt:P279* wd:Q4830453 ; wikibase:sitelinks ?s ; wdt:P17 ?c ; wdt:P159 ?hq .
    ?hq wdt:P17 ?c ; wdt:P625 ?coord . ?c wdt:P297 ?code .
    FILTER(xsd:integer(?s) >= 30)
    FILTER NOT EXISTS { ?x wdt:P17 ?o . FILTER(?o != ?c) }
    FILTER NOT EXISTS { ?x wdt:P576 ?ended }
    ${LABELS}
    OPTIONAL { ?x wdt:P452 ?i . ?i rdfs:label ?ind . FILTER(LANG(?ind) = "en") }
  }`, 'companies'), (r) => ({ industry: q(r, 'ind') ?? null, coord: q(r, 'coord') }))

    // What each candidate IS. "Business" in Wikidata's class tree reaches the World Health
    // Organization; the builder refuses anything whose own types say organisation, agency or
    // institute, and needs these labels to do it.
    const companyIds = snapshot.companies.map((c) => c.id)
    const typesById = {}
    for (let i = 0; i < companyIds.length; i += 1500) {
      const chunk = companyIds.slice(i, i + 1500)
      const rows = await sparql(`SELECT ?x ?tl WHERE { VALUES ?x { ${chunk.map((id) => `wd:${id}`).join(' ')} } ?x wdt:P31 ?t . ?t rdfs:label ?tl . FILTER(LANG(?tl) = "en") }`, `company types ${i}`)
      for (const r of rows) (typesById[qid(q(r, 'x'))] ??= []).push(q(r, 'tl'))
    }
    for (const c of snapshot.companies) c.types = typesById[c.id] ?? []

  }

  // ── places ───────────────────────────────────────────────────────────────────────────
  // The second source for where a landmark is: its own coordinates, which the builder checks
  // against Natural Earth's outline of the country Wikidata names. (Joining on the parent
  // administrative area instead sorted every landmark against every area and timed out.)
  snapshot.landmarks = tidy(await sparql(`SELECT DISTINCT ?x ?en ?sv ?code ?s ?coord WHERE {
  VALUES ?t { ${LANDMARK_CLASSES.map((c) => `wd:${c}`).join(' ')} }
  ?x wdt:P31 ?t ; wikibase:sitelinks ?s ; wdt:P17 ?c ; wdt:P625 ?coord .
  ?c wdt:P297 ?code .
  FILTER(xsd:integer(?s) >= 30)
  FILTER NOT EXISTS { ?x wdt:P17 ?o . FILTER(?o != ?c) }
  ${LABELS}
}`, 'landmarks'), (r) => ({ coord: q(r, 'coord') }))

  // Places inside an area whose sovereignty is disputed — East Jerusalem, Crimea, Western Sahara, the Golan, the West Bank, Gaza, Kashmir, Northern Cyprus, Abkhazia, South Ossetia, Transnistria, Donetsk and Luhansk —
  // are found separately and dropped by the builder. As a NOT EXISTS over a property path this
  // sorted every landmark against every administrative area and timed out; asked the other way
  // round it is a small bounded set.
  snapshot.disputedPlaces = (await sparql(`SELECT DISTINCT ?x WHERE { VALUES ?bad { wd:Q1218 wd:Q7835 wd:Q6250 wd:Q83210 wd:Q23427 wd:Q43100 wd:Q23681 wd:Q36678 wd:Q39760 wd:Q907112 wd:Q2012050 wd:Q171965 wd:Q31354462 } ?x wdt:P131+ ?bad }`, 'disputed places')).map((r) => qid(q(r, 'x'))).filter((id) => snapshot.landmarks.some((l) => l.id === id))

  // Bands: where it says it is from AND where it was formed agree.
  snapshot.groups = tidy(await sparql(`SELECT DISTINCT ?x ?en ?sv ?code ?s WHERE {
  ?x wdt:P31 wd:Q215380 ; wikibase:sitelinks ?s ; wdt:P495 ?c ; wdt:P740 ?f .
  ?f wdt:P17 ?c . ?c wdt:P297 ?code .
  FILTER(xsd:integer(?s) >= 35)
  FILTER NOT EXISTS { ?x wdt:P495 ?o . FILTER(?o != ?c) }
  ${LABELS}
}`, 'bands'))

  snapshot.clubs = tidy(await sparql(`SELECT DISTINCT ?x ?en ?sv ?code ?s WHERE {
  ?x wdt:P31 wd:Q476028 ; wikibase:sitelinks ?s ; wdt:P17 ?c ; wdt:P159 ?hq .
  ?hq wdt:P17 ?c . ?c wdt:P297 ?code .
  FILTER(xsd:integer(?s) >= 25)
  FILTER NOT EXISTS { ?x wdt:P17 ?o . FILTER(?o != ?c) }
  FILTER NOT EXISTS { ?x wdt:P576 ?ended }
  ${LABELS}
}`, 'football clubs'))

  snapshot.highestPoints = tidy(await sparql(`SELECT DISTINCT ?x ?en ?sv ?code ?s ?coord WHERE {
  ?c wdt:P297 ?code ; wdt:P610 ?x .
  ?x wdt:P17 ?c ; wikibase:sitelinks ?s ; wdt:P625 ?coord .
  FILTER NOT EXISTS { ?x wdt:P17 ?o . FILTER(?o != ?c) }
  FILTER NOT EXISTS { ?c wdt:P610 ?other . FILTER(?other != ?x) }
  ${LABELS}
}`, 'highest points'), (r) => ({ coord: q(r, 'coord') }))

  // The one-line editorial description each item carries ("Swedish association football
  // player (born 1981)"). It is the SECOND SOURCE for who and what a thing is: written by
  // different hands than the country statement, and readable — the builder insists the
  // nationality in it is the country the fact claims, and that what it says the thing IS
  // matches the category the fact is filed under.
  snapshot.descriptions = {}
  const all = new Set([...snapshot.persons, ...snapshot.companies, ...snapshot.landmarks, ...snapshot.groups, ...snapshot.clubs, ...snapshot.highestPoints].map((r) => r.id))
  const allIds = [...all]
  for (let i = 0; i < allIds.length; i += 1500) {
    const chunk = allIds.slice(i, i + 1500)
    const rows = await sparql(`SELECT ?x ?d WHERE { VALUES ?x { ${chunk.map((id) => `wd:${id}`).join(' ')} } ?x schema:description ?d . FILTER(LANG(?d) = "en") }`, `descriptions ${i}`)
    for (const r of rows) snapshot.descriptions[qid(q(r, 'x'))] = q(r, 'd')
  }

  mkdirSync(join(__dirname, 'data'), { recursive: true })
  writeFileSync(OUT, `${JSON.stringify(snapshot)}\n`)
  console.log(`\n✓ wrote ${OUT}\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
