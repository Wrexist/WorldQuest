#!/usr/bin/env node
/**
 * What else a person might type for a country.
 *
 * A typed answer ("Which country is Toyota from?") is judged against the country's names, and
 * a country has more than two of them: the United States is also "USA", "United States of
 * America" and "the States"; Côte d'Ivoire is "Ivory Coast"; the Czech Republic is Czechia.
 * Marking "USA" wrong would teach a ten-year-old that they do not know where Toyota's rival
 * Ford is from, which is the one outcome a recall exercise must not have.
 *
 * ## Where they come from
 *
 * `world-countries` (the reference the crosscheck already uses): the official name, the ISO
 * alpha-3 code, its list of alternative spellings, and the Swedish forms. Nothing is typed in
 * by hand, for the reason every generator here gives.
 *
 * ## The rule that makes it safe: an alias belongs to one country
 *
 * An alias is dropped if, once case, accents and punctuation are folded (the same fold the
 * judge applies), it is also any country's name or any OTHER country's alias. "Guinea" is an
 * alternative spelling of nothing and a real country, so it can never become a right answer for
 * Equatorial Guinea or Guinea-Bissau; "Congo" is a name two countries share, so neither gets it.
 * Two-letter codes are kept ("UK" is how half the world says Great Britain) and judged exactly, never
 * within a typo: the fold plus the one-country rule is what stops "NO" or "IS" from meaning two things.
 *
 * Run: node scripts/build-aliases.cjs
 */

const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const worldCountries = require('world-countries')

const FILE = join(__dirname, '..', 'packages', 'content', 'packs', 'geography', 'entities.countries.v1.json')
const raw = readFileSync(FILE, 'utf8')
const crlf = raw.includes('\r\n')
const pack = JSON.parse(raw)

/** The judge's fold, restated: this must agree with `normaliseTyped` in the engines. */
const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[''`´.,;:!?()[\]{}"“”+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|der|die|das|le|la|les|el|los|las|il|lo|den|det|en|ett) /, '')

const ref = new Map(worldCountries.map((c) => [c.cca2, c]))

// What every country is already called, in both locales, and whose it is.
const owner = new Map()
for (const e of pack.items) for (const name of Object.values(e.names)) owner.set(fold(name), new Set([...(owner.get(fold(name)) ?? []), e.id]))
for (const e of pack.items) for (const name of Object.values(e.namesInSentence ?? {})) owner.set(fold(name), new Set([...(owner.get(fold(name)) ?? []), e.id]))

const candidates = new Map()
for (const e of pack.items) {
  const c = ref.get(e.id)
  if (!c) continue
  const raw = [c.name.common, c.name.official, c.cca2, c.cca3, ...(c.altSpellings ?? []), c.translations?.swe?.common, c.translations?.swe?.official]
  const list = []
  for (const name of raw) {
    if (typeof name !== 'string') continue
    const key = fold(name)
    if (key.length < 2) continue
    list.push([key, name])
  }
  candidates.set(e.id, list)
}

// Count how many countries each folded candidate is claimed by, names included.
const claims = new Map(owner)
for (const [id, list] of candidates) for (const [key] of list) claims.set(key, new Set([...(claims.get(key) ?? []), id]))

let added = 0
let dropped = 0
for (const e of pack.items) {
  const own = new Set(Object.values(e.names).concat(Object.values(e.namesInSentence ?? {})).map(fold))
  const seen = new Set(own)
  const aliases = []
  for (const [key, name] of candidates.get(e.id) ?? []) {
    if (seen.has(key)) continue
    seen.add(key)
    if ((claims.get(key)?.size ?? 0) !== 1) { dropped++; continue }
    aliases.push(name)
  }
  if (aliases.length > 0) { e.aliases = aliases.slice(0, 6); added += e.aliases.length } else delete e.aliases
}

const text = `${JSON.stringify(pack, null, 2)}\n`
writeFileSync(FILE, crlf ? text.replace(/\n/g, '\r\n') : text)
console.log(`\nAliases: ${added} written across ${pack.items.filter((e) => e.aliases).length} countries; ${dropped} dropped for belonging to more than one.\n`)
for (const id of ['US', 'GB', 'CI', 'CZ', 'GN', 'GQ', 'CD', 'CG']) {
  const e = pack.items.find((x) => x.id === id)
  console.log(`  ${id}  ${e?.aliases?.join(' | ') ?? '—'}`)
}
console.log()
