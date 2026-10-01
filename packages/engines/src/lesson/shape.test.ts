import { describe, expect, it } from 'vitest'
import { MS_PER_DAY } from '../shared/index.js'
import { review } from '../learning/fsrs.js'
import type { MemoryState } from '../learning/types.js'
import type { Question } from '../content/types.js'
import { hardnessOf, shapeLesson, type ShapeContext } from './shape.js'

const NOW = 1_800_000_000_000

const question = (entity: string, attribute: string, difficulty: number): Question => ({
  item: {
    id: `geo.${entity}.${attribute}@t`, factId: `geo.${entity}.${attribute}`, templateId: 't', entityId: entity,
    difficulty, screenReaderSafe: true,
  },
  promptKey: 'k', promptParams: {}, options: [], modality: 'text', timeLimitMs: null, isNew: false,
})

const ctx = (memory: MemoryState[] = []): ShapeContext => ({
  memory: new Map(memory.map((m) => [m.factId, m] as const)),
  now: NOW,
  attributeOf: (q) => q.item.factId.split('.')[2],
})

/** Ten questions, all unseen, so hardness is difficulty + 1 and the arithmetic is readable. */
const ten = (): Question[] =>
  [3, 1, 5, 2, 4, 1, 3, 5, 2, 4].map((d, i) => question(`E${i}`, ['capital', 'flag', 'currency', 'location'][i % 4]!, d))

describe('shapeLesson', () => {
  it('keeps every question and invents none', () => {
    const input = ten()
    const out = shapeLesson(input, ctx())
    expect(out).toHaveLength(input.length)
    expect(new Set(out.map((q) => q.item.id))).toEqual(new Set(input.map((q) => q.item.id)))
  })

  it('opens with the easiest and climbs', () => {
    const hardness = shapeLesson(ten(), ctx()).map((q) => q.item.difficulty)
    // Warm-up: the two easiest (difficulty 1) come first.
    expect(hardness.slice(0, 2)).toEqual([1, 1])
    // Everything between the warm-up and the finish is non-decreasing.
    const middle = hardness.slice(2, -1)
    expect([...middle].sort((a, b) => a - b)).toEqual(middle)
  })

  it('finishes on a win: the last question is easier than the one before it', () => {
    const out = shapeLesson(ten(), ctx()).map((q) => q.item.difficulty)
    expect(out.at(-1)!).toBeLessThan(out.at(-2)!)
  })

  it('does not shape a lesson too short to have a middle', () => {
    const three = [question('A', 'capital', 4), question('B', 'flag', 1), question('C', 'currency', 3)]
    expect(shapeLesson(three, ctx())).toEqual(three)
  })

  it('never puts two questions about one entity side by side', () => {
    // Easy ones all share an entity, so a plain sort would stack them.
    const input = [
      question('A', 'capital', 1), question('A', 'flag', 1), question('A', 'currency', 1),
      question('B', 'capital', 2), question('C', 'flag', 2), question('D', 'currency', 3),
      question('E', 'location', 4), question('F', 'capital', 5),
    ]
    const out = shapeLesson(input, ctx())
    for (let i = 1; i < out.length; i++) expect(out[i]!.item.entityId).not.toBe(out[i - 1]!.item.entityId)
  })

  it('never runs three questions about one attribute in a row', () => {
    // Capitals are the easy ones, so a plain sort would open with three of them.
    const input = [
      ...['A', 'B', 'C', 'D'].map((e) => question(e, 'capital', 1)),
      ...['E', 'F', 'G', 'H'].map((e, i) => question(e, ['flag', 'currency', 'location', 'flag'][i]!, 3)),
    ]
    const out = shapeLesson(input, ctx()).map((q) => q.item.factId.split('.')[2])
    for (let i = 2; i < out.length; i++) expect(!(out[i] === out[i - 1] && out[i] === out[i - 2])).toBe(true)
  })

  it('is deterministic', () => {
    expect(shapeLesson(ten(), ctx())).toEqual(shapeLesson(ten(), ctx()))
  })

  it('still returns an order when the rules cannot all be met', () => {
    const one = Array.from({ length: 6 }, (_, i) => question('SAME', ['capital', 'flag'][i % 2]!, 1 + (i % 3)))
    expect(shapeLesson(one, ctx())).toHaveLength(6)
  })
})

describe('hardnessOf', () => {
  const learned = (factId: string, daysAgo: number): MemoryState => {
    const base = review({ factId, state: null, rating: 3, now: NOW - daysAgo * MS_PER_DAY })
    return { ...base }
  }

  it('makes a never-seen fact harder than a fresh review of the same difficulty', () => {
    const q = question('A', 'capital', 3)
    const fresh = hardnessOf(q, ctx([learned('geo.A.capital', 0)]))
    expect(hardnessOf(q, ctx())).toBeGreaterThan(fresh)
  })

  it('makes a fact the learner is about to forget harder than one they just saw', () => {
    const q = question('A', 'capital', 3)
    const justSeen = hardnessOf(q, ctx([learned('geo.A.capital', 0)]))
    const fading = hardnessOf(q, ctx([learned('geo.A.capital', 40)]))
    expect(fading).toBeGreaterThan(justSeen)
  })

  it('puts a fading fact after a solid one in the climb', () => {
    const solid = question('A', 'capital', 2)
    const fading = question('B', 'flag', 2)
    const out = shapeLesson(
      [question('C', 'currency', 1), question('D', 'location', 1), solid, fading, question('E', 'capital', 5), question('F', 'flag', 5)],
      ctx([learned('geo.A.capital', 0), learned('geo.B.flag', 60)]),
    )
    const ids = out.map((q) => q.item.factId)
    expect(ids.indexOf('geo.A.capital')).toBeLessThan(ids.indexOf('geo.B.flag'))
  })
})
