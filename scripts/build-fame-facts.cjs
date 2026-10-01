#!/usr/bin/env node
/**
 * The companies, people, places and clubs a player should know — one fact each,
 * ranked, from the frozen Wikidata snapshot (`scripts/fetch-fame-snapshot.cjs`).
 *
 * ## Fame is a number, and the number is the curriculum
 *
 * Every fact's difficulty here is not authored; it is MEASURED from `sitelinks`, the count
 * of Wikipedia language editions with an article on the thing. Within each attribute the
 * facts are ranked by it and cut into the 1–5 scale the lesson ramp already climbs
 * (`difficultyRamp`): the top tenth — Messi, Toyota, the Eiffel Tower — is the easiest thing
 * in that category to know, and the bottom two fifths is what a player who has earned a lot
 * of XP is finally asked. Nobody here decided that a footballer is harder than a novelist;
 * each attribute is ranked against itself.
 *
 * The whole scale sits one step above geography's: difficulty 1 is reserved for the flag and
 * capital basics, so a player who has just installed the app meets geography first and the
 * celebrities a stage later, instead of the other way round.
 *
 * ## The rule this file keeps: a fact is only as true as its cheapest check
 *
 * Wikidata states where each thing is from. One source is not enough, so each row must also
 * pass a check that does not come from the same statement:
 *
 *   person    citizen of exactly one country, AND born in that country (two properties), AND
 *             the Wikidata description ("Swedish association football player") names that
 *             country's nationality and nobody else's, AND says they are the kind of person the
 *             category means, AND ALL their occupations agree — never a politician or soldier
 *   company   its country AND its head office's country agree, AND the head office's
 *             coordinates fall inside that country's Natural Earth outline, AND its description
 *             names that nationality and no other
 *   place     its coordinates fall inside the country Wikidata names (Natural Earth again), and
 *             it is not inside an area whose sovereignty is disputed
 *   band      where it says it is from AND where it was formed agree
 *   club      its country AND its home city's country agree
 *   summit    the country's highest point, in that country alone, by coordinates too
 *
 * A row that fails is dropped, and the report says how many and why. A question nobody sees
 * is the price of never asking a wrong one.
 *
 * ## What is never a question
 *
 * Politicians, monarchs, soldiers and criminals — the content policy forbids quizzing on
 * leaders and conflicts, and a filter on occupation is the only honest way to enforce it across
 * thousands of rows nobody is going to read one by one. Dishes: origin is the most contested claim
 * a cuisine makes (the hamburger, chips, hummus), and no blocklist of the disputed ones is
 * complete, so there are none. Tobacco, alcohol, weapons, gambling and
 * adult industries. Anything whose name hands over its country ("Swedish meatballs").
 *
 * Run: node scripts/build-fame-facts.cjs
 */

const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const isoCountries = require('i18n-iso-countries')
const worldCountries = require('world-countries')
const { feature } = require('topojson-client')
const d3 = require('d3-geo')
const topology = require('world-atlas/countries-50m.json')

const PACKS = join(__dirname, '..', 'packages', 'content', 'packs', 'geography')
const snapshot = JSON.parse(readFileSync(join(__dirname, 'data', 'fame-snapshot.json'), 'utf8'))
const entities = JSON.parse(readFileSync(join(PACKS, 'entities.countries.v1.json'), 'utf8')).items
const entityByCode = new Map(entities.map((e) => [e.id, e]))
const LOCALES = ['en', 'sv']
const VERIFIED_AT = snapshot.fetchedAt

// ── Natural Earth: is this point inside this country? ───────────────────────────────
const features = feature(topology, topology.objects.countries).features
const featuresByCode = new Map()
topology.objects.countries.geometries.forEach((g, i) => {
  if (g.id === undefined) return
  const code = isoCountries.numericToAlpha2(String(g.id).padStart(3, '0'))
  if (code) featuresByCode.set(code, [...(featuresByCode.get(code) ?? []), features[i]])
})
const parsePoint = (wkt) => {
  const m = /Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i.exec(wkt ?? '')
  return m ? [Number(m[1]), Number(m[2])] : null
}
/**
 * Inside the outline, or within about 15 km of it.
 *
 * The outline is 1:50m: a harbour city on a simplified coast falls in the sea by a few
 * kilometres, and dropping Sydney's Opera House for being wet would throw away the facts
 * this check is most useful for. Eight points on a ring of 0.15° are tried; a point that
 * is further from its own country than that is in another one.
 */
function insideCountry(code, wkt) {
  const p = parsePoint(wkt)
  const fs = featuresByCode.get(code)
  if (!p || !fs) return false
  const probe = [[0, 0]]
  for (let k = 0; k < 8; k++) probe.push([0.15 * Math.cos((k * Math.PI) / 4), 0.15 * Math.sin((k * Math.PI) / 4)])
  return probe.some(([dx, dy]) => fs.some((f) => d3.geoContains(f, [p[0] + dx, p[1] + dy])))
}

/** Is any other country's outline within about 15 km of this point? Then it is not one country's to claim. */
function nearAnotherCountry(code, wkt) {
  const p = parsePoint(wkt)
  if (!p) return true
  const probe = [[0, 0]]
  for (let k = 0; k < 8; k++) probe.push([0.15 * Math.cos((k * Math.PI) / 4), 0.15 * Math.sin((k * Math.PI) / 4)])
  for (const [other, fs] of featuresByCode) {
    if (other === code) continue
    if (probe.some(([dx, dy]) => fs.some((f) => d3.geoContains(f, [p[0] + dx, p[1] + dy])))) return true
  }
  return false
}

// ── categories ────────────────────────────────────────────────────────────────────
const CATEGORY = {
  athlete: ['Q937857', 'Q3665646', 'Q10833314', 'Q11774891', 'Q10871364', 'Q12299841', 'Q378622', 'Q11338576', 'Q11513337', 'Q10843402', 'Q2309784', 'Q2066131'],
  musician: ['Q177220', 'Q639669', 'Q36834', 'Q2252262', 'Q855091', 'Q486748', 'Q130857', 'Q753110', 'Q488205', 'Q183945'],
  actor: ['Q33999', 'Q10800557', 'Q10798782', 'Q2259451', 'Q2526255'],
  scientist: ['Q901', 'Q169470', 'Q593644', 'Q170790', 'Q205375', 'Q11063', 'Q864503'],
  writer: ['Q36180', 'Q6625963', 'Q49757', 'Q214917', 'Q482980'],
  artist: ['Q1028181', 'Q1281618', 'Q42973'],
}
/** Occupations that disqualify a person outright — see "What is never a question". */
const NEVER = new Set(['Q82955', 'Q116', 'Q189290', 'Q1402561', 'Q2159907', 'Q3242115', 'Q372436', 'Q193391', 'Q488111'])

/** How many of each to keep per country: enough to climb, few enough to stay a curriculum. */
const CAP = { company: 25, athlete: 25, musician: 20, actor: 20, scientist: 12, writer: 12, artist: 10, landmark: 20, club: 12, 'highest-point': 1 }

const VOLATILITY = { company: 'slow', club: 'slow' }

const INDUSTRY_NEVER = /tobacco|cigar|alcohol|brewer|beer|distill|wine|liquor|spirits|arms|weapon|firearm|ammunition|defen[cs]e|military|gambl|casino|betting|lotter|adult|erotic|pornograph|cannabis|marijuana/i

/**
 * What a company's own Wikidata types must not say.
 *
 * "Business" in Wikidata's class tree reaches the World Health Organization, Harvard and the
 * Library of Congress, so the types are read. Deliberately NOT on this list: "organization"
 * and "commercial organization", which Toyota, Disney, IBM and McDonald's all carry — a list
 * that dropped a word every real company uses would keep only the obscure ones.
 */
const NOT_A_COMPANY = /universit|college|school|institut|agency|government|ministry|charit|non-?profit|foundation|librar|museum|hospital|international organi[sz]ation|association|federation|league|society|council|committee|authority|bureau|department|laborator|research|think tank|political|church|cooperative|union|football club|sports club/i
/** The same, read off the name, for the rows whose types came back empty. */
const NAMED_LIKE_AN_INSTITUTION = /universit|college|institute|school|hospital|museum|library|academy|ministry|foundation|conservatoire|\bunion\b|\bcommission\b/i

// ── name hygiene ────────────────────────────────────────────────────────────────────
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** Latin letters, marks, spaces and the punctuation names carry — nothing else. */
const LATIN = /^[\p{Script=Latin}\p{M}\s.,'’&\-!:+/]+$/u
const cleanName = (s) => typeof s === 'string' && s.length >= 2 && s.length <= 42 && LATIN.test(s) && !/\d|[()]/.test(s)
/** A shared four-letter opening with the country's name, in either language, hands over the answer. */
const givesAway = (name, code) => {
  const e = entityByCode.get(code)
  const stems = LOCALES.map((l) => fold(e.names[l] ?? e.names.en).slice(0, 4))
  return fold(name).split(/[^\p{L}]+/u).some((w) => w.length >= 4 && stems.includes(w.slice(0, 4)))
}

// ── the description: a second source written by other hands ──────────────────────────
/** What a description may call each country's people or the country itself. */
const ALIASES = {
  GB: ['english', 'scottish', 'welsh', 'northern irish', 'british', 'united kingdom'],
  US: ['american', 'united states'],
  KR: ['south korean', 'korean'],
  KP: ['north korean'],
  CD: ['congolese'],
  CG: ['congolese'],
  CZ: ['czech'],
  NL: ['dutch', 'netherlands'],
  CH: ['swiss', 'switzerland'],
  AE: ['emirati', 'emirian', 'united arab emirates'],
  MM: ['burmese', 'myanmar'],
  CI: ['ivorian', 'ivory coast'],
  PS: [],
}
const termsByCode = new Map()
for (const c of worldCountries) {
  if (!entityByCode.has(c.cca2)) continue
  const terms = new Set([c.name.common, c.demonyms?.eng?.m, c.demonyms?.eng?.f, ...(ALIASES[c.cca2] ?? [])].filter(Boolean).map((t) => t.toLowerCase()))
  termsByCode.set(c.cca2, terms)
}
const has = (text, term) => new RegExp(`(^|[^\\p{L}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(text)
/**
 * Does the description name this country's nationality, and nobody else's?
 *
 * "Swedish association football player" passes for SE. "Kenyan-Mexican actress" fails for
 * both, correctly: a person two countries claim is not a question with one right answer.
 * A description with no nationality at all ("singer") fails too — unverified is not verified.
 */
function nationalityAgrees(code, description) {
  const text = (description ?? '').toLowerCase()
  const own = [...(termsByCode.get(code) ?? [])].filter((t) => has(text, t))
  if (own.length === 0) return 'none'
  for (const [other, terms] of termsByCode) {
    if (other === code) continue
    for (const t of terms) {
      if (own.some((o) => o.includes(t) || t.includes(o))) continue
      if (has(text, t)) return 'conflict'
    }
  }
  return 'ok'
}
/** What the description says a person IS, per category — the same claim the occupations made, from another author. */
const KIND = {
  athlete: /footballer|football player|association football|player|athlete|tennis|boxer|cyclist|driver|swimmer|sprinter|runner|skier|gymnast|cricketer|basketball|hockey|baseball|racing|rower|jumper|wrestler|sportsperson|sportswoman|sportsman|rugby|golfer|skater|fencer|judoka|weightlift|triathlete/,
  musician: /singer|musician|band|group|composer|rapper|guitarist|pianist|\bdj\b|songwriter|record producer|duo|orchestra|conductor|violinist|cellist|vocalist|pop |rock |boy band|girl group|supergroup|ensemble/,
  actor: /actor|actress|film|director|filmmaker|screenwriter|comedian|television|presenter|performer|cinema/,
  scientist: /physicist|chemist|mathematician|scientist|astronomer|biologist|inventor|engineer|physician|geologist|naturalist|astrophysicist|mathematic|economist|psycholog|physiolog/,
  writer: /writer|author|novelist|poet|playwright|dramatist|essayist|children's|fiction|literature|storyteller/,
  artist: /painter|sculptor|architect|artist|illustrator|photographer|designer|printmaker|engraver/,
  company: /company|manufacturer|maker|corporation|brand|retailer|airline|conglomerate|firm|bank|carrier|studio|broadcaster|network|group|holding|chain|producer|operator|supplier|multinational|enterprise|publisher|provider|service|business|carmaker|automaker|restaurant|cooperative|label|agency|shipping|telecommunication|technology|software|electronics|brewer|manufacturing/,
  club: /club|football|soccer|team|sports/,
}
/** Words in a description that mean this is not a person or company a children's app puts in a quiz. */
const DESCRIPTION_NEVER = /murder|convict|terror|criminal|outlaw|bushranger|killer|dictator|politic|president|prime minister|minister|monarch|\bking\b|\bqueen\b|emperor|empress|\bgeneral\b|military|soldier|officer|\bspy\b|fascis|nazi|communis|activist|revolution|extremis|warlord|gangster|mafia|cartel|porn|erotic|escort|sex |black metal|death metal|thrash metal|grindcore|gangsta|horrorcore|drill|neo-?folk|white power|hate|cult|spree|fraud|imprison|assassin|massacre|genocide|wrestler|wwe/i

const dropped = {}
const drop = (attr, why) => { dropped[attr] ??= {}; dropped[attr][why] = (dropped[attr][why] ?? 0) + 1 }

// ── gather candidates per attribute ─────────────────────────────────────────────────
const candidates = Object.fromEntries(Object.keys(CAP).map((k) => [k, []]))
const add = (attr, row) => candidates[attr].push(row)

for (const p of snapshot.persons) {
  if (p.sitelinks < 40) { drop('person', 'fewer than 40 Wikipedia editions'); continue }
  const desc = snapshot.descriptions[p.id]
  if (DESCRIPTION_NEVER.test(desc ?? '')) { drop('person', 'the description says something a quiz should not'); continue }
  const nat = nationalityAgrees(p.code, desc)
  if (nat !== 'ok') { drop('person', nat === 'none' ? 'the description names no nationality' : 'the description names another nationality too'); continue }
  const occ = snapshot.occupations[p.id] ?? []
  if (occ.some((o) => NEVER.has(o))) { drop('person', 'politician, monarch, soldier, criminal or adult performer'); continue }
  const scores = Object.entries(CATEGORY).map(([cat, set]) => [cat, occ.filter((o) => set.includes(o)).length]).sort((a, b) => b[1] - a[1])
  const [best, second] = scores
  if (best[1] === 0) { drop('person', 'no category'); continue }
  if (second[1] === best[1]) { drop('person', 'two categories tie'); continue }
  if (best[1] / occ.length < 0.4) { drop('person', 'not mainly that'); continue }
  if (!KIND[best[0]].test((desc ?? '').toLowerCase())) { drop('person', 'the description says they are something else'); continue }
  add(best[0], p)
}
for (const c of snapshot.companies) {
  if (NAMED_LIKE_AN_INSTITUTION.test(c.en)) { drop('company', 'named like an institution'); continue }
  if ((c.types ?? []).some((t) => NOT_A_COMPANY.test(t))) { drop('company', 'an organisation, not a company'); continue }
  if (c.industry && INDUSTRY_NEVER.test(c.industry)) { drop('company', 'industry not for a children\'s app'); continue }
  if (!insideCountry(c.code, c.coord)) { drop('company', 'head office outside the country by coordinates'); continue }
  const desc = snapshot.descriptions[c.id]
  if (DESCRIPTION_NEVER.test(desc ?? '')) { drop('company', 'the description says something a quiz should not'); continue }
  if (nationalityAgrees(c.code, desc) !== 'ok') { drop('company', 'the description does not name this country alone'); continue }
  if (!KIND.company.test((desc ?? '').toLowerCase())) { drop('company', 'the description says it is something else'); continue }
  add('company', c)
}
const disputed = new Set(snapshot.disputedPlaces)
for (const l of snapshot.landmarks) {
  if (disputed.has(l.id)) { drop('landmark', 'in disputed territory'); continue }
  if (!insideCountry(l.code, l.coord)) { drop('landmark', 'coordinates outside the named country'); continue }
  add('landmark', l)
}
for (const g of snapshot.groups) {
  const desc = snapshot.descriptions[g.id]
  if (DESCRIPTION_NEVER.test(desc ?? '')) { drop('musician', 'the description says something a quiz should not'); continue }
  if (nationalityAgrees(g.code, desc) !== 'ok') { drop('musician', 'the description does not name this country alone'); continue }
  if (!KIND.musician.test((desc ?? '').toLowerCase())) { drop('musician', 'the description says it is something else'); continue }
  add('musician', g)
}
for (const c of snapshot.clubs) {
  const desc = snapshot.descriptions[c.id]
  if (nationalityAgrees(c.code, desc) !== 'ok') { drop('club', 'the description does not name this country alone'); continue }
  if (!KIND.club.test((desc ?? '').toLowerCase())) { drop('club', 'the description says it is something else'); continue }
  add('club', c)
}
for (const h of snapshot.highestPoints) {
  if (!insideCountry(h.code, h.coord)) { drop('highest-point', 'coordinates outside the named country'); continue }
  // A summit on a border is on two countries' claims: Everest, Mont Blanc. Clear of every other outline or not asked.
  if (nearAnotherCountry(h.code, h.coord)) { drop('highest-point', 'on or near a border'); continue }
  add('highest-point', h)
}

// ── choose, rank, tier ──────────────────────────────────────────────────────────────
/** Difficulty from where a fact sits in its own attribute's fame ranking. Geography owns 1. */
const tierOf = (percentile) => (percentile < 0.1 ? 2 : percentile < 0.3 ? 3 : percentile < 0.55 ? 4 : 5)

const SOURCE_NAME = {
  company: 'company', athlete: 'athlete', musician: 'musician or band', actor: 'screen performer or director', scientist: 'scientist',
  writer: 'writer', artist: 'artist', landmark: 'place', club: 'football club', 'highest-point': 'mountain',
}

const packs = {}
const report = []
for (const [attr, rows] of Object.entries(candidates)) {
  const seenNames = new Map()
  const kept = []
  for (const r of rows.sort((a, b) => b.sitelinks - a.sitelinks)) {
    if (!cleanName(r.en)) { drop(attr, 'name is not plain Latin text'); continue }
    if (attr !== 'highest-point' && givesAway(r.en, r.code)) { drop(attr, 'name gives the country away'); continue }
    // The same name twice in one attribute is a question with two right countries.
    if (seenNames.has(fold(r.en))) { drop(attr, 'same name as a better-known entry'); continue }
    seenNames.set(fold(r.en), true)
    kept.push(r)
  }
  // Top N per country, by fame. The tail a player reaches late is each country's Nth, so N is
  // what sets how far the climb goes, not how many facts the file can hold.
  const perCountry = new Map()
  const chosen = kept.filter((r) => {
    const n = perCountry.get(r.code) ?? 0
    if (n >= CAP[attr]) { drop(attr, `beyond the top ${CAP[attr]} for its country`); return false }
    perCountry.set(r.code, n + 1)
    return true
  })
  chosen.sort((a, b) => b.sitelinks - a.sitelinks)

  const items = chosen.map((r, rank) => {
    const svName = r.sv && cleanName(r.sv) ? r.sv : r.en
    return {
      id: `geo.${r.code}.${attr}-${r.id.toLowerCase()}`,
      entity: r.code,
      attribute: attr,
      value: { id: r.id, names: { en: r.en, sv: svName } },
      difficulty: tierOf(rank / chosen.length),
      tags: [attr, entityByCode.get(r.code).region, 'fame'],
      source: {
        name: `Wikidata, “${r.en}” (${r.id}), CC0 — a ${SOURCE_NAME[attr]}; ranked by the ${r.sitelinks} Wikipedia language editions that have an article on it`,
        url: `https://www.wikidata.org/wiki/${r.id}`,
        verifiedAt: VERIFIED_AT,
      },
      volatility: VOLATILITY[attr] ?? 'stable',
    }
  })
  packs[attr] = items
  const byTier = [2, 3, 4, 5].map((t) => items.filter((i) => i.difficulty === t).length)
  report.push({ attr, total: items.length, countries: new Set(items.map((i) => i.entity)).size, byTier, top: chosen.slice(0, 4).map((r) => `${r.en} (${r.code}, ${r.sitelinks})`).join('; '), bottom: chosen.slice(-2).map((r) => `${r.en} (${r.code}, ${r.sitelinks})`).join('; ') })
}

// ── write ───────────────────────────────────────────────────────────────────────────
for (const [attr, items] of Object.entries(packs)) {
  const name = attr === 'highest-point' ? 'highest-points' : attr === 'company' ? 'companies' : `${attr}s`
  const body = {
    $schema: '../../schema/pack.schema.json',
    $comment:
      'Generated by scripts/build-fame-facts.cjs from the Wikidata snapshot in scripts/data/fame-snapshot.json (CC0). Difficulty is MEASURED: facts are ranked inside this attribute by the number of Wikipedia language editions with an article, and cut into the scale the lesson ramp climbs. Served by the Worker only — see `delivery`.',
    packId: `geography.facts.${name}`,
    version: '1.0.0',
    subject: 'geography',
    kind: 'facts',
    delivery: 'server',
    volatilityReviewed: true,
    locales: LOCALES,
    license: 'CC-BY-4.0',
    generatedAt: VERIFIED_AT,
    items,
  }
  writeFileSync(join(PACKS, `facts.${name}.v1.json`), `${JSON.stringify(body)}\n`)
}

console.log('\nFame facts (measured difficulty: 2 = best known … 5 = deepest cut)\n')
let total = 0
for (const r of report) {
  total += r.total
  console.log(`  ${r.attr.padEnd(14)} ${String(r.total).padStart(5)} facts  ${String(r.countries).padStart(3)} countries   tiers 2/3/4/5: ${r.byTier.join(' / ')}`)
  console.log(`      best  ${r.top}\n      least ${r.bottom}`)
}
console.log(`\n  total ${total}\n\n  dropped, and why:`)
for (const [attr, reasons] of Object.entries(dropped)) {
  for (const [why, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`    ${attr.padEnd(14)} ${String(n).padStart(5)}  ${why}`)
}
console.log()
