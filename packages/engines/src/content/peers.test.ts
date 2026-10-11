/**
 * "Which country is the actor Marlon Brando from?" must be asked among countries actors
 * come from. Before `peersOnly` it was asked beside Barbados, Jamaica and Haiti, and a club
 * question offered Vatican City: answered by knowing which countries are small.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { seededRng } from '../shared/index.js'
import { buildIndex, buildQuestion, type Entity, type Fact, type Template } from './index.js'

const PACKS = join(import.meta.dirname, '../../../content/packs/geography')
const read = <T,>(f: string): T[] => JSON.parse(readFileSync(join(PACKS, f), 'utf8')).items
const index = buildIndex({
  entities: read<Entity>('entities.countries.v1.json'),
  facts: ['actors', 'athletes', 'clubs', 'companies'].flatMap((f) => read<Fact>(`facts.${f}.v1.json`)),
  templates: read<Template>('templates.v1.json'),
})

describe('wrong answers for "where is this from?" come from places that have such things', () => {
  for (const attribute of ['actor', 'athlete', 'club', 'company']) {
    it(attribute, () => {
      const peers = new Set([...index.facts.values()].filter((f) => f.attribute === attribute).map((f) => f.entity))
      let asked = 0
      for (const item of index.items) {
        if (!/-from(-close)?\.mc4$/.test(item.templateId) || index.facts.get(item.factId)?.attribute !== attribute) continue
        const q = buildQuestion(index, item, 'en', seededRng(asked + 1))
        if (q === null) continue
        asked++
        for (const option of q.options) expect(peers.has(option.id), `${item.id}: ${option.label}`).toBe(true)
      }
      expect(asked).toBeGreaterThan(50)
    })
  }
})
