/**
 * The map drill: "Find Austria on the map", answered by tapping it.
 *
 * What is asserted is what would hurt if it were wrong: an ordinary lesson never asks for a
 * tap (the host did not offer to draw a pickable map), a drill asks for nothing else, every
 * country of the region is an option (each is a place the map may accept, and the server
 * grades only options it issued), and nothing on screen draws the answer before it is tapped.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { seededRng } from '../shared/index.js'
import { buildIndex, type Entity, type Fact, type Template } from '../content/index.js'
import { composeLesson } from './compose.js'
import { focusFilter } from './focus.js'

const PACKS = join(import.meta.dirname, '../../../content/packs/geography')
const read = <T,>(f: string): T[] => JSON.parse(readFileSync(join(PACKS, f), 'utf8')).items
const entities = read<Entity>('entities.countries.v1.json')
const index = buildIndex({
  entities,
  facts: ['capitals', 'flags', 'locations', 'languages'].flatMap((f) => read<Fact>(`facts.${f}.v1.json`)),
  templates: read<Template>('templates.v1.json'),
})
const europe = entities.filter((e) => e.region === 'EU').map((e) => e.id)
const topicFilter = focusFilter(index, { entities: europe })!
const MAP = ['text', 'image', 'map'] as const

const drill = (seed: number, over: Record<string, unknown> = {}) =>
  composeLesson({ index, memory: [], now: 0, rng: seededRng(seed), locale: 'en', count: 10, modalities: MAP, topicFilter, input: 'tap', ...over })

describe('a map drill', () => {
  it('asks only by tapping, a full lesson of it', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const questions = drill(seed)
      expect(questions).toHaveLength(10)
      for (const q of questions) {
        expect(q.tap).toBe(true)
        expect(index.templates.get(q.item.templateId)!.input).toBe('tap')
        expect(q.group).toBeUndefined()
      }
    }
  })

  it('offers every country of the region, near-namesakes included', () => {
    const q = drill(3)[0]!
    expect(new Set(q.options.map((o) => o.id))).toEqual(new Set(europe))
    expect(q.options.filter((o) => o.isCorrect).map((o) => o.id)).toEqual([q.item.entityId])
    // Slovakia beside Slovenia is a spelling trap in a list; on a map they are two places.
    if (europe.includes('SK') && europe.includes('SI')) expect(q.options.map((o) => o.id)).toEqual(expect.arrayContaining(['SK', 'SI']))
  })

  it('names the country and draws nothing that would answer it', () => {
    for (const q of drill(5)) {
      expect(q.promptParams.entityName).toBeTruthy()
      expect(q.locator).toBeUndefined()
      expect(q.promptAsset).toBeUndefined()
    }
  })

  it('never asks two about the same country', () => {
    const ids = drill(9).map((q) => q.item.entityId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is deterministic for a seed', () => {
    expect(drill(11)).toEqual(drill(11))
  })

  it('is spoken to a screen reader: the same facts, asked the accessible way', () => {
    const questions = drill(4, { screenReaderOnly: true })
    expect(questions.length).toBeGreaterThanOrEqual(5)
    for (const q of questions) {
      expect(q.tap).toBeUndefined()
      expect(q.item.screenReaderSafe).toBe(true)
      expect(index.facts.get(q.item.factId)!.attribute).toBe('location')
    }
  })
})

describe('an ordinary lesson', () => {
  it('never asks for a tap, whatever the seed', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const questions = composeLesson({ index, memory: [], now: 0, rng: seededRng(seed), locale: 'en', count: 15, modalities: MAP })
      for (const q of questions) {
        expect(q.tap).toBeUndefined()
        expect(index.templates.get(q.item.templateId)!.input).not.toBe('tap')
      }
    }
  })
})
