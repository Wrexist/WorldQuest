/**
 * US states and Swedish counties are opt-in (`Entity.within`). What would hurt if it were
 * wrong: a Swedish ten-year-old's mixed lesson or daily quest filling up with Wyoming; a
 * lesson that ASKED for the states getting none; a state's wrong answers being countries.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { seededRng } from '../shared/index.js'
import { buildIndex, type Entity, type Fact, type Template } from '../content/index.js'
import { generateDailyQuest } from '../quests/index.js'
import { worldProgress } from '../progression/index.js'
import { composeLesson } from './compose.js'
import { focusFilter } from './focus.js'

const PACKS = join(import.meta.dirname, '../../../content/packs/geography')
const read = <T,>(f: string): T[] => JSON.parse(readFileSync(join(PACKS, f), 'utf8')).items
const countries = read<Entity>('entities.countries.v1.json')
const subdivisions = read<Entity>('entities.subdivisions.v1.json')
const index = buildIndex({
  entities: [...countries, ...subdivisions],
  facts: ['capitals', 'flags', 'locations', 'subdivision-capitals', 'subdivision-regions'].flatMap((f) => read<Fact>(`facts.${f}.v1.json`)),
  templates: read<Template>('templates.v1.json'),
})
const nested = (entityId: string) => index.entities.get(entityId)?.within !== undefined
const MAP = ['text', 'image', 'map'] as const

describe('states and counties are opt-in', () => {
  it('never appear new in an ordinary lesson', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const questions = composeLesson({ index, memory: [], now: 0, rng: seededRng(seed), locale: 'en', count: 15, modalities: MAP })
      expect(questions.some((q) => nested(q.item.entityId))).toBe(false)
    }
  })

  it('make up a lesson that asks for them, with states as the wrong answers', () => {
    const states = subdivisions.filter((s) => s.within === 'US').map((s) => s.id)
    const questions = composeLesson({
      index, memory: [], now: 0, rng: seededRng(3), locale: 'en', count: 10, modalities: MAP,
      topicFilter: focusFilter(index, { entities: states })!, nested: true,
    })
    expect(questions).toHaveLength(10)
    for (const q of questions) {
      expect(states).toContain(q.item.entityId)
      // Options are states or capitals of states, never a country or a country's capital.
      if (index.templates.get(q.item.templateId)?.answer.from === 'entity.names') {
        for (const option of q.options) expect(states, `${q.item.id}: ${option.label}`).toContain(option.id)
      }
    }
  })

  it('are never introduced by a daily quest', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const quest = generateDailyQuest({ userId: 'u', date: '2026-10-11', index, memory: new Map(), now: 0, rng: seededRng(seed), recentAccuracy: 0.8 })
      const factIds = quest.tasks.flatMap((task) => task.factIds)
      expect(factIds.some((id) => nested(index.facts.get(id)!.entity))).toBe(false)
    }
  })

  it('are not counted among the world’s countries', () => {
    expect(worldProgress(index, new Map(), 0).entitiesTotal).toBe(countries.length)
  })
})
