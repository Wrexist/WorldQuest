import { describe, expect, it } from 'vitest'
import { MS_PER_DAY } from '../shared/index.js'
import { review } from '../learning/fsrs.js'
import type { MemoryState } from '../learning/types.js'
import { buildIndex, type Entity, type Fact, type Template } from '../content/index.js'
import { FADING_BELOW, FADING_MIN_KNOWN, strengthOf } from './strength.js'

const NOW = 1_800_000_000_000
const IDS = ['SE', 'NO', 'DK', 'FI', 'IS']
const entities: Entity[] = IDS.map((id) => ({ id, type: 'country', names: { en: id }, region: 'EU', subregion: 'north' }))
const facts: Fact[] = IDS.flatMap((id) =>
  ['capital', 'flag'].map((attribute) => ({ id: `geo.${id}.${attribute}`, entity: id, attribute, value: { names: { en: `${id}-${attribute}` } }, difficulty: 1, volatility: 'stable' as const })))
const tpl = (attribute: string): Template => ({
  id: `tpl.${attribute}.mc4`, attribute, modality: 'text', prompt: { key: 'k', params: [] }, answer: { from: 'fact.value.names' },
  a11y: { screenReaderSafe: true }, timeLimitMs: null,
})
const index = buildIndex({ entities, facts, templates: [tpl('capital'), tpl('flag')] })

const learned = (factId: string, daysAgo: number, over: Partial<MemoryState> = {}): MemoryState => ({
  ...review({ factId, state: null, rating: 3, now: NOW - daysAgo * MS_PER_DAY }), ...over,
})
const memoryOf = (states: MemoryState[]) => new Map(states.map((s) => [s.factId, s] as const))

describe('strengthOf', () => {
  it('counts what the focus covers and what the learner has met', () => {
    const s = strengthOf(index, memoryOf([learned('geo.SE.capital', 0), learned('geo.NO.capital', 0)]), { attributes: ['capital'] }, NOW)
    expect(s.total).toBe(5)
    expect(s.known).toBe(2)
  })

  it('reads a fresh step as strong: not fading, however much it covers', () => {
    const states = IDS.map((id) => learned(`geo.${id}.capital`, 0))
    const s = strengthOf(index, memoryOf(states), { attributes: ['capital'] }, NOW)
    expect(s.retention).toBeGreaterThan(0.9)
    expect(s.fading).toBe(false)
  })

  it('reads a step left for months as fading', () => {
    const states = IDS.map((id) => learned(`geo.${id}.capital`, 200))
    const s = strengthOf(index, memoryOf(states), { attributes: ['capital'] }, NOW)
    expect(s.retention!).toBeLessThan(FADING_BELOW)
    expect(s.fading).toBe(true)
  })

  it('is monotone in time: the longer it is left, the lower the retention', () => {
    const at = (days: number) => strengthOf(index, memoryOf(IDS.map((id) => learned(`geo.${id}.capital`, days))), { attributes: ['capital'] }, NOW).retention!
    expect(at(1)).toBeGreaterThan(at(30))
    expect(at(30)).toBeGreaterThan(at(300))
  })

  it('will not call a step rusty from a handful of facts', () => {
    const few = Array.from({ length: FADING_MIN_KNOWN - 1 }, (_, i) => learned(`geo.${IDS[i]}.capital`, 400))
    const s = strengthOf(index, memoryOf(few), { attributes: ['capital'] }, NOW)
    expect(s.retention!).toBeLessThan(FADING_BELOW)
    expect(s.fading).toBe(false)
  })

  it('ignores a leech the scheduler is resting, which it has already decided to stop showing', () => {
    const states = [
      ...IDS.slice(0, 3).map((id) => learned(`geo.${id}.capital`, 0)),
      learned('geo.FI.capital', 400, { suspended: true }),
    ]
    const s = strengthOf(index, memoryOf(states), { attributes: ['capital'] }, NOW)
    expect(s.known).toBe(3)
    expect(s.fading).toBe(false)
  })

  it('says nothing for a step the learner has not started', () => {
    const s = strengthOf(index, memoryOf([]), { attributes: ['flag'] }, NOW)
    expect(s.known).toBe(0)
    expect(s.retention).toBeNull()
    expect(s.fading).toBe(false)
  })

  it('narrows by entity and attribute together, like a course step', () => {
    const states = [...IDS.map((id) => learned(`geo.${id}.capital`, 300)), ...IDS.map((id) => learned(`geo.${id}.flag`, 0))]
    expect(strengthOf(index, memoryOf(states), { attributes: ['capital'], entities: ['SE', 'NO', 'DK'] }, NOW).fading).toBe(true)
    expect(strengthOf(index, memoryOf(states), { attributes: ['flag'], entities: ['SE', 'NO', 'DK'] }, NOW).fading).toBe(false)
  })
})
