import { describe, expect, it } from 'vitest'
import { buildIndex } from '../content/index.js'
import type { Entity, Fact, Template } from '../content/types.js'
import type { FactId, MemoryState } from '../learning/types.js'
import { entityProgress, isLearned, regionProgress, worldProgress } from './index.js'

const NOW = Date.parse('2026-08-01T09:00:00Z')
const DAY = 86_400_000

const entity = (id: string, region: string): Entity => ({
  id,
  type: 'country',
  names: { en: id },
  region,
})

const fact = (id: string, entityId: string, attribute: string, extra: Partial<Fact> = {}): Fact => ({
  id,
  entity: entityId,
  attribute,
  value: { names: { en: `${id} value` } },
  difficulty: 3,
  volatility: 'stable',
  ...extra,
})

const template = (attribute: string): Template => ({
  id: `tpl.${attribute}`,
  attribute,
  modality: 'text',
  prompt: { key: `lesson:prompt.${attribute}`, params: ['entityName'] },
  answer: { from: 'fact.value.names' },
  distractors: { count: 3, strategy: 'same-region' },
  a11y: { screenReaderSafe: true },
})

const index = buildIndex({
  entities: [entity('SE', 'EU'), entity('FR', 'EU'), entity('JP', 'AS')],
  facts: [
    fact('SE.capital', 'SE', 'capital'),
    fact('SE.flag', 'SE', 'flag'),
    fact('FR.capital', 'FR', 'capital'),
    fact('JP.capital', 'JP', 'capital'),
  ],
  templates: [template('capital'), template('flag')],
})

/** A memory state at a given stability, which is what mastery is derived from. */
const memoryAt = (factId: string, stability: number, dueInDays: number): MemoryState => ({
  factId,
  stability,
  difficulty: 5,
  reps: 5,
  lapses: 0,
  lastReviewAt: NOW - DAY,
  dueAt: NOW + dueInDays * DAY,
  suspended: false,
})

const mapOf = (...states: MemoryState[]): ReadonlyMap<FactId, MemoryState> =>
  new Map(states.map((s) => [s.factId, s]))

describe('entity progress', () => {
  it('is unseen when nothing has been reviewed', () => {
    const progress = entityProgress(index, 'SE', new Map(), NOW)
    expect(progress.mastery).toBe('unseen')
    expect(progress.factsTotal).toBe(2)
    expect(progress.factsLearned).toBe(0)
    expect(progress.complete).toBe(false)
  })

  it('reports the WEAKEST fact, not the average', () => {
    // Sweden's capital is burnished; its flag has never been seen. The user does not
    // know Sweden — and a screen that says otherwise stops teaching them the flag.
    // An average would report "proficient" and hide exactly the gap.
    const progress = entityProgress(index, 'SE', mapOf(memoryAt('SE.capital', 400, 90)), NOW)
    expect(progress.mastery).toBe('unseen')
    expect(progress.factsLearned).toBe(1)
    expect(progress.complete).toBe(false)
  })

  it('is complete only when every quizzable fact is learned', () => {
    const progress = entityProgress(
      index,
      'SE',
      mapOf(memoryAt('SE.capital', 400, 90), memoryAt('SE.flag', 400, 90)),
      NOW,
    )
    expect(isLearned(progress.mastery)).toBe(true)
    expect(progress.complete).toBe(true)
    expect(progress.factsLearned).toBe(2)
  })

  it('counts facts that are due now', () => {
    const progress = entityProgress(
      index,
      'SE',
      mapOf(memoryAt('SE.capital', 400, -1), memoryAt('SE.flag', 400, 5)),
      NOW,
    )
    expect(progress.factsDue).toBe(1)
  })

  it('ignores non-quizzable facts rather than blocking completion on them', () => {
    // A disputed capital or a population that changes yearly is still shown, but
    // counting it would make the country permanently incompletable through no fault
    // of the learner.
    const withUnquizzable = buildIndex({
      entities: [entity('XX', 'EU')],
      facts: [
        fact('XX.capital', 'XX', 'capital'),
        fact('XX.population', 'XX', 'population', { quizzable: false, volatility: 'fast' }),
      ],
      templates: [template('capital')],
    })

    const progress = entityProgress(
      withUnquizzable,
      'XX',
      mapOf(memoryAt('XX.capital', 400, 90)),
      NOW,
    )
    expect(progress.factsTotal).toBe(1)
    expect(progress.complete).toBe(true)
  })

  it('does not report mastery for an entity with nothing to assess', () => {
    // "Burnished by default" would inflate every total above it.
    const empty = buildIndex({ entities: [entity('ZZ', 'EU')], facts: [], templates: [] })
    const progress = entityProgress(empty, 'ZZ', new Map(), NOW)
    expect(progress.mastery).toBe('unseen')
    expect(progress.complete).toBe(false)
  })
})

describe('region progress', () => {
  it('sums the entities in that region and no others', () => {
    const progress = regionProgress(index, 'EU', new Map(), NOW)
    expect(progress.entitiesTotal).toBe(2)
    expect(progress.factsTotal).toBe(3) // SE ×2 + FR ×1; Japan is not Europe
  })

  it('measures the fraction by facts, not by entities', () => {
    // Half-learning every country in a region has to move the bar. Counting whole
    // countries shows 0 % for weeks, and progress a user cannot see is progress they
    // assume they have not made.
    const progress = regionProgress(index, 'EU', mapOf(memoryAt('SE.capital', 400, 90)), NOW)
    expect(progress.entitiesComplete).toBe(0)
    expect(progress.fraction).toBeCloseTo(1 / 3)
    expect(progress.entitiesStarted).toBe(1)
  })

  it('is zero, not NaN, for a region with no facts', () => {
    const empty = buildIndex({ entities: [entity('AQ', 'AN')], facts: [], templates: [] })
    expect(regionProgress(empty, 'AN', new Map(), NOW).fraction).toBe(0)
  })
})

describe('world progress', () => {
  it('covers every region present in the content', () => {
    const world = worldProgress(index, new Map(), NOW)
    expect(world.regions.map((r) => r.region)).toEqual(['AS', 'EU'])
    expect(world.entitiesTotal).toBe(3)
    expect(world.factsTotal).toBe(4)
  })

  it('orders regions stably so the grid does not reshuffle as you learn', () => {
    const before = worldProgress(index, new Map(), NOW).regions.map((r) => r.region)
    const after = worldProgress(
      index,
      mapOf(memoryAt('JP.capital', 400, 90), memoryAt('SE.capital', 400, 90)),
      NOW,
    ).regions.map((r) => r.region)
    expect(after).toEqual(before)
  })

  it('rolls the totals up from the regions', () => {
    const world = worldProgress(
      index,
      mapOf(memoryAt('SE.capital', 400, 90), memoryAt('JP.capital', 400, -2)),
      NOW,
    )
    expect(world.factsLearned).toBe(2)
    expect(world.factsDue).toBe(1)
    expect(world.entitiesComplete).toBe(1) // Japan: its only fact is learned
    expect(world.fraction).toBeCloseTo(2 / 4)
  })
})
