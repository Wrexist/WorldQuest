import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { seededRng } from '../shared/index.js'
import { buildIndex, type Entity, type Fact, type Question, type Template } from '../content/index.js'
import type { AnsweredItem } from './machine.js'
import { PLACEMENT_LENGTH, PLACEMENT_MIN_ANSWERS, composePlacement, placementLevel } from './placement.js'

const PACKS = join(import.meta.dirname, '../../../content/packs/geography')
const read = <T,>(f: string): T[] => JSON.parse(readFileSync(join(PACKS, f), 'utf8')).items
const index = buildIndex({
  entities: read<Entity>('entities.countries.v1.json'),
  facts: ['capitals', 'flags', 'currencies', 'locations', 'languages', 'calling-codes', 'area', 'athletes'].flatMap((f) => read<Fact>(`facts.${f}.v1.json`)),
  templates: read<Template>('templates.v1.json'),
})
const test = (seed: number, over: Record<string, unknown> = {}) =>
  composePlacement({ index, rng: seededRng(seed), locale: 'en', modalities: ['text', 'image', 'map'], ...over })

describe('composePlacement', () => {
  it('asks ten questions', () => {
    for (let seed = 1; seed <= 20; seed++) expect(test(seed)).toHaveLength(PLACEMENT_LENGTH)
  })

  it('runs from easy to hard, two to a level', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const d = test(seed).map((q) => q.item.difficulty)
      expect([...d].sort((a, b) => a - b)).toEqual(d)
      expect(Math.min(...d)).toBeLessThanOrEqual(2)
      expect(Math.max(...d)).toBeGreaterThanOrEqual(4)
    }
  })

  it('never asks two about the same country', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const entities = test(seed).map((q) => q.item.entityId)
      expect(new Set(entities).size).toBe(entities.length)
    }
  })

  it('asks only the basics, and only the plain way', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const q of test(seed)) {
        expect(index.facts.get(q.item.factId)!.tags).toContain('core')
        expect(index.templates.get(q.item.templateId)!.difficultyModifier ?? 0).toBe(0)
        expect(q.typed).toBeUndefined()
        expect(q.group).toBeUndefined()
      }
    }
  })

  it('is deterministic for a seed and varies across seeds', () => {
    expect(test(7)).toEqual(test(7))
    expect(new Set([1, 2, 3, 4, 5, 6].map((s) => test(s).map((q) => q.item.id).join())).size).toBeGreaterThan(1)
  })

  it('can be asked for a screen reader, with a question for each place a picture would have been', () => {
    for (const q of test(3, { screenReaderOnly: true })) expect(q.item.screenReaderSafe).toBe(true)
  })
})

describe('placementLevel', () => {
  const questions: Question[] = test(11)
  const answersFor = (right: (q: Question) => boolean, count = questions.length): AnsweredItem[] =>
    questions.slice(0, count).map((q) => ({
      itemId: q.item.id, factId: q.item.factId, templateId: q.item.templateId, chosenOptionId: 'x',
      wasCorrect: right(q), elapsedMs: 4000, answeredAt: 0,
    }))

  it('puts someone who got everything right at the top, and someone who got nothing right at the start', () => {
    expect(placementLevel(answersFor(() => true), questions)).toBe('confident')
    expect(placementLevel(answersFor(() => false), questions)).toBe('new')
  })

  it('puts someone who knows the easy half in the middle', () => {
    expect(placementLevel(answersFor((q) => q.item.difficulty <= 3), questions)).toBe('some')
  })

  it('does not take a lucky run at the hard ones for expertise', () => {
    expect(placementLevel(answersFor((q) => q.item.difficulty >= 4), questions)).not.toBe('confident')
  })

  it('says nothing when the learner left before there is anything to read', () => {
    expect(placementLevel(answersFor(() => true, PLACEMENT_MIN_ANSWERS - 1), questions)).toBeNull()
    expect(placementLevel([], questions)).toBeNull()
  })

  it('is monotone: one more right answer never lowers the level', () => {
    const order = { new: 0, some: 1, confident: 2 } as const
    let seed = 99
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    for (let i = 0; i < 500; i++) {
      const right = questions.map(() => rnd() < 0.5)
      const base = placementLevel(answersFor((q) => right[questions.indexOf(q)]!), questions)!
      const flip = Math.floor(rnd() * questions.length)
      right[flip] = true
      const better = placementLevel(answersFor((q) => right[questions.indexOf(q)]!), questions)!
      expect(order[better]).toBeGreaterThanOrEqual(order[base])
    }
  })
})
