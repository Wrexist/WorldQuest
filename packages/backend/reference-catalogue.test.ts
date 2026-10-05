import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildIndex, entityProgress, isQuizzable, regionProgress, type MemoryState } from '@worldquest/engines'
import { learningContent } from './src/learning-content.js'
import { decodeReferenceCatalogue, encodeReferenceCatalogue } from '../content/src/reference-catalogue.js'

const raw = readFileSync(new URL('../../apps/mobile/assets/content/reference-catalogue.bin', import.meta.url), 'utf8')
const reference = decodeReferenceCatalogue(raw)
const index = buildIndex({ entities: [...learningContent.entities.values()], facts: reference, templates: [] })

describe('the shipped full reference catalogue', () => {
  it('is generated from every active Worker fact with its actual translations and citation', () => {
    expect(JSON.parse(raw)).toEqual(encodeReferenceCatalogue([...learningContent.facts.values()]))
    expect(reference).toHaveLength(learningContent.facts.size)
    for (const fact of reference) {
      const authoritative = learningContent.facts.get(fact.id)!
      expect(fact.entity).toBe(authoritative.entity)
      expect(fact.attribute).toBe(authoritative.attribute)
      expect(fact.value.names).toEqual(authoritative.value.names)
      expect(fact.source).toEqual(authoritative.source)
      expect(isQuizzable(fact)).toBe(isQuizzable(authoritative))
    }
    expect(learningContent.items.every(item => index.facts.has(item.factId))).toBe(true)
  })

  it('counts server-only Swedish facts and European mastery instead of the old 5/251 core totals', () => {
    const now = 1_000_000_000
    const deep = reference.find(fact => fact.entity === 'SE' && fact.attribute === 'athlete')!
    const memory: MemoryState = { factId: deep.id, stability: 200, difficulty: 5, reps: 10, lapses: 0,
      lastReviewAt: now, dueAt: now + 86_400_000, suspended: false }
    const memories = new Map([[deep.id, memory]])
    expect(entityProgress(index, 'SE', memories, now)).toMatchObject({ factsTotal: 130, factsLearned: 1, factsSeen: 1 })
    expect(regionProgress(index, 'EU', memories, now)).toMatchObject({ factsTotal: 2778, factsLearned: 1 })
    expect(entityProgress(index, 'SE', memories, now)).toEqual(entityProgress(learningContent, 'SE', memories, now))
    expect(reference.filter(fact => fact.entity === 'SE')).toHaveLength(130)
  })

  it('rejects incompatible or duplicate data instead of silently lowering the totals', () => {
    expect(() => decodeReferenceCatalogue('{"version":2}')).toThrow()
    const catalogue = JSON.parse(raw)
    catalogue.facts.push(catalogue.facts[0])
    expect(() => decodeReferenceCatalogue(JSON.stringify(catalogue))).toThrow('Invalid reference fact')
  })
})
