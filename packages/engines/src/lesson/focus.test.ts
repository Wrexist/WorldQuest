import { describe, expect, it } from 'vitest'
import { buildIndex } from '../content/index.js'
import { seededRng } from '../shared/index.js'
import { composeLesson } from './compose.js'
import { entitiesInGroup, factsMatching, focusFilter } from './focus.js'
import type { Entity, Fact, Template } from '../content/types.js'

/**
 * A tiny pack, on purpose.
 *
 * The geography pack would make these tests assertions about geography — "Europe has
 * nineteen countries" — which is content that changes, in a package that must not know
 * what a continent is. Two groups, three attributes, spread difficulties.
 */
const entities: Entity[] = [
  { id: 'A1', type: 'country', names: { en: 'Alpha' }, region: 'G1' },
  { id: 'A2', type: 'country', names: { en: 'Beta' }, region: 'G1' },
  { id: 'A3', type: 'country', names: { en: 'Gamma' }, region: 'G1' },
  { id: 'A4', type: 'country', names: { en: 'Delta' }, region: 'G1' },
  { id: 'B1', type: 'country', names: { en: 'Epsilon' }, region: 'G2' },
  { id: 'B2', type: 'country', names: { en: 'Zeta' }, region: 'G2' },
  { id: 'B3', type: 'country', names: { en: 'Eta' }, region: 'G2' },
  { id: 'B4', type: 'country', names: { en: 'Theta' }, region: 'G2' },
]

const fact = (entity: string, attribute: string, difficulty: number, value: string): Fact => ({
  id: `f.${entity}.${attribute}`,
  entity,
  attribute,
  value: { names: { en: value } },
  difficulty,
  volatility: 'stable',
})

const facts: Fact[] = entities.flatMap((e, i) => [
  fact(e.id, 'capital', 1 + (i % 5), `Cap${e.id}`),
  fact(e.id, 'currency', 1 + ((i + 2) % 5), `Cur${e.id}`),
])

const templates: Template[] = [
  {
    id: 'tpl.capital',
    attribute: 'capital',
    modality: 'text',
    prompt: { key: 'p.capital', params: ['entityName'] },
    answer: { from: 'fact.value.names' },
    distractors: { count: 3, strategy: 'other-values' },
    a11y: { screenReaderSafe: true },
    timeLimitMs: null,
    difficultyModifier: 0,
  },
  {
    id: 'tpl.currency',
    attribute: 'currency',
    modality: 'text',
    prompt: { key: 'p.currency', params: ['entityName'] },
    answer: { from: 'fact.value.names' },
    distractors: { count: 3, strategy: 'other-values' },
    a11y: { screenReaderSafe: true },
    timeLimitMs: null,
    difficultyModifier: 0,
  },
]

const index = buildIndex({ entities, facts, templates })
const ids = [...index.itemsByFact.keys()]

describe('focusFilter', () => {
  it('is undefined when nothing was asked for', () => {
    // Not a tautology. `composeLesson` spreads `topicFilter` conditionally, so a
    // predicate that always says yes would put a call in the hot path of every
    // unfiltered lesson and make "did the user narrow anything?" unanswerable.
    expect(focusFilter(index, {})).toBeUndefined()
  })

  it('treats an empty list as a choice that matches nothing, not as no choice', () => {
    // The distinction that keeps a picker honest. Choosing a group the packs have no
    // members for resolves to an empty id list, and reading that as "no filter" made the
    // screen offer a lesson about everything under a heading naming the empty group.
    //
    // A caller that wants the widening behaviour — a URL carrying a group code nobody is
    // in — omits the key instead. A bad link fails open; a deliberate choice fails closed.
    const keep = focusFilter(index, { entities: [] })
    expect(keep).toBeDefined()
    expect(ids.filter(keep!)).toEqual([])
    expect(factsMatching(index, { entities: [] })).toBe(0)
  })

  it('keeps only the attributes asked for', () => {
    const keep = focusFilter(index, { attributes: ['capital'] })!
    const kept = ids.filter(keep)

    expect(kept.length).toBe(entities.length)
    for (const id of kept) expect(index.facts.get(id)!.attribute).toBe('capital')
  })

  it('keeps only the entities asked for', () => {
    const keep = focusFilter(index, { entities: ['A1', 'A2'] })!
    const kept = ids.filter(keep)

    // Both attributes survive for each named entity, and nothing else does.
    expect(kept.length).toBe(4)
    for (const id of kept) expect(['A1', 'A2']).toContain(index.facts.get(id)!.entity)
  })

  it('narrows on both at once, rather than either', () => {
    const keep = focusFilter(index, { attributes: ['currency'], entities: ['A1', 'A2', 'A3'] })!
    const kept = ids.filter(keep)

    expect(kept.length).toBe(3)
    for (const id of kept) {
      expect(index.facts.get(id)!.attribute).toBe('currency')
      expect(['A1', 'A2', 'A3']).toContain(index.facts.get(id)!.entity)
    }
  })

  it('bounds the difficulty band inclusively at both ends', () => {
    const keep = focusFilter(index, { difficulty: { min: 2, max: 3 } })!

    for (const id of ids.filter(keep)) {
      const d = index.facts.get(id)!.difficulty
      expect(d).toBeGreaterThanOrEqual(2)
      expect(d).toBeLessThanOrEqual(3)
    }
    // Inclusive means a band of one is a real band, not an empty one.
    const single = focusFilter(index, { difficulty: { min: 3, max: 3 } })!
    expect(ids.filter(single).every((id) => index.facts.get(id)!.difficulty === 3)).toBe(true)
    expect(ids.filter(single).length).toBeGreaterThan(0)
  })

  it('rejects a fact id the index does not know', () => {
    // Letting an unknown id through the one gate that exists to narrow the pool is the
    // wrong direction to fail in.
    const keep = focusFilter(index, { attributes: ['capital'] })!
    expect(keep('f.NOPE.capital')).toBe(false)
  })
})

describe('entitiesInGroup', () => {
  it('groups by a field it does not have to understand', () => {
    // The point of the string parameter: this package never learns that G1 is a place.
    expect(entitiesInGroup(index, 'region', 'G1')).toEqual(['A1', 'A2', 'A3', 'A4'])
    expect(entitiesInGroup(index, 'region', 'G2')).toEqual(['B1', 'B2', 'B3', 'B4'])
  })

  it('returns nothing for a group nobody is in', () => {
    expect(entitiesInGroup(index, 'region', 'G9')).toEqual([])
  })
})

describe('factsMatching', () => {
  it('counts what a picker would be promising', () => {
    // A chooser offering "Currencies · G2" and then producing a three-question lesson has
    // wasted the choice. This is the number that goes beside the option.
    expect(factsMatching(index, {})).toBe(ids.length)
    expect(factsMatching(index, { attributes: ['capital'] })).toBe(8)
    expect(factsMatching(index, { attributes: ['capital'], entities: entitiesInGroup(index, 'region', 'G2') })).toBe(4)
  })

  it('counts zero when a combination has nothing in it', () => {
    expect(factsMatching(index, { attributes: ['flag'] })).toBe(0)
  })
})

describe('a focused lesson', () => {
  const compose = (focus: Parameters<typeof focusFilter>[1], count = 6) => {
    const filter = focusFilter(index, focus)
    return composeLesson({
      index,
      memory: [],
      now: 1_000,
      rng: seededRng(7),
      locale: 'en',
      count,
      ...(filter ? { topicFilter: filter } : {}),
    })
  }

  it('asks only about what was chosen', () => {
    // The end-to-end claim. `topicFilter` has been plumbed through `composeLesson` and
    // `selectItems` since they were written and passed by nothing, so this is the first
    // test in the repo that proves the whole path narrows a real lesson.
    const questions = compose({ attributes: ['capital'] })

    expect(questions.length).toBeGreaterThan(0)
    for (const q of questions) expect(index.facts.get(q.item.factId)!.attribute).toBe('capital')
  })

  it('asks only about the entities chosen', () => {
    const questions = compose({ entities: entitiesInGroup(index, 'region', 'G2') })

    expect(questions.length).toBeGreaterThan(0)
    for (const q of questions) expect(index.facts.get(q.item.factId)!.entity).toMatch(/^B/)
  })

  it('returns a short lesson rather than padding it with what was excluded', () => {
    // The failure that would make this feature a lie: asking for four facts' worth of
    // focus and getting ten questions, six of them about something else.
    const questions = compose({ attributes: ['currency'], entities: ['A1', 'A2'] }, 10)

    expect(questions.length).toBeLessThanOrEqual(2)
    for (const q of questions) expect(index.facts.get(q.item.factId)!.attribute).toBe('currency')
  })

  it('composes the same lesson it always did when nothing is chosen', () => {
    // The escape hatch has to cost nothing. Same seed, same input, same questions as a
    // caller that never heard of this module.
    const focused = compose({})
    const plain = composeLesson({
      index,
      memory: [],
      now: 1_000,
      rng: seededRng(7),
      locale: 'en',
      count: 6,
    })

    expect(focused.map((q) => q.item.factId)).toEqual(plain.map((q) => q.item.factId))
  })
})
