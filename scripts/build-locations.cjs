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
 * Display names per CONTINENT, en + sv.
 *
 * ## Why this replaced the subregion table
 *
 * The fact used to restate `subregion`, and that produced a question a child could answer
 * knowing nothing. Europe, Asia and Africa are split into four, three and four subregions;
 * North America, South America and Oceania are one apiece. So `same-region` distractors
 * were impossible for those three, the `other-values` fallback pulled from the whole value
 * set, and the shipped question was:
 *
 *     Where in the world is Argentina?
 *       Western Europe / Northern Europe / Southern Europe / [South America]
 *
 * Three European subregions against one continent. The answer is the only option at the
 * right scale, so it is free — and it was free for every country in the Americas and
 * Oceania, which is nineteen of sixty-five. That is worse than no question: it teaches a
 * ten-year-old that guessing the odd one out works.
 *
 * The mixing was the bug, not the fallback. A four-option question has to offer four
 * options at ONE scale, and the scale this file already claimed in its own citation is the
 * seven-continent model. So the value is the continent now, the citation is true rather
 * than aspirational, and the country screen's label reads "Continent" because that is what
 * the answer is.
 *
 * The finer question — "which part of Asia is Japan in?" — is worth having and is NOT this
 * file. It needs its own attribute, and it needs the prompt to NAME the continent, or the
 * same free-answer bug comes straight back: Asia has three subregions, so a four-option
 * question there must borrow a fourth from somewhere, and "Western Europe" among Japan's
 * options is the odd-one-out giveaway again. Naming the continent in the prompt is a
 * template-parameter change, so it is a separate piece of work rather than a line here.
 *
 * In the PACK rather than in i18n, because a fact value is content: `packages/i18n`
 * holds the app's chrome, and a fact's answer is translated where the fact lives. Same
 * rule as a country name.
 */
const CONTINENTS = {
  AF: { id: 'africa', en: 'Africa', sv: 'Afrika' },
  AN: { id: 'antarctica', en: 'Antarctica', sv: 'Antarktis' },
  AS: { id: 'asia', en: 'Asia', sv: 'Asien' },
  EU: { id: 'europe', en: 'Europe', sv: 'Europa' },
  NA: { id: 'north-america', en: 'North America', sv: 'Nordamerika' },
  OC: { id: 'oceania', en: 'Oceania', sv: 'Oceanien' },
  SA: { id: 'south-america', en: 'South America', sv: 'Sydamerika' },
}

/**
 * Four options need four members. Enforced at the bottom of this file, with an exit.
 *
 * It decides whether a value can fill a question at all: a group holding three countries
 * cannot supply four distinct answer options, and the composer would drop those questions
 * silently rather than loudly.
 *
 * It never fired on the subregion values because none of them was thin — every subregion
 * has at least four members. That is why this guard passed while the questions were still
 * broken: the count was never the problem, the mixed SCALE was, and a member-count check
 * cannot see the difference between four subregions and four continents.
 */
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

// A continent with no display name would ship a raw code like "OC" as an answer option.
// Loudly, rather than as a slug in front of a child.
const unnamed = [...new Set(entities.map((e) => e.region))].filter((r) => !(r in CONTINENTS))
if (unnamed.length > 0) {
  console.error(
    `✗ no display name for: ${unnamed.join(', ')}\n` +
      '  Add them to CONTINENTS above, in en AND sv. A missing name ships the key.',
  )
  process.exit(1)
}

/**
 * Countries whose own NAME contains their continent, which cannot be asked this.
 *
 * "Where in the world is South Africa?" answers itself, in English and in Swedish
 * ("Sydafrika" / "Afrika"). `isSelfAnswering` in the composer catches it and refuses to
 * build the question — correctly — and that refusal is what makes the fact unshippable
 * rather than merely imperfect: `tpl.country-to-map.mc4` hangs on this same attribute and
 * has no such problem, so keeping the fact gives a sighted user a location question for
 * South Africa and a screen-reader user none. That is the exact parity failure
 * `thesis.test.ts` exists to refuse, and it has no waiver, because a silent one is how the
 * gap it was written for stayed open for thirty countries.
 *
 * So the fact is not generated at all. South Africa loses its location question and its
 * map question together, which is two of five hundred and seventy-nine and is the honest
 * price: the alternative is a question a child answers by reading it.
 *
 * Checked against every shipped locale, and accent-insensitively, because the next pack to
 * hit this will not be an English one.
 */
const strip = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const namesItself = (e) =>
  ['en', 'sv'].some((loc) => {
    const name = e.names[loc]
    const continent = CONTINENTS[e.region][loc]
    return name !== undefined && strip(name).includes(strip(continent))
  })

const selfAnswering = entities.filter(namesItself)
const askable = entities.filter((e) => !namesItself(e))

const counts = {}
for (const e of askable) counts[e.region] = (counts[e.region] ?? 0) + 1


const items = [...askable]
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((e) => ({
    /**
     * `continent`, not `location` — and the attribute below stays `location`.
     *
     * A fact id ships in save data: `review_log` and `user_facts` are keyed by it, and
     * FSRS remembers what a learner knows about `geo.SE.location`. That fact used to
     * answer "Northern Europe" and now answers "Europe", so keeping the id would tell
     * the scheduler somebody had mastered an answer they have never once been shown.
     * A changed answer under an old id is worse than a rename; it is a rename pretending
     * not to be one. New id, fresh memory, honest.
     *
     * The ATTRIBUTE is deliberately not renamed with it. Templates are attribute-shaped
     * and never geography-shaped — the note at the top of the templates pack is emphatic
     * about it — and `location` is the generic concept ("where is this entity") that an
     * astronomy pack answers with a galaxy arm. `continent` is geography, and putting it
     * in the template layer is exactly the leak that rule exists to stop.
     *
     * So the id says what this fact asserts and the attribute says what shape of question
     * it is. The schema documents the third segment as a slug rather than as the
     * attribute for this reason.
     *
     * ## What happens to the `geo.<CC>.location` rows
     *
     * Nothing, and that is the whole plan, because the app has not launched: there are no
     * `review_log` or `user_facts` rows carrying the old id anywhere but on a developer's
     * simulator, and a migration written to move zero rows is a migration nobody can test.
     *
     * The behaviour if a row does exist is still defined rather than accidental. Both
     * tables are keyed by fact id and neither has a foreign key into the packs — the packs
     * ship in the binary, so there is nothing for the database to reference — so an
     * orphaned row is simply a memory of a fact no template can now produce. It is never
     * scheduled, never shown, and never counted, because item selection walks the content
     * index and the index has no such fact. It is dead weight, not a wrong answer.
     *
     * Should this happen again AFTER launch, the answer is different and is not a rename:
     * write a forward-only migration that DELETES the old rows rather than repointing
     * them, for the reason above — the answer changed, so the old memory is about a
     * question the learner was never asked.
     */
    id: `geo.${e.id}.continent`,
    entity: e.id,
    attribute: 'location',
    value: {
      id: CONTINENTS[e.region].id,
      names: { en: CONTINENTS[e.region].en, sv: CONTINENTS[e.region].sv },
    },
    difficulty: difficultyFor(e.id),
    // The subregion stays as a TAG. It is still true, it is still useful for selecting
    // and reporting, and it is no longer the answer to a four-option question.
    tags: ['location', CONTINENTS[e.region].id, e.subregion, 'core'],
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
        'Which CONTINENT each country is on, as a fact rather than a field. Derived ' +
        'MECHANICALLY from `region` in entities.countries.v1.json — this file invents no ' +
        'geography, it ' +
        'restates what the entity pack already declares so the composer can quiz it. ' +
        'Regenerate with `pnpm build:locations` whenever a country is added; hand-editing one ' +
        "row would let a country's location fact disagree with its own entity, which is a " +
        'wrong fact of the worst kind: quietly wrong, and only on one screen. ' +
        "The GROUPING is this app's own, not UN M49 — M49 places Cuba and Mexico in 'Latin " +
        "America and the Caribbean' while this pack groups them under North America, which is " +
        'true continentally and is what a ten-year-old is taught. Citing M49 would therefore ' +
        'be a false citation, and so would citing the entities pack: a fact whose source is ' +
        'another file in this repository has no external provenance at all, and the validator ' +
        'now refuses one. So each row names the classification as WHAT IT IS — an editorial ' +
        'choice, made here — and cites the seven-continent model it rests on. The derivation ' +
        'is mechanical; the classification being derived is a judgement, and the citation ' +
        'describes the judgement rather than the copy step. ' +
        'It restated `subregion` until it was first loaded by the app, at which point the ' +
        'preview showed why that could not work: Europe, Asia and Africa split into ' +
        'subregions and the Americas and Oceania do not, so nineteen of sixty-five ' +
        'countries got a question whose only option at the right scale was the right one ' +
        '("Where in the world is Argentina? Western Europe / Northern Europe / Southern ' +
        'Europe / South America"). One scale per question; the subregion is now a tag. ' +
        'Every fact here is `stable` by construction — the value is which continent a ' +
        'country sits in, and a continent does not move. Grading them per row would be ' +
        'grading the projection rather than its source, which is why `volatilityReviewed` ' +
        'is set below.',
      /**
       * The uniformity opt-out, EMITTED rather than added by hand.
       *
       * `content:validate` warns when every row in a pack shares one volatility tag,
       * because that is usually a tag nobody graded — and it is right to, but here the
       * uniformity is a property of the data: a projection of `subregion` cannot have
       * rows that go stale at different rates. It was added to the pack by hand once,
       * and the next `pnpm build:locations` deleted it, because a generated file only
       * contains what its generator emits. A hand edit to a generated file is a change
       * with a scheduled expiry date.
       */
      volatilityReviewed: true,
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

console.log(`Locations → ${items.length} facts across ${Object.keys(counts).length} continents\n`)
for (const e of selfAnswering) {
  console.log(`  skipped ${e.id.padEnd(3)} ${e.names.en} — the name contains its own continent`)
}
if (selfAnswering.length > 0) console.log('')
for (const [region, n] of Object.entries(counts).sort()) {
  console.log(`  ${region.padEnd(18)} ${n}${n < MIN_MEMBERS ? '  ← too thin for a 4-option question' : ''}`)
}
if (thin.length > 0) {
  console.error(
    `\n✗ ${thin.length} continent(s) have fewer than ${MIN_MEMBERS} members.\n` +
      '  "Where is X?" cannot fill four options from a continent nobody else is on, and the\n' +
      '  composer would drop those questions silently. Add countries, or the facts are inert.',
  )
  process.exit(1)
}
console.log(`\n✓ wrote ${items.length} location facts`)
