/**
 * The three ways a question can be asked that the first six attributes never needed:
 * about a NUMBER, about a RELATION, and about a value that many entities share.
 *
 * Fixtures, not the shipped packs — the packs are checked end to end by `thesis.test.ts` and
 * `pnpm content:preview`. What these prove is the rule itself, on inputs small enough to
 * read: a wrong answer that is also right is the worst bug this engine can have, and the
 * relation and shared-value paths are exactly where it could come back.
 */
import { describe, expect, it } from 'vitest'
import { seededRng } from '../shared/index.js'
import { buildIndex, buildQuestion, itemsForFact, type Entity, type Fact, type Template } from './index.js'

// Words, not "Land A" and "Land B": two labels one edit apart are refused as a spelling trap, and
// a fixture whose every option looks like every other would test that rule instead of this one.
const WORDS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima']
const ids = 'ABCDEFGHIJKL'.split('')
const entity = (id: string): Entity => ({
  id, type: 'country', names: { en: WORDS[ids.indexOf(id)]! }, region: 'R', subregion: 'S',
})
const entities = ids.map(entity)

const fact = (id: string, entityId: string, attribute: string, value: Fact['value']): Fact => ({
  id: `geo.${entityId}.${id}`, entity: entityId, attribute, value, difficulty: 3, volatility: 'stable',
  source: { name: 'test', verifiedAt: '2026-09-30' },
})

const base = { modality: 'text', a11y: { screenReaderSafe: true }, timeLimitMs: null } as const
const template = (over: Partial<Template> & Pick<Template, 'id' | 'attribute' | 'answer'>): Template => ({
  ...base, prompt: { key: 'test:prompt', params: ['entityName'] }, difficultyModifier: 0, ...over,
})

const FIGURES = [100, 110, 120, 130, 140, 150, 160, 1e6, 1e7, 1e8, 1e9, 1e10]
const sizes: Fact[] = ids.map((id, i) =>
  fact('size', id, 'size', { id: `size-${i}`, number: FIGURES[i]!, names: { en: `${FIGURES[i]} units` } }))

describe('numeric distractors', () => {
  const nearest = template({
    id: 'tpl.size-close.mc4', attribute: 'size', answer: { from: 'fact.value.names' },
    distractors: { count: 3, strategy: 'nearest-values', fallback: 'other-values' },
  })
  const spread = template({
    id: 'tpl.size.mc4', attribute: 'size', answer: { from: 'fact.value.names' },
    distractors: { count: 3, strategy: 'spread-values', fallback: 'other-values' },
  })

  it('nearest-values offers only figures close to the answer', () => {
    const index = buildIndex({ entities, facts: sizes, templates: [nearest] })
    const item = index.itemsByFact.get('geo.A.size')![0]!
    const near = new Set(['110 units', '120 units', '130 units', '140 units', '150 units', '160 units'])
    for (let seed = 1; seed <= 60; seed++) {
      const q = buildQuestion(index, item, 'en', seededRng(seed))
      expect(q, `seed ${seed}`).not.toBeNull()
      for (const o of q!.options.filter((x) => !x.isCorrect)) expect(near.has(o.label), o.label).toBe(true)
    }
  })

  it('spread-values offers only figures a factor of four or more away', () => {
    const index = buildIndex({ entities, facts: sizes, templates: [spread] })
    const item = index.itemsByFact.get('geo.A.size')![0]!
    for (let seed = 1; seed <= 60; seed++) {
      const q = buildQuestion(index, item, 'en', seededRng(seed))!
      for (const o of q.options.filter((x) => !x.isCorrect)) {
        expect(Number.parseFloat(o.label), o.label).toBeGreaterThanOrEqual(400)
      }
    }
  })

  it('has nothing to offer for a fact with no figure, and says so by declining', () => {
    const plain = [fact('size', 'A', 'size', { id: 'x', names: { en: 'plenty' } }), ...sizes.slice(1)]
    const index = buildIndex({ entities, facts: plain, templates: [{ ...nearest, distractors: { count: 3, strategy: 'nearest-values' } }] })
    expect(buildQuestion(index, index.itemsByFact.get('geo.A.size')![0]!, 'en', seededRng(1))).toBeNull()
  })
})

describe('relations', () => {
  // A—B, B—C, B—D, B—E, and nothing else: a star around B.
  const edge = (a: string, b: string): Fact =>
    fact(`links-${b.toLowerCase()}`, a, 'links', { id: b, names: { en: WORDS[ids.indexOf(b)]! } })
  const links = [
    edge('A', 'B'), edge('B', 'A'), edge('B', 'C'), edge('B', 'D'), edge('B', 'E'),
    edge('C', 'B'), edge('D', 'B'), edge('E', 'B'),
  ]
  const ask = template({
    id: 'tpl.links.mc4', attribute: 'links', answer: { from: 'fact.value.entity' },
    distractors: { count: 3, strategy: 'same-subregion', fallback: 'same-region' },
  })
  const index = buildIndex({ entities, facts: links, templates: [ask] })

  it('answers with the entity the fact points at, not the entity it is about', () => {
    const q = buildQuestion(index, index.itemsByFact.get('geo.A.links-b')![0]!, 'en', seededRng(3))!
    const correct = q.options.find((o) => o.isCorrect)!
    expect(correct.id).toBe('B')
    expect(correct.label).toBe('Bravo')
  })

  it('never offers a related entity, or the subject, as a wrong answer', () => {
    // B has three neighbours besides A; asking for one of them, the other two are right too.
    const related = new Set(['A', 'C', 'D', 'E'])
    for (const factId of ['geo.B.links-c', 'geo.B.links-d', 'geo.B.links-e', 'geo.B.links-a']) {
      for (let seed = 1; seed <= 80; seed++) {
        const q = buildQuestion(index, index.itemsByFact.get(factId)![0]!, 'en', seededRng(seed))!
        for (const o of q.options.filter((x) => !x.isCorrect)) {
          expect(related.has(o.id), `${factId} seed ${seed} offered ${o.id}`).toBe(false)
          expect(o.id).not.toBe('B')
        }
      }
    }
  })

  it('does not call an answer that shares a word with the subject a leak', () => {
    const tangled = buildIndex({
      entities: [{ ...entity('A'), names: { en: 'Guinea-Bissau' } }, { ...entity('B'), names: { en: 'Guinea' } }, ...entities.slice(2)],
      facts: [edge('A', 'B')],
      templates: [ask],
    })
    expect(buildQuestion(tangled, tangled.itemsByFact.get('geo.A.links-b')![0]!, 'en', seededRng(1))).not.toBeNull()
  })

  it('near-related draws wrong answers from the neighbours of the neighbours', () => {
    // From A the only neighbour is B, whose other neighbours are C, D and E.
    const near = template({
      id: 'tpl.links-near.mc4', attribute: 'links', answer: { from: 'fact.value.entity' },
      distractors: { count: 3, strategy: 'near-related', fallback: 'same-subregion' },
    })
    const nearIndex = buildIndex({ entities, facts: links, templates: [near] })
    for (let seed = 1; seed <= 40; seed++) {
      const q = buildQuestion(nearIndex, nearIndex.itemsByFact.get('geo.A.links-b')![0]!, 'en', seededRng(seed))!
      expect(q.options.map((o) => o.id).sort()).toEqual(['B', 'C', 'D', 'E'])
    }
  })
})

describe('a value many entities share', () => {
  const coast = (id: string, landlocked: boolean): Fact =>
    fact('coast', id, 'coast', { id: landlocked ? 'landlocked' : 'coastal', names: { en: landlocked ? 'inland' : 'coastal' } })
  const facts = ids.map((id, i) => coast(id, i < 3))
  const noCoast = template({
    id: 'tpl.no-coast.mc4', attribute: 'coast', answer: { from: 'entity.names' }, when: { valueId: 'landlocked' },
    prompt: { key: 'test:none', params: [] },
    distractors: { count: 3, strategy: 'same-subregion', fallback: 'same-region', differentValueOnly: true },
  })
  const index = buildIndex({ entities, facts, templates: [noCoast] })

  it('only builds items for the facts its `when` names', () => {
    expect(index.items.map((i) => i.entityId).sort()).toEqual(['A', 'B', 'C'])
  })

  it('asks a question with exactly one right answer although three entities share the value', () => {
    for (const id of ['A', 'B', 'C']) {
      for (let seed = 1; seed <= 50; seed++) {
        const q = buildQuestion(index, index.itemsByFact.get(`geo.${id}.coast`)![0]!, 'en', seededRng(seed))
        expect(q, `${id} seed ${seed}`).not.toBeNull()
        const wrong = q!.options.filter((o) => !o.isCorrect).map((o) => o.id)
        expect(wrong).toHaveLength(3)
        for (const w of wrong) expect(['A', 'B', 'C']).not.toContain(w)
      }
    }
  })
})

describe('ordering by the ramp', () => {
  const fixtures = [0, 1, 2].map((m) =>
    template({ id: `tpl.size-${m}.mc4`, attribute: 'size', answer: { from: 'fact.value.names' }, difficultyModifier: m }))
  const index = buildIndex({ entities, facts: sizes, templates: fixtures })
  const modifiers = (cap: number | undefined, seed: number): number[] =>
    itemsForFact(index, 'geo.A.size', seededRng(seed), cap === undefined ? {} : { preferModifierAtMost: cap })
      .map((i) => index.templates.get(i.templateId)!.difficultyModifier!)

  it('puts the hardest ways of asking first once the ceiling is the top', () => {
    for (let seed = 1; seed <= 30; seed++) expect(modifiers(2, seed)[2]).toBe(0)
  })

  it('still asks the easy form last rather than never', () => {
    for (let seed = 1; seed <= 30; seed++) expect(modifiers(2, seed).sort()).toEqual([0, 1, 2])
  })

  it('leaves a lower ceiling exactly as it was: easiest first is not a floor', () => {
    for (let seed = 1; seed <= 30; seed++) {
      expect(modifiers(1, seed).at(-1)).toBe(2)
      expect(modifiers(0, seed)[0]).toBe(0)
    }
  })
})
