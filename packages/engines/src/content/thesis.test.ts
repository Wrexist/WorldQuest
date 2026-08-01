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
import { buildIndex, buildQuestion, pickItemForFact } from './index.js'
import type { Entity, Fact, Template } from './types.js'

const packsDir = join(import.meta.dirname, '..', '..', '..', 'content', 'packs', 'geography')
const read = <T>(file: string): T[] =>
  (JSON.parse(readFileSync(join(packsDir, file), 'utf8')) as { items: T[] }).items

const entities = read<Entity>('entities.countries.v1.json')
const facts = [...read<Fact>('facts.capitals.v1.json'), ...read<Fact>('facts.flags.v1.json')]
const templates = read<Template>('templates.v1.json')

const index = buildIndex({ entities, facts, templates })

describe('the platform thesis', () => {
  it('generates far more items than facts, from templates alone', () => {
    // 9 facts × the templates that match their attribute. Hand-writing this many
    // questions is exactly the work the architecture exists to avoid.
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
    const item = pickItemForFact(wildlife, 'wild.PANTHERA-LEO.habitat', seededRng(2))!
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
      const item = pickItemForFact(index, factId, seededRng(1), { screenReaderOnly: true })
      expect(item, `${factId} has no screen-reader-safe presentation`).not.toBeNull()
      expect(item!.screenReaderSafe).toBe(true)
    }
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
