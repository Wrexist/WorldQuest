#!/usr/bin/env node
/**
 * The Wikipedia article title of every row in the fame snapshot, in English and Swedish.
 *
 * ## Why a second name source
 *
 * The snapshot carries Wikidata's LABEL, and a label is edited by anyone, checked by no one,
 * and read by almost nobody — so it is where a slip survives. A content audit (2026-10-11)
 * compared all 3,778 names with Wikipedia and found "Andrcu Onana" for André Onana, "Takuma
 * ano" for Takuma Asano and "Rafael Márquez El piojo" with a nickname glued on. An article
 * title is the opposite: it is the name the most-read page on the subject is filed under,
 * chosen by Wikipedia's common-name rule and defended by every editor who links to it. It is
 * also the name a learner knows: "Real Madrid CF", not "Real Madrid Club de Fútbol".
 *
 * So `build-fame-facts.cjs` prefers the title and falls back to the label — except where the
 * title carries a qualifier, which is kept out of this file entirely. "Liverpool F.C.
 * (Montevideo)" stripped of its brackets is a different, more famous club, asked about as if it
 * were Uruguayan; "Istiqlal Mosque, Jakarta" names the city, a clue the label never gave. In
 * both the label is the safer name. A title is a name, not prose, so there is no licence to
 * carry; the source stays the Wikidata row it describes.
 *
 * Run: node scripts/fetch-fame-titles.cjs   (writes scripts/data/fame-titles.json; review the diff)
 */

const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const snapshot = JSON.parse(readFileSync(join(__dirname, 'data', 'fame-snapshot.json'), 'utf8'))
const ids = [...new Set(Object.values(snapshot).filter(Array.isArray).flat().map((r) => r?.id).filter((id) => /^Q\d+$/.test(id ?? '')))]
/** A plain title, or nothing: a bracketed or comma qualifier means the label is safer. */
const plain = (title) => (title === undefined || /[(),]/.test(title) ? undefined : title)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const titles = {}
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks&sitefilter=enwiki|svwiki&ids=${batch.join('|')}`
    let json
    for (let attempt = 0; attempt < 4 && json === undefined; attempt++) {
      try {
        const response = await fetch(url, { headers: { 'User-Agent': 'WorldQuest content build (https://github.com/Wrexist/WorldQuest)' } })
        json = await response.json()
      } catch {
        await sleep(2000)
      }
    }
    if (json === undefined) throw new Error(`could not fetch ${batch[0]}…`)
    for (const id of batch) {
      const links = json.entities?.[id]?.sitelinks ?? {}
      const en = plain(links.enwiki?.title)
      const sv = plain(links.svwiki?.title)
      if (en !== undefined || sv !== undefined) titles[id] = { ...(en ? { en } : {}), ...(sv ? { sv } : {}) }
    }
    await sleep(250)
  }
  const sorted = Object.fromEntries(Object.entries(titles).sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1))))
  writeFileSync(join(__dirname, 'data', 'fame-titles.json'), JSON.stringify({ fetchedAt: new Date().toISOString().slice(0, 10), source: 'Wikipedia article titles via Wikidata sitelinks', titles: sorted }, null, 1) + '\n')
  console.log(`${Object.keys(sorted).length} of ${ids.length} rows have a Wikipedia title`)
})().catch((error) => {
  console.error('✗', error)
  process.exit(1)
})
