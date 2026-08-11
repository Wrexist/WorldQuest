/**
 * Phase 1 exit criterion 4, as an executable test.
 *
 *   "Adding a sixth country requires editing ONE JSON file and nothing else."
 *
 * The whole architecture is a bet that content is data. This file is where the bet
 * gets settled: it loads the real packs off disk, adds a country the way an author
 * would, and asserts that questions appear with no code change. If it ever fails,
 * the abstraction has leaked and the answer is to fix the abstraction — not to make
 * the test more forgiving.
 *
 * See docs/plan/build-order.md and docs/product/roadmap.md.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { seededRng } from '../shared/index.js'
import {
  buildIndex,
  buildQuestion,
  isAmbiguous,
  isSelfAnswering,
  itemsForFact,
} from './index.js'
import type { Entity, Fact, Template } from './types.js'

const packsDir = join(import.meta.dirname, '..', '..', '..', 'content', 'packs', 'geography')
const read = <T>(file: string): T[] =>
  (JSON.parse(readFileSync(join(packsDir, file), 'utf8')) as { items: T[] }).items

const entities = read<Entity>('entities.countries.v1.json')
/**
 * EVERY fact pack, not a chosen two.
 *
 * This loaded capitals and flags only, and several tests below iterate `templates` and
 * `continue` past any template with no items — so a template whose attribute was not in
 * this list was skipped in silence. `tpl.country-to-map.mc4` landed and every locator
 * and presentation assertion stepped over it, which is the "guard that could never
 * fail" shape this repo has now been bitten by four times.
 *
 * A pack added here is a pack the whole file starts checking. That is the point.
 */
const facts = [
  ...read<Fact>('facts.capitals.v1.json'),
  ...read<Fact>('facts.flags.v1.json'),
  ...read<Fact>('facts.currencies.v1.json'),
  ...read<Fact>('facts.locations.v1.json'),
  ...read<Fact>('facts.languages.v1.json'),
  ...read<Fact>('facts.calling-codes.v1.json'),
]
const templates = read<Template>('templates.v1.json')

const index = buildIndex({ entities, facts, templates })

describe('the platform thesis', () => {
  it('generates far more items than facts, from templates alone', () => {
    // Every authored fact × the templates that match its attribute. The ratio is the
    // architecture's whole claim, and it has held from 9 facts to 120: hand-writing
    // this many questions is exactly the work the design exists to avoid.
    expect(index.items.length).toBeGreaterThan(facts.length)
    expect(index.items.length).toBeGreaterThanOrEqual(16)
  })

  it('adds a whole country with no code change', () => {
    // Precisely what an author does: append to entities and facts. No new template,
    // no new component, no engine edit.
    const iceland: Entity = {
      id: 'IS',
      type: 'country',
      names: { en: 'Iceland', sv: 'Island' },
      region: 'EU',
      subregion: 'northern-europe',
      assets: { flag: { path: 'flags/IS.svg', license: 'public-domain' } },
    }
    const icelandFacts: Fact[] = [
      {
        id: 'geo.IS.capital',
        entity: 'IS',
        attribute: 'capital',
        value: { id: 'IS-1', names: { en: 'Reykjavík', sv: 'Reykjavik' } },
        difficulty: 2,
        tags: ['capital', 'europe', 'northern-europe', 'core'],
        volatility: 'stable',
      },
      {
        id: 'geo.IS.flag',
        entity: 'IS',
        attribute: 'flag',
        value: {
          id: 'flag-IS',
          names: {
            en: 'a red Nordic cross outlined in white on a blue field',
            sv: 'ett rött nordiskt kors med vit kant på blå botten',
          },
        },
        difficulty: 3,
        tags: ['flag', 'europe', 'nordic-cross', 'core', 'commonly-confused'],
        volatility: 'stable',
      },
    ]

    const grown = buildIndex({
      entities: [...entities, iceland],
      facts: [...facts, ...icelandFacts],
      templates,
    })

    // The new country produces questions immediately.
    expect(grown.items.length).toBeGreaterThan(index.items.length)
    expect(grown.itemsByFact.get('geo.IS.capital')?.length).toBeGreaterThan(0)
    expect(grown.itemsByFact.get('geo.IS.flag')?.length).toBeGreaterThan(0)

    // The same new fact is immediately askable in both directions, because the
    // templates are attribute-shaped and simply matched it.
    const forward = grown
      .itemsByFact.get('geo.IS.capital')!
      .find((i) => i.templateId === 'tpl.capital.mc4')!
    const reverse = grown
      .itemsByFact.get('geo.IS.capital')!
      .find((i) => i.templateId === 'tpl.capital-reverse.mc4')!

    const forwardQ = buildQuestion(grown, forward, 'en', seededRng(1))!
    expect(forwardQ.options.find((o) => o.isCorrect)?.label).toBe('Reykjavík')
    expect(forwardQ.options).toHaveLength(4)

    const reverseQ = buildQuestion(grown, reverse, 'en', seededRng(1))!
    expect(reverseQ.options.find((o) => o.isCorrect)?.label).toBe('Iceland')

    // Both presentations schedule the SAME fact — one piece of knowledge, two ways
    // of asking. This is why user_facts is keyed on the fact, not the item.
    expect(forward.factId).toBe(reverse.factId)
  })

  it('would accept an entirely different subject through the same templates', () => {
    // v3.0 in miniature. Templates are attribute-shaped, not geography-shaped, so a
    // wildlife pack reuses tpl.capital.mc4's structure with zero engine changes.
    // If this test ever needs an engine change to pass, v3.0 just became a rewrite.
    const species: Entity[] = [
      { id: 'PANTHERA-LEO', type: 'species', names: { en: 'Lion' }, region: 'AF', subregion: 'savanna' },
      { id: 'PANTHERA-TIGRIS', type: 'species', names: { en: 'Tiger' }, region: 'AS', subregion: 'jungle' },
      { id: 'PANTHERA-ONCA', type: 'species', names: { en: 'Jaguar' }, region: 'SA', subregion: 'rainforest' },
      { id: 'PANTHERA-PARDUS', type: 'species', names: { en: 'Leopard' }, region: 'AF', subregion: 'savanna' },
    ]
    const habitatFacts: Fact[] = species.map((s, i) => ({
      id: `wild.${s.id}.habitat`,
      entity: s.id,
      attribute: 'habitat',
      value: { names: { en: ['Savanna', 'Jungle', 'Rainforest', 'Grassland'][i]! } },
      difficulty: 2,
      tags: ['habitat', 'core'],
      volatility: 'stable',
    }))
    const habitatTemplate: Template = {
      id: 'tpl.habitat.mc4',
      attribute: 'habitat',
      modality: 'text',
      prompt: { key: 'lesson:prompt.habitat_of', params: ['entityName'] },
      answer: { from: 'fact.value.names' },
      distractors: { count: 3, strategy: 'same-region', fallback: 'random-global' },
      a11y: { screenReaderSafe: true },
    }

    const wildlife = buildIndex({
      entities: species,
      facts: habitatFacts,
      templates: [habitatTemplate],
    })

    expect(wildlife.items).toHaveLength(4)
    const item = itemsForFact(wildlife, 'wild.PANTHERA-LEO.habitat', seededRng(2))[0]!
    const question = buildQuestion(wildlife, item, 'en', seededRng(2))!
    expect(question.promptKey).toBe('lesson:prompt.habitat_of')
    expect(question.promptParams['entityName']).toBe('Lion')
    expect(question.options.find((o) => o.isCorrect)?.label).toBe('Savanna')
  })
})

describe('question construction', () => {
  it('never offers the same label twice', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const item of index.items) {
        const q = buildQuestion(index, item, 'en', seededRng(seed))
        if (!q) continue
        const labels = q.options.map((o) => o.label.toLowerCase())
        expect(new Set(labels).size, `${item.id} has duplicate options`).toBe(labels.length)
      }
    }
  })

  it('always includes exactly one correct option', () => {
    for (const item of index.items) {
      const q = buildQuestion(index, item, 'en', seededRng(7))
      if (!q) continue
      expect(q.options.filter((o) => o.isCorrect)).toHaveLength(1)
    }
  })

  it('does not always place the correct answer in the same slot', () => {
    // Users learn positions faster than they learn facts.
    const item = index.itemsByFact.get('geo.SE.capital')![0]!
    const positions = new Set(
      Array.from({ length: 30 }, (_, seed) =>
        buildQuestion(index, item, 'en', seededRng(seed))!.options.findIndex((o) => o.isCorrect),
      ),
    )
    expect(positions.size).toBeGreaterThan(1)
  })

  it('is deterministic for a given seed', () => {
    // Friend challenges hand both players the same seed and must get the same quiz.
    const item = index.items[0]!
    const a = buildQuestion(index, item, 'en', seededRng(99))
    const b = buildQuestion(index, item, 'en', seededRng(99))
    expect(a).toEqual(b)
  })

  it('localises prompts and options', () => {
    const item = index.itemsByFact.get('geo.DK.capital')!.find((i) => i.templateId === 'tpl.capital.mc4')!
    const sv = buildQuestion(index, item, 'sv', seededRng(3))!
    expect(sv.options.find((o) => o.isCorrect)?.label).toBe('Köpenhamn')

    const en = buildQuestion(index, item, 'en', seededRng(3))!
    expect(en.options.find((o) => o.isCorrect)?.label).toBe('Copenhagen')
  })

  it('emits an i18n key and params, never a built sentence', () => {
    // A pre-assembled prompt cannot be translated correctly into most languages.
    for (const item of index.items) {
      const q = buildQuestion(index, item, 'en', seededRng(5))
      if (!q) continue
      expect(q.promptKey).toMatch(/^lesson:/)
      expect(q.promptKey).not.toContain(' ')
    }
  })

  it('never emits a hint that just repeats the answer', () => {
    // Produced "Stockholm is Stockholm." on the wrong-answer screen. A hint must
    // add information or be absent.
    for (const item of index.items) {
      const q = buildQuestion(index, item, 'en', seededRng(13))
      if (!q?.hint) continue
      const correct = q.options.find((o) => o.isCorrect)!.label
      expect(q.hint.toLowerCase(), `${item.id} hint repeats its answer`).not.toBe(
        correct.toLowerCase(),
      )
    }
  })

  it('gives a hint only when it adds something the question did not', () => {
    const hintOf = (factId: string, templateId: string): string | undefined =>
      buildQuestion(
        index,
        index.itemsByFact.get(factId as never)!.find((i) => i.templateId === templateId)!,
        'en',
        seededRng(1),
      )!.hint

    // The case the wrong-answer copy was designed around: the user saw a flag, chose
    // wrongly, and the hint puts words to the picture they were looking at.
    expect(hintOf('geo.SE.flag', 'tpl.flag-to-country.mc4')).toContain('Nordic cross')

    // Its screen-reader sibling asks the SAME fact by stating the description in the
    // prompt — so the hint would be the question read back. No information is lost:
    // the sighted user's hint is what the blind user was already given.
    expect(hintOf('geo.SE.flag', 'tpl.flag-describe.mc4')).toBeUndefined()

    // "What is the capital of Sweden?" — the answer IS the fact value, so a hint
    // built from it says "Stockholm is Stockholm."
    expect(hintOf('geo.SE.capital', 'tpl.capital.mc4')).toBeUndefined()

    // "Stockholm is the capital of which country?" — the fact value is in the
    // PROMPT this time, so the hint says "Sweden is Stockholm." Found by
    // `pnpm content:preview`, which exists to be read.
    expect(hintOf('geo.SE.capital', 'tpl.capital-reverse.mc4')).toBeUndefined()
  })

  it('refuses a reverse question whose answer is not unique', () => {
    // "Which country uses the Euro?" has twenty correct answers, and no choice of
    // distractors fixes it: even with every shown option wrong but one, the user knows
    // Germany would also have been right. content-pipeline.md states it as a hard rule
    // — "never a distractor that is also a correct answer" — and it had only ever been
    // enforced for options rendering as the same STRING, which is far weaker.
    const shared: Fact[] = ['SE', 'NO'].map((code) => ({
      id: `geo.${code}.currency`,
      entity: code,
      attribute: 'currency',
      value: { names: { en: 'Krona' } },
      difficulty: 2,
      tags: ['currency', 'core'],
      volatility: 'stable',
    }))
    const reverse: Template = {
      id: 'tpl.currency-reverse.mc4',
      attribute: 'currency',
      modality: 'text',
      prompt: { key: 'lesson:prompt.currency_reverse', params: ['valueName'] },
      answer: { from: 'entity.names' },
      distractors: { count: 3, strategy: 'same-region' },
      a11y: { screenReaderSafe: true },
    }

    const built = buildIndex({ entities, facts: [...facts, ...shared], templates: [reverse] })
    const item = built.itemsByFact.get('geo.SE.currency')![0]!
    expect(isAmbiguous(built, item, 'en')).toBe(true)
    expect(buildQuestion(built, item, 'en', seededRng(1))).toBeNull()
  })

  it('still asks a reverse question when the value identifies one country', () => {
    // The guard must not swallow the whole template — a currency only one country uses
    // is exactly the question worth asking.
    const unique: Fact[] = [
      {
        id: 'geo.SE.currency',
        entity: 'SE',
        attribute: 'currency',
        value: { names: { en: 'Swedish krona' } },
        difficulty: 2,
        tags: ['currency', 'core'],
        volatility: 'stable',
      },
    ]
    const reverse: Template = {
      id: 'tpl.currency-reverse.mc4',
      attribute: 'currency',
      modality: 'text',
      prompt: { key: 'lesson:prompt.currency_reverse', params: ['valueName'] },
      answer: { from: 'entity.names' },
      distractors: { count: 3, strategy: 'same-region' },
      a11y: { screenReaderSafe: true },
    }
    const built = buildIndex({ entities, facts: [...facts, ...unique], templates: [reverse] })
    const item = built.itemsByFact.get('geo.SE.currency')![0]!
    expect(isAmbiguous(built, item, 'en')).toBe(false)
    expect(buildQuestion(built, item, 'en', seededRng(1))).not.toBeNull()
  })

  it('leaves the FORWARD direction askable even when the value is shared', () => {
    // "What is the currency of Sweden?" has one answer however many countries share
    // it. Refusing this direction too would delete real content to fix a different bug.
    const shared: Fact[] = ['SE', 'NO'].map((code) => ({
      id: `geo.${code}.currency`,
      entity: code,
      attribute: 'currency',
      value: { names: { en: 'Krona' } },
      difficulty: 2,
      tags: ['currency', 'core'],
      volatility: 'stable',
    }))
    const forward: Template = {
      id: 'tpl.currency.mc4',
      attribute: 'currency',
      modality: 'text',
      prompt: { key: 'lesson:prompt.currency_of', params: ['entityName'] },
      answer: { from: 'fact.value.names' },
      distractors: { count: 3, strategy: 'same-region' },
      a11y: { screenReaderSafe: true },
    }
    const built = buildIndex({ entities, facts: [...facts, ...shared], templates: [forward] })
    const item = built.itemsByFact.get('geo.SE.currency')![0]!
    expect(isAmbiguous(built, item, 'en')).toBe(false)
  })

  it('never ships a reverse question the packs themselves make unanswerable', () => {
    // The three tests above prove the rule on a fixture. This one proves it on the
    // content that actually ships, because a fixture cannot tell you whether the packs
    // contain a value twenty-one countries share — and they do.
    //
    // Stated as an invariant over every reverse template rather than by naming the two
    // that motivated it: a pack author adding a third gets checked for free, which is
    // the whole reason the guard lives in the engine and not in a script.
    let dropped = 0
    for (const template of templates) {
      if (template.answer.from !== 'entity.names') continue
      if (template.modality === 'map') continue // the map IS the prompt — see below
      for (const item of index.items.filter((i) => i.templateId === template.id)) {
        const fact = index.facts.get(item.factId)!
        const value = fact.value.names?.['en']
        const sharedWith = [...index.facts.values()].filter(
          (other) =>
            other.attribute === fact.attribute &&
            other.entity !== fact.entity &&
            index.entities.has(other.entity) &&
            other.value.names?.['en'] === value,
        )
        const question = buildQuestion(index, item, 'en', seededRng(7))
        if (sharedWith.length > 0) {
          expect(question, `${template.id} on ${fact.id} — ${sharedWith.length} others say "${value}"`).toBeNull()
          dropped++
        }
      }
    }
    // Not vacuous: the shipped packs really do contain shared values — eight countries
    // answer "Spanish", five "English", and the US and Canada both dial +1 — so this
    // loop has to have refused something. Without this line the test would still pass
    // on the day someone deleted every ambiguous fact AND the guard along with it.
    expect(dropped).toBeGreaterThan(0)
  })

  it('refuses a question whose prompt contains its own answer', () => {
    // "Guatemala City is the capital of which country?" is a free point. So is Panama
    // City, and Mexico City, and Kuwait, and Luxembourg, and Djibouti, and Singapore.
    // There are enough of them that catching this by hand is a matter of time.
    for (const factId of ['geo.GT.capital', 'geo.PA.capital', 'geo.MX.capital'] as const) {
      const item = index.itemsByFact
        .get(factId)!
        .find((i) => i.templateId === 'tpl.capital-reverse.mc4')!
      expect(isSelfAnswering(index, item, 'en'), factId).toBe(true)
      expect(buildQuestion(index, item, 'en', seededRng(1)), factId).toBeNull()
    }
  })

  it('matches whole words, not the letters that happen to line up', () => {
    // "What is the capital of Tunisia?" → "Tunis". A substring check rejected this,
    // because Tunisia starts with Tunis — and that is a question every geography
    // course asks. The prompt has to NAME the answer, not merely contain its letters.
    const item = index.itemsByFact
      .get('geo.TN.capital')!
      .find((i) => i.templateId === 'tpl.capital.mc4')!
    expect(isSelfAnswering(index, item, 'en')).toBe(false)
    expect(buildQuestion(index, item, 'en', seededRng(1))).not.toBeNull()
  })

  it('keeps the direction that is naming rather than leaking', () => {
    // "What is the capital of Mexico?" → "Mexico City". The answer echoes the prompt,
    // which is how the place is named — not a giveaway, and a fact worth learning.
    // Rejecting this direction too would delete real content to fix a different bug.
    const item = index.itemsByFact
      .get('geo.MX.capital')!
      .find((i) => i.templateId === 'tpl.capital.mc4')!
    expect(isSelfAnswering(index, item, 'en')).toBe(false)
    const q = buildQuestion(index, item, 'en', seededRng(1))
    expect(q).not.toBeNull()
    expect(q!.options.find((o) => o.isCorrect)!.label).toBe('Mexico City')
  })

  it('uses the sentence form in a prompt and the citation form in an option', () => {
    // "What is the capital of Netherlands?" — the fix cannot live in the catalogue,
    // because one template string serves every country, and it cannot live in `names`
    // either, because a country list has to file the Netherlands under N.
    const capital = index.itemsByFact
      .get('geo.NL.capital')!
      .find((i) => i.templateId === 'tpl.capital.mc4')!
    expect(buildQuestion(index, capital, 'en', seededRng(2))!.promptParams['entityName']).toBe(
      'the Netherlands',
    )

    const reverse = index.itemsByFact
      .get('geo.NL.capital')!
      .find((i) => i.templateId === 'tpl.capital-reverse.mc4')!
    const answer = buildQuestion(index, reverse, 'en', seededRng(2))!.options.find(
      (o) => o.isCorrect,
    )!
    expect(answer.label).toBe('Netherlands')
  })

  it('falls back to the citation form for the countries that need no variant', () => {
    const item = index.itemsByFact
      .get('geo.SE.capital')!
      .find((i) => i.templateId === 'tpl.capital.mc4')!
    expect(buildQuestion(index, item, 'en', seededRng(2))!.promptParams['entityName']).toBe(
      'Sweden',
    )
  })

  it('draws visually-similar distractors from the `like:` tag alone', () => {
    // This matched any shared tag except `core`, which meant it matched `flag` —
    // carried by every flag fact — so "visually similar" meant "any country". Five
    // countries in one region hid it completely. The moment east-asia was authored,
    // `pnpm content:preview` printed a Swedish flag question offering China and
    // Mongolia, which is a free point rather than a question.
    const item = index.itemsByFact
      .get('geo.SE.flag')!
      .find((i) => i.templateId === 'tpl.flag-to-country.mc4')!
    const q = buildQuestion(index, item, 'en', seededRng(1))!
    const nordic = new Set(['Sweden', 'Norway', 'Denmark', 'Finland'])
    for (const option of q.options) {
      expect(nordic.has(option.label), `${option.label} is not a Nordic cross`).toBe(true)
    }
  })

  it('falls back rather than inventing similarity it was never told about', () => {
    // Only Japan and South Korea share `like:central-circle`, which is one short of
    // a four-option question. Falling back to the region is right; quietly widening
    // to "any flag" and calling it visual similarity is not.
    const item = index.itemsByFact
      .get('geo.JP.flag')!
      .find((i) => i.templateId === 'tpl.flag-to-country.mc4')!
    const q = buildQuestion(index, item, 'en', seededRng(3))!
    expect(q.options).toHaveLength(4)
    for (const option of q.options) {
      expect(index.entities.get(option.id)?.region).toBe('AS')
    }
  })

  it('falls back to a wider pool when the close one is too small', () => {
    // Japan is the only East Asian entity here, so same-subregion yields nothing
    // and the same-region fallback must carry it.
    const item = index.itemsByFact
      .get('geo.JP.flag')!
      .find((i) => i.templateId === 'tpl.flag-to-country.mc4')!
    const q = buildQuestion(index, item, 'en', seededRng(11))
    expect(q).not.toBeNull()
    expect(q!.options).toHaveLength(4)
  })
})

describe('accessibility parity', () => {
  it('gives every visual template a screen-reader-safe sibling', () => {
    for (const template of templates) {
      if (template.a11y.screenReaderSafe) continue
      const sibling = template.a11y.equivalentTemplate
      expect(sibling, `${template.id} has no equivalentTemplate`).toBeTruthy()
      const found = templates.find((t) => t.id === sibling)
      expect(found, `${sibling} does not exist`).toBeTruthy()
      // The sibling must test the SAME attribute, or it is a different fact and
      // the blind user's progress diverges from everyone else's.
      expect(found!.attribute).toBe(template.attribute)
      expect(found!.a11y.screenReaderSafe).toBe(true)
    }
  })

  it('can present every fact without sight', () => {
    // The real guarantee: a screen-reader user reaches identical user_facts rows.
    for (const factId of index.itemsByFact.keys()) {
      const item = itemsForFact(index, factId, seededRng(1), { screenReaderOnly: true })[0]
      expect(item, `${factId} has no screen-reader-safe presentation`).toBeDefined()
      expect(item!.screenReaderSafe).toBe(true)
    }
  })

  it('can ASK every fact without sight, not merely pick an item for it', () => {
    /**
     * The assertion above stops one step short of the thing it is named for. It proves
     * a screen-reader-safe item EXISTS for every fact; it never asks whether that item
     * composes into a question. Those came apart badly:
     *
     * `tpl.location-of.mc4` — the screen-reader sibling of the map question, and the
     * only way a blind user can be asked where a country is — returned null for 30 of
     * 65 countries. Every country in Asia, North America, Oceania and South America.
     * The item existed and was flagged safe, so the test above was green while a third
     * of the accessible curriculum did not exist. The sighted map question composed for
     * all 65, so the two paths silently diverged in exactly the way this section is
     * supposed to prevent.
     *
     * Building it is what makes the guard real. An item that cannot become a question
     * is not a presentation.
     */
    for (const factId of index.itemsByFact.keys()) {
      const safe = itemsForFact(index, factId, seededRng(1), { screenReaderOnly: true })
      const asked = safe
        .map((item) => buildQuestion(index, item, 'en', seededRng(1)))
        .filter((q) => q !== null)
      expect(
        asked.length,
        `${factId}: ${safe.length} screen-reader item(s), none of which builds a question`,
      ).toBeGreaterThan(0)
      expect(asked[0]!.options.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('asks a screen-reader user about a country in a one-subregion region', () => {
    // The specific shape that broke: Brazil's region holds exactly one subregion, so
    // every `same-region` distractor reads "South America" and they all deduplicate
    // into the correct option. Named here so a future distractor change cannot quietly
    // reintroduce it for the continents with the fewest subregions.
    for (const entityId of ['BR', 'US', 'AU', 'JP']) {
      const item = index.items.find(
        (i) => i.templateId === 'tpl.location-of.mc4' && i.entityId === entityId,
      )
      expect(item, `no location item for ${entityId}`).toBeDefined()
      const question = buildQuestion(index, item!, 'en', seededRng(3))
      expect(question, `"where is ${entityId}?" cannot be asked`).not.toBeNull()
      expect(question!.options).toHaveLength(4)
      // Four options that read four different ways, which is the whole difficulty.
      expect(new Set(question!.options.map((o) => o.label)).size).toBe(4)
    }
  })
})

describe('presentation', () => {
  const imageItem = index.itemsByFact
    .get('geo.SE.flag')!
    .find((i) => i.templateId === 'tpl.flag-to-country.mc4')!

  it('puts the image on the prompt, never on the options', () => {
    const q = buildQuestion(index, imageItem, 'en', seededRng(3))!
    expect(q.modality).toBe('image')
    // Compared against the pack rather than against a literal path. This used to say
    // `flags/SE.svg`, and the day the flags actually shipped — as PNG, because
    // rendering SVG on React Native needs a native module — this test failed for a
    // reason that had nothing to do with what it was testing. The claim is "the prompt
    // carries the entity's own declared asset", and the file extension is the content
    // pack's business.
    expect(q.promptAsset).toBe(index.entities.get('SE')!.assets!['flag']!.path)

    // The template is answered by country NAME. A flag beside each name would print
    // the answer next to it — the reason this moved off the options.
    for (const option of q.options) {
      expect(option).not.toHaveProperty('asset')
    }
  })

  it('takes the prompt asset from the template attribute, not a hardcoded key', () => {
    // The engine must not know the word "flag". A subject whose image attribute is
    // called something else has to work with no engine change — that is the claim
    // the whole package makes, and the reason this file exists.
    const zoo = buildIndex({
      entities: [
        {
          id: 'PANTHERA-LEO',
          type: 'animal',
          names: { en: 'Lion' },
          region: 'AF',
          assets: { photo: { path: 'photos/lion.jpg', license: 'CC-BY-4.0' } },
        },
        {
          id: 'PANTHERA-PARDUS',
          type: 'animal',
          names: { en: 'Leopard' },
          region: 'AF',
          assets: { photo: { path: 'photos/leopard.jpg', license: 'CC-BY-4.0' } },
        },
      ] as unknown as Entity[],
      facts: [
        {
          id: 'wild.PANTHERA-LEO.photo',
          entity: 'PANTHERA-LEO',
          attribute: 'photo',
          value: { names: { en: 'a tawny cat with a mane' } },
          difficulty: 1,
          volatility: 'stable',
        },
      ] as unknown as Fact[],
      templates: [
        {
          id: 'tpl.photo-to-animal.mc2',
          attribute: 'photo',
          modality: 'image',
          prompt: { key: 'lesson:prompt.which_animal', params: [] },
          answer: { from: 'entity.names' },
          distractors: { count: 1, strategy: 'same-region', excludeSimilarStrings: true },
          a11y: { screenReaderSafe: false, equivalentTemplate: 'tpl.photo-describe.mc2' },
          timeLimitMs: null,
          difficultyModifier: 0,
        },
      ] as unknown as Template[],
    })

    const item = zoo.itemsByFact.get('wild.PANTHERA-LEO.photo')![0]!
    const q = buildQuestion(zoo, item, 'en', seededRng(1))
    expect(q?.promptAsset).toBe('photos/lion.jpg')
  })

  it('omits the prompt asset on a text template', () => {
    const textItem = index.itemsByFact
      .get('geo.SE.flag')!
      .find((i) => i.templateId === 'tpl.flag-describe.mc4')!
    const q = buildQuestion(index, textItem, 'en', seededRng(3))!
    expect(q.promptAsset).toBeUndefined()
  })

  it('hands a described-flag question the flag to reveal AFTER it is answered', () => {
    // The gap this closes: "What does Sweden's flag look like?" is asked in words and
    // answered in words, so before `revealAsset` the flag never appeared at all — a
    // user could finish a flag question having never seen the flag. It cannot be the
    // prompt, because drawing it beside the question hands the answer to anyone who can
    // see it; after grading there is nothing left to give away.
    const textItem = index.itemsByFact
      .get('geo.SE.flag')!
      .find((i) => i.templateId === 'tpl.flag-describe.mc4')!
    const q = buildQuestion(index, textItem, 'en', seededRng(3))!
    expect(q.revealAsset).toBe(index.entities.get('SE')!.assets!['flag']!.path)
  })

  it('does not re-reveal a picture the prompt is already showing', () => {
    // An image template has had the flag on screen since before the user answered, so a
    // second copy on the feedback sheet is a duplicate of something that never left.
    // The image template already in this block's scope — "which country's flag is
    // this?", answered by name, with the flag as the prompt.
    const q = buildQuestion(index, imageItem, 'en', seededRng(3))!
    expect(q.promptAsset).toBeDefined()
    expect(q.revealAsset).toBeUndefined()
  })

  it('draws the four flags as the ANSWERS when the answer is a flag', () => {
    // The screenshot that started this: "Hur ser Belgiens flagga ut?" over four written
    // descriptions — "tre lodräta band — svart, gult, rött" — which is a reading
    // comprehension question in the one place the app owns a picture of the answer.
    const item = index.itemsByFact
      .get('geo.SE.flag')!
      .find((i) => i.templateId === 'tpl.flag-of-country.mc4')!
    const q = buildQuestion(index, item, 'en', seededRng(3))!

    // Every option, not just the correct one. Three of four carrying art and one bare
    // would mark the odd one out — which is the giveaway this feature has to avoid, in
    // the most embarrassing possible form.
    expect(q.options).toHaveLength(4)
    for (const option of q.options) expect(option.asset).toBeDefined()
    expect(q.options.find((o) => o.isCorrect)!.asset).toBe(
      index.entities.get('SE')!.assets!['flag']!.path,
    )

    // And the words survive, which is why this needed no second template and no
    // `equivalentTemplate` pairing: the label is still the description, so a screen
    // reader announces exactly what it announced before the pictures arrived.
    for (const option of q.options) expect(option.label.length).toBeGreaterThan(0)
  })

  it('never puts art on an option when the option is the ENTITY', () => {
    // The rule that keeps the feature from handing over the answer. "Which country's
    // flag is this?" shows one flag and is answered by four country NAMES — art on
    // those options would be each country's own flag, and one of them is the prompt.
    const q = buildQuestion(index, imageItem, 'en', seededRng(3))!
    for (const option of q.options) expect(option.asset).toBeUndefined()
  })

  it('stops revealing a flag the options have been showing all along', () => {
    // `revealAsset` used to fire whenever the PROMPT had no picture. The options can
    // carry it now, so that condition alone would put the flag on the feedback sheet a
    // second time, having never left the screen.
    const item = index.itemsByFact
      .get('geo.SE.flag')!
      .find((i) => i.templateId === 'tpl.flag-of-country.mc4')!
    const q = buildQuestion(index, item, 'en', seededRng(3))!
    expect(q.promptAsset).toBeUndefined()
    expect(q.revealAsset).toBeUndefined()
  })

  it('reveals nothing for an attribute that has no artwork', () => {
    // Indexed by the template's ATTRIBUTE, so this knows nothing about flags: a capital
    // question looks for `assets.capital`, finds none, and reveals nothing. The same
    // line is what would reveal `assets.photo` for a wildlife pack.
    const capitalItem = index.itemsByFact.get('geo.SE.capital')![0]!
    const q = buildQuestion(index, capitalItem, 'en', seededRng(3))!
    expect(q.revealAsset).toBeUndefined()
  })

  it('will not pick a template whose modality the host cannot present', () => {
    // The bug this guards: a host with no flag images still served "Which country's
    // flag is this?" above four country names, and a wrong answer on an unanswerable
    // question costs a heart.
    for (let seed = 1; seed <= 30; seed++) {
      const item = itemsForFact(index, 'geo.SE.flag', seededRng(seed), {
        modalities: ['text'],
      })[0]
      expect(item).toBeDefined()
      expect(index.templates.get(item!.templateId)!.modality).toBe('text')
    }
  })

  it('still reaches every fact when the host is text-only', () => {
    // Narrowing must not silently drop knowledge. Same facts, same progress — the
    // argument the screen-reader siblings already rest on.
    for (const factId of index.itemsByFact.keys()) {
      const item = itemsForFact(index, factId, seededRng(1), { modalities: ['text'] })[0]
      expect(item, `${factId} is unreachable without images`).toBeDefined()
    }
  })
})

describe('the locator map', () => {
  const templates = [...index.templates.values()]

  const questionFor = (templateId: string) => {
    const template = index.templates.get(templateId)!
    const item = index.items.find((i) => i.templateId === templateId && i.entityId === 'SE')!
    return { template, q: buildQuestion(index, item, 'en', seededRng(5))! }
  }

  it('never appears on a question the entity is the answer to', () => {
    // The whole safety property, checked across EVERY template rather than the two
    // somebody thought of. A map of Sweden beside "Stockholm is the capital of which
    // country?" hands the answer over — silently, and only to sighted users, which is
    // the worst shape a giveaway can take.
    for (const template of templates) {
      if (template.answer.from !== 'entity.names') continue
      // A `map` template is the one legitimate exception and it inverts the rule: the
      // map IS the question there, so its presence is the point rather than a leak.
      // Told apart by MODALITY, never by naming the template — a second map template
      // must get the same answer without editing this test.
      if (template.modality === 'map') continue
      const item = index.items.find((i) => i.templateId === template.id)
      // Loudly, not `continue`. This loop stepped silently over any template with no
      // items for its attribute, so `tpl.country-to-map.mc4` shipped completely
      // unchecked by it — the "guard that could never fail" shape again.
      expect(item, `${template.id} has no items — this test is not checking it`).toBeDefined()
      const q = buildQuestion(index, item!, 'en', seededRng(5))!
      expect(q.locator, template.id).toBeUndefined()
    }
  })

  it('IS the question on a map template, labelled and present', () => {
    // The inversion, asserted rather than left as a comment. Without the modality
    // branch in `isAmbiguous` every one of these is dropped — 65 questions vanishing
    // in silence, which is exactly how this arrived.
    const item = index.items.find((i) => i.templateId === 'tpl.country-to-map.mc4')
    expect(item).toBeDefined()
    const q = buildQuestion(index, item!, 'en', seededRng(5))!
    expect(q).not.toBeNull()
    expect(q.modality).toBe('map')
    expect(q.locator).toBeDefined()
    // Four real options, and the answer among them.
    expect(q.options).toHaveLength(4)
    expect(q.options.filter((o) => o.isCorrect)).toHaveLength(1)
  })

  it('never asks a map question a screen reader cannot answer', () => {
    // A map prompt is unanswerable by ear. The pack must name a sibling that tests the
    // SAME fact in words, and that sibling must itself be screen-reader safe — a chain
    // that points at another picture would move the bug rather than fix it.
    for (const template of templates) {
      if (template.modality !== 'map') continue
      const sibling = template.a11y?.equivalentTemplate
      expect(sibling, `${template.id} has no screen-reader sibling`).toBeDefined()
      const equivalent = index.templates.get(sibling!)
      expect(equivalent, `${sibling} is named but not in the pack`).toBeDefined()
      expect(equivalent!.a11y?.screenReaderSafe, sibling).toBe(true)
      // Same attribute, so it tests the same fact and writes the same `user_facts` row.
      expect(equivalent!.attribute).toBe(template.attribute)
    }
  })

  it('does appear when the question already names the country', () => {
    // "What is the capital of Sweden?" — the prompt says Sweden, so a map of Sweden
    // adds where rather than what. Two things learned for one look.
    const { q } = questionFor('tpl.capital.mc4')
    expect(q.locator?.path).toBe(index.entities.get('SE')!.assets!['map']!.path)
    expect(q.locator?.contextPath).toBe(index.entities.get('SE')!.assets!['mapContext']!.path)
  })

  it('carries both layers, because a country with nothing behind it locates nothing', () => {
    // The picture is two layers drawn in one frame. Given only the outline, a host can
    // draw a shape floating in a void — decoration, not an answer to "where is this?".
    const { q } = questionFor('tpl.capital.mc4')
    expect(q.locator).toBeDefined()
    expect(Object.keys(q.locator!).sort()).toEqual(['contextPath', 'path'])
  })

  it('is absent for an entity with no map, rather than half-built', () => {
    const zoo = buildIndex({
      entities: [
        { id: 'AAA', type: 'animal', names: { en: 'Aardvark' }, region: 'AF' },
        { id: 'BBB', type: 'animal', names: { en: 'Baboon' }, region: 'AF' },
      ] as unknown as Entity[],
      facts: [
        {
          id: 'wild.AAA.diet',
          entity: 'AAA',
          attribute: 'diet',
          value: { names: { en: 'ants' } },
          difficulty: 1,
          volatility: 'stable',
          source: { name: 'x', verifiedAt: '2026-01-01' },
        },
        {
          id: 'wild.BBB.diet',
          entity: 'BBB',
          attribute: 'diet',
          value: { names: { en: 'fruit' } },
          difficulty: 1,
          volatility: 'stable',
          source: { name: 'x', verifiedAt: '2026-01-01' },
        },
      ] as unknown as Fact[],
      templates: [
        {
          id: 'tpl.diet.mc4',
          attribute: 'diet',
          modality: 'text',
          prompt: { key: 'x:diet', params: ['entityName'] },
          answer: { from: 'fact.value.names' },
          a11y: { screenReaderSafe: true },
        },
      ] as unknown as Template[],
    })
    const item = zoo.items.find((i) => i.entityId === 'AAA')!
    expect(buildQuestion(zoo, item, 'en', seededRng(1))!.locator).toBeUndefined()
  })
})

describe('content safety', () => {
  it('never generates an item from a sensitive or volatile fact', () => {
    const guarded = buildIndex({
      entities,
      facts: [
        ...facts,
        {
          id: 'geo.ZA.capital',
          entity: 'JP', // any resolvable entity; the point is the flags below
          attribute: 'capital',
          value: { names: { en: 'Pretoria' } },
          difficulty: 5,
          volatility: 'stable',
          sensitivity: 'review-required',
          quizzable: false,
        },
        {
          id: 'geo.XX.leader',
          entity: 'JP',
          attribute: 'leader',
          value: { names: { en: 'Someone' } },
          difficulty: 1,
          volatility: 'fast',
        },
      ],
      templates,
    })

    expect(guarded.itemsByFact.has('geo.ZA.capital')).toBe(false)
    expect(guarded.itemsByFact.has('geo.XX.leader')).toBe(false)
  })

  it('skips a fact whose entity is missing rather than crashing', () => {
    const orphaned = buildIndex({
      entities,
      facts: [
        ...facts,
        {
          id: 'geo.ZZ.capital',
          entity: 'ZZ',
          attribute: 'capital',
          value: { names: { en: 'Nowhere' } },
          difficulty: 1,
          volatility: 'stable',
        },
      ],
      templates,
    })
    expect(orphaned.itemsByFact.has('geo.ZZ.capital')).toBe(false)
  })
})

/**
 * The accessible path must reach every fact the sighted path does.
 *
 * `docs/design/accessibility.md` is explicit that an equivalent must never be a lesser
 * one, and `templates.v1.json` declares the pairing: a template that is not
 * `screenReaderSafe` names the sibling that tests the SAME fact without sight. Nothing
 * checked whether the sibling could actually be BUILT.
 *
 * It could not. `tpl.location-of.mc4` — the accessible half of the map question — built
 * for 35 of 65 countries, because its distractors were other subregions of the same
 * region and North America, South America and Oceania hold exactly one apiece. A blind
 * user got no location question at all for thirty countries while a sighted user got one
 * for all sixty-five, silently, and the pack's own comment recorded it as a known gap for
 * as long as it stayed open.
 *
 * The `other-values` fallback closed it. This is what keeps it closed — and what would
 * have found it the day it opened, which is the part that matters. Written against the
 * DECLARED pairing rather than against a list of template ids, so a future visual
 * template inherits the assertion by declaring its sibling.
 */
describe('accessibility parity', () => {
  const rng = seededRng(20260805)

  const buildableFor = (templateId: string): Set<string> => {
    const built = new Set<string>()
    for (const item of index.items) {
      if (item.templateId !== templateId) continue
      if (buildQuestion(index, item, 'en', rng) !== null) built.add(item.factId)
    }
    return built
  }

  const pairs = templates
    .filter((t) => t.a11y.screenReaderSafe === false)
    .map((t) => ({ visual: t.id, accessible: t.a11y.equivalentTemplate }))

  it('has at least one visual template with a declared sibling', () => {
    // Otherwise everything below passes by iterating nothing — the shape of guard this
    // repo has been bitten by more than once.
    expect(pairs.length).toBeGreaterThan(0)
    for (const pair of pairs) expect(pair.accessible).toBeTruthy()
  })

  it.each(pairs.map((p) => [p.visual, p.accessible] as const))(
    '%s is answerable by ear through %s, for every fact',
    (visual, accessible) => {
      const sighted = buildableFor(visual)
      const byEar = buildableFor(accessible!)
      const missing = [...sighted].filter((factId) => !byEar.has(factId))

      expect(
        missing,
        `${missing.length} fact(s) a sighted user can be asked and a screen-reader user ` +
          `cannot: ${missing.slice(0, 8).join(', ')}`,
      ).toEqual([])
    },
  )
})
