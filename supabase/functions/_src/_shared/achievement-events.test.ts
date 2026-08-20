/**
 * The lesson outcome → achievement event translation, executed against the REAL content.
 *
 * ## The bug this was written for
 *
 * `ach.locations.collector` is a four-tier achievement — bronze at 5 countries, platinum
 * at all 64 — and it could not move a single point. Its rule filters
 * `fact_mastered` on `where: { attribute: 'location' }`; both the server and the client
 * produced that field by splitting the fact id on dots, and the location facts are keyed
 * `geo.AR.continent` while declaring `"attribute": "location"`.
 *
 * Every layer was self-consistent, which is why nothing caught it. The pack's own ceiling
 * check counts facts by their declared attribute and agreed that 64 were available. The
 * rule engine's tests pass `{ attribute: 'flag' }` by hand and prove the filter works. The
 * server's derivation is correct for the other five attributes. Nothing anywhere joined
 * "the event this code emits" to "the event that rule expects" — so this file does, with
 * the shipped packs rather than fixtures, because a fixture would have agreed with
 * whichever half wrote it.
 *
 * ## Why the packs and not a stub
 *
 * A stub proves the function does what the function does. Reading `facts.locations.v1.json`
 * proves the function does what THE CONTENT NEEDS, which is the property that was false.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { achievementEvents, type ContentMaps } from './achievement-events.js'
import {
  evaluateAll,
  type AchievementDef,
  type AchievementProgress,
  type DomainEvent,
} from '../../../../packages/engines/src/achievements/index.js'

const ROOT = join(import.meta.dirname, '../../../..')
const PACKS = join(ROOT, 'packages/content/packs')

const readItems = <T>(rel: string): readonly T[] =>
  (JSON.parse(readFileSync(join(PACKS, rel), 'utf8')) as { items: readonly T[] }).items

type PackFact = { id: string; entity: string; attribute: string }

/** The same three projections `build.ts` writes into the bundle, built the same way. */
const CONTENT: ContentMaps = (() => {
  const entityByFact: Record<string, string> = {}
  const attributeByFact: Record<string, string> = {}
  for (const file of [
    'geography/facts.capitals.v1.json',
    'geography/facts.currencies.v1.json',
    'geography/facts.flags.v1.json',
    'geography/facts.locations.v1.json',
    'geography/facts.languages.v1.json',
    'geography/facts.calling-codes.v1.json',
  ]) {
    for (const fact of readItems<PackFact>(file)) {
      entityByFact[fact.id] = fact.entity
      attributeByFact[fact.id] = fact.attribute
    }
  }
  const regionByEntity: Record<string, string> = {}
  for (const entity of readItems<{ id: string; region?: string }>(
    'geography/entities.countries.v1.json',
  )) {
    if (entity.region !== undefined) regionByEntity[entity.id] = entity.region
  }
  return { entityByFact, attributeByFact, regionByEntity }
})()

const ACHIEVEMENTS = readItems<AchievementDef>('achievements/core.v1.json')

const base = {
  graded: [],
  masteryChanges: [],
  entityMastered: [],
  overdueCleared: 0,
  streak: null,
  accuracy: 1,
  durationMs: 60_000,
  questCompleted: false,
  xpTotalAfter: 0,
  at: 1_700_000_000_000,
} as const

const emit = (over: Partial<Parameters<typeof achievementEvents>[0]>) =>
  achievementEvents({ ...base, ...over }, CONTENT)

/** Every fact of one attribute, so a test can say "master five countries' locations". */
const factsWithAttribute = (attribute: string): readonly string[] =>
  Object.keys(CONTENT.attributeByFact).filter((id) => CONTENT.attributeByFact[id] === attribute)

/** Run events through the real engine and report which tiers came out. */
const unlocksFrom = (events: readonly DomainEvent[]): readonly string[] => {
  let progress = new Map<string, AchievementProgress>()
  const unlocked: string[] = []
  for (const event of events) {
    const evaluated = evaluateAll(ACHIEVEMENTS, progress, event)
    progress = evaluated.progress
    unlocked.push(...evaluated.unlocked.map((u) => `${u.achievementId}:${u.tier}`))
  }
  return unlocked
}

describe('the attribute comes from the fact, not from its name', () => {
  it('reports every pack attribute exactly as the fact declares it', () => {
    // Five of the six agree with the last segment of the id. The sixth is the bug: the
    // location facts are keyed `.continent`. If this list ever shrinks to five, the
    // derivation has crept back in.
    const attributes = new Set(Object.values(CONTENT.attributeByFact))
    expect([...attributes].sort()).toEqual([
      'calling-code',
      'capital',
      'currency',
      'flag',
      'language',
      'location',
    ])
  })

  it('emits `location` for a fact whose id ends in `.continent`', () => {
    const [event] = emit({ masteryChanges: [{ factId: 'geo.AR.continent', to: 'mastered' }] })
    expect(event).toMatchObject({
      name: 'fact_mastered',
      payload: { attribute: 'location', entityId: 'AR', factId: 'geo.AR.continent' },
    })
  })

  it('unlocks ach.locations.collector, which no user could ever reach', () => {
    // The whole point. Bronze is 5 distinct entities, and this used to award nothing at
    // any number, because `attribute: 'continent'` matched no rule in the catalogue.
    const events = factsWithAttribute('location')
      .slice(0, 5)
      .flatMap((factId) => emit({ masteryChanges: [{ factId, to: 'mastered' }] }))
    expect(unlocksFrom(events)).toContain('ach.locations.collector:bronze')
  })

  it('still unlocks the five collectors whose id and attribute happen to agree', () => {
    // The fix must not be a special case for `location`. Each of these needs 5 distinct
    // entities for bronze, exactly as before.
    for (const [attribute, achievement] of [
      ['capital', 'ach.capitals.collector'],
      ['flag', 'ach.flags.collector'],
      ['currency', 'ach.currencies.collector'],
      ['calling-code', 'ach.codes.collector'],
      ['language', 'ach.languages.collector'],
    ] as const) {
      const events = factsWithAttribute(attribute)
        .slice(0, 5)
        .flatMap((factId) => emit({ masteryChanges: [{ factId, to: 'mastered' }] }))
      expect(unlocksFrom(events), attribute).toContain(`${achievement}:bronze`)
    }
  })

  it('skips a fact the shipped packs no longer contain', () => {
    // Mastery rows outlive the pack that created them, so a retired fact is an ordinary
    // thing to meet. Skipped, never guessed at from the text of the id.
    expect(emit({ masteryChanges: [{ factId: 'geo.ZZ.capital', to: 'mastered' }] })).toEqual(
      emit({}),
    )
  })
})

describe('which mastery transitions count', () => {
  it('counts mastered and burnished, and nothing else', () => {
    for (const to of ['mastered', 'burnished']) {
      expect(emit({ masteryChanges: [{ factId: 'geo.SE.capital', to }] })[0]).toMatchObject({
        name: 'fact_mastered',
      })
    }
    for (const to of ['learning', 'review', 'new', 'lapsed']) {
      expect(emit({ masteryChanges: [{ factId: 'geo.SE.capital', to }] }), to).toEqual(emit({}))
    }
  })
})

describe('one event per cleared review', () => {
  it('emits one each, because `counter` counts events rather than reading a number', () => {
    // A single event carrying `{ count: 10 }` would make a ten-review lesson worth one,
    // and `ach.review.faithful`'s 1000 tier a decade of work.
    const graded = Array.from({ length: 10 }, (_, i) => ({ factId: `f${i}`, wasCorrect: true }))
    const events = emit({ overdueCleared: 10, graded })
    expect(events.filter((e) => e.name === 'overdue_review_cleared')).toHaveLength(10)
  })

  it('never emits more than the lesson had answers', () => {
    // The count comes from `record_lesson`'s response. A loop whose trip count is a
    // number off the wire is a hang if that number is ever wrong.
    const graded = [{ factId: 'geo.SE.capital', wasCorrect: true }]
    expect(
      emit({ overdueCleared: 10_000, graded }).filter((e) => e.name === 'overdue_review_cleared'),
    ).toHaveLength(1)
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -5, 2.5]) {
      const events = emit({ overdueCleared: bad, graded })
      const cleared = events.filter((e) => e.name === 'overdue_review_cleared').length
      expect(cleared, String(bad)).toBeLessThanOrEqual(1)
    }
  })
})

describe('the region a lesson earned something in', () => {
  it('reports a region only for an answer that was right', () => {
    const graded = [{ factId: 'geo.SE.capital', wasCorrect: false }]
    expect(emit({ graded }).filter((e) => e.name === 'region_started')).toHaveLength(0)
    expect(
      emit({ graded: [{ factId: 'geo.SE.capital', wasCorrect: true }] }).filter(
        (e) => e.name === 'region_started',
      ),
    ).toEqual([{ name: 'region_started', at: base.at, payload: { region: 'EU' } }])
  })

  it('reports each region once however many facts came from it', () => {
    const graded = ['geo.SE.capital', 'geo.NO.capital', 'geo.DK.capital'].map((factId) => ({
      factId,
      wasCorrect: true,
    }))
    expect(emit({ graded }).filter((e) => e.name === 'region_started')).toHaveLength(1)
  })
})

describe('the events that carry a number a rule compares', () => {
  it('reports the level the awarded XP puts the user on, absolutely', () => {
    // `threshold` compares the stat the event reports, so an incremental value would make
    // `ach.level.climber` compare a delta against a level.
    const [level] = emit({ xpTotalAfter: 84_530 }).filter((e) => e.name === 'level_reached')
    expect((level?.payload as { level: number }).level).toBeGreaterThan(1)
    const [zero] = emit({ xpTotalAfter: -1 }).filter((e) => e.name === 'level_reached')
    expect((zero?.payload as { level: number }).level).toBe(1)
  })

  it('omits the streak event entirely when this lesson did not change it', () => {
    // `null` means "not today's first lesson". Emitting the unchanged length would make
    // `ach.streak.keeper` count submissions rather than days.
    expect(emit({ streak: null }).some((e) => e.name === 'streak_extended')).toBe(false)
    expect(emit({ streak: 30 })).toContainEqual({
      name: 'streak_extended',
      at: base.at,
      payload: { length: 30 },
    })
  })

  it('emits the quest event only when this submission completed it', () => {
    expect(emit({ questCompleted: false }).some((e) => e.name === 'daily_quest_completed')).toBe(
      false,
    )
    expect(emit({ questCompleted: true }).some((e) => e.name === 'daily_quest_completed')).toBe(
      true,
    )
  })

  it('always reports the lesson itself, with the server-measured accuracy and duration', () => {
    expect(emit({ accuracy: 1, durationMs: 45_000 })).toContainEqual({
      name: 'lesson_completed',
      at: base.at,
      payload: { accuracy: 1, durationMs: 45_000 },
    })
  })
})

describe('every rule in the catalogue has a producer here', () => {
  it('emits an event for each event name the shipped rules count', () => {
    // The check that would have caught `ach.level.climber` having no producer at all, and
    // the shape of the one that missed `location`: it compares the catalogue against what
    // this function actually emits, rather than against a list somebody maintained.
    const needed = new Set<string>()
    const walk = (rule: { type?: string; event?: string; rules?: unknown[] }): void => {
      if (typeof rule.event === 'string') needed.add(rule.event)
      if (rule.type === 'streak') needed.add('streak_extended')
      if (rule.type === 'threshold') needed.add('level_reached')
      for (const inner of rule.rules ?? []) walk(inner as typeof rule)
    }
    for (const achievement of ACHIEVEMENTS) walk(achievement.rule as Parameters<typeof walk>[0])

    const produced = new Set(
      emit({
        masteryChanges: [{ factId: 'geo.SE.capital', to: 'mastered' }],
        entityMastered: ['SE'],
        graded: [{ factId: 'geo.SE.capital', wasCorrect: true }],
        overdueCleared: 1,
        streak: 3,
        questCompleted: true,
      }).map((e) => e.name),
    )
    expect([...needed].filter((name) => !produced.has(name))).toEqual([])
  })
})
