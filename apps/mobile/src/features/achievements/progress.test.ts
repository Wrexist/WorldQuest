import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  recordAchievementEvent,
  recordLessonForAchievements,
  recordServerOutcome,
  resetAchievementCache,
  useAchievementProgress,
} from './progress.js'
import { CATALOGUE } from './useAchievements.js'
import { remove } from '../../lib/storage.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every shipped fact, read from the packs DIRECTORY rather than from a list here.
 *
 * The list-that-falls-behind is a bug this repo has already had twice —
 * `facts.locations.v1.json` shipped with artwork, templates and a generator and produced
 * no questions for weeks because nothing imported it. Walking the directory means a new
 * attribute is covered by the test below on the day it lands.
 */
const PACK_DIR = join(import.meta.dirname, '../../../../../packages/content/packs/geography')
const FACTS: readonly { id: string; entity: string; attribute: string }[] = readdirSync(PACK_DIR)
  .filter((f) => f.startsWith('facts.') && f.endsWith('.json'))
  .flatMap(
    (f) =>
      (
        JSON.parse(readFileSync(join(PACK_DIR, f), 'utf8')) as {
          items: { id: string; entity: string; attribute: string }[]
        }
      ).items,
  )

const lesson = (over: { accuracy?: number; durationMs?: number } = {}) =>
  recordLessonForAchievements({
    accuracy: over.accuracy ?? 0.8,
    durationMs: over.durationMs ?? 120_000,
    at: Date.parse('2026-08-02T12:00:00Z'),
  })

beforeEach(() => {
  remove('achievements.progress.v1')
  resetAchievementCache()
})

describe('achievement progress', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useAchievementProgress())
    expect(result.current.size).toBe(0)
  })

  it('counts finished lessons', () => {
    // The bug this closes: useAchievements() was called with no progress map, so this
    // counter could never move off zero and no tier could ever unlock.
    const { result } = renderHook(() => useAchievementProgress())
    act(() => void lesson())
    act(() => void lesson())
    expect(result.current.get('ach.lessons.done')?.value).toBe(2)
  })

  it('unlocks a tier once the threshold is crossed', () => {
    const def = CATALOGUE.find((d) => d.id === 'ach.lessons.done')!
    const first = [...def.tiers].sort((a, b) => a.threshold - b.threshold)[0]!

    let unlocked: readonly { achievementId: string }[] = []
    act(() => {
      for (let i = 0; i < first.threshold; i++) unlocked = lesson()
    })

    expect(unlocked.some((u) => u.achievementId === 'ach.lessons.done')).toBe(true)
    const { result } = renderHook(() => useAchievementProgress())
    expect(result.current.get('ach.lessons.done')?.tier).toBe(first.tier)
  })

  it('counts a perfect lesson only when it was perfect', () => {
    act(() => void lesson({ accuracy: 0.9 }))
    const { result, rerender } = renderHook(() => useAchievementProgress())
    expect(result.current.get('ach.session.perfect')?.value ?? 0).toBe(0)

    act(() => void lesson({ accuracy: 1 }))
    rerender()
    expect(result.current.get('ach.session.perfect')?.value).toBe(1)
  })

  it('needs both speed AND accuracy for the speedrun', () => {
    // Perfect but slow, then fast but imperfect. Neither should count.
    act(() => void lesson({ accuracy: 1, durationMs: 120_000 }))
    act(() => void lesson({ accuracy: 0.5, durationMs: 30_000 }))
    const { result, rerender } = renderHook(() => useAchievementProgress())
    expect(result.current.get('ach.session.speedrun')?.value ?? 0).toBe(0)

    act(() => void lesson({ accuracy: 1, durationMs: 30_000 }))
    rerender()
    expect(result.current.get('ach.session.speedrun')?.value).toBe(1)
  })

  it('does not move achievements the client cannot honestly observe', () => {
    // Flags, capitals, streaks and quests all need data the device does not have.
    // An achievement that unlocks on nothing is worse than one that stays locked.
    act(() => void lesson({ accuracy: 1, durationMs: 30_000 }))
    const { result } = renderHook(() => useAchievementProgress())
    for (const id of ['ach.flags.collector', 'ach.streak.keeper', 'ach.quest.regular']) {
      expect(result.current.get(id)?.value ?? 0).toBe(0)
    }
  })

  it('survives a restart', () => {
    act(() => void lesson())
    resetAchievementCache()
    const { result } = renderHook(() => useAchievementProgress())
    expect(result.current.get('ach.lessons.done')?.value).toBe(1)
  })

  it('drops rows for achievements the shipped packs no longer carry', () => {
    // A removed achievement leaves rows behind on every device that ever had it, and
    // a stale row renders as a row with no name.
    act(() => void recordAchievementEvent({ name: 'lesson_completed', at: 0 }))
    resetAchievementCache()
    const { result } = renderHook(() => useAchievementProgress())
    for (const id of result.current.keys()) {
      expect(CATALOGUE.some((def) => def.id === id)).toBe(true)
    }
  })
})

/**
 * The server's answer, forwarded to the rule engine.
 *
 * `recordServerOutcome` had no test, and it is the producer for four of the six event
 * kinds the catalogue counts — including the one that was wrong.
 */
describe('what the server tells us a lesson did', () => {
  const outcome = (over: Partial<Parameters<typeof recordServerOutcome>[0]> = {}) =>
    recordServerOutcome({
      masteryChanges: [],
      streak: null,
      overdueCleared: 0,
      entityMastered: [],
      regionsStarted: [],
      at: Date.parse('2026-08-02T12:00:00Z'),
      ...over,
    })

  it('moves every collector the pack ships, including the one whose id lies', () => {
    // `ach.locations.collector` filters `attribute: 'location'`, and its facts are keyed
    // `geo.XX.continent`. Splitting the id made all four of its tiers unreachable — with
    // `showProgress: true`, so the screen drew a bar towards a number nobody could reach.
    //
    // Driven from the real packs rather than a fixture, because a fixture would have
    // agreed with whichever half wrote it. Each collector needs 5 distinct entities.
    const factsFor = (attribute: string) =>
      FACTS.filter((f) => f.attribute === attribute)
        .slice(0, 5)
        .map((f) => f.id)

    for (const [attribute, id] of [
      ['capital', 'ach.capitals.collector'],
      ['flag', 'ach.flags.collector'],
      ['currency', 'ach.currencies.collector'],
      ['location', 'ach.locations.collector'],
      ['calling-code', 'ach.codes.collector'],
      ['language', 'ach.languages.collector'],
    ] as const) {
      remove('achievements.progress.v1')
      resetAchievementCache()
      const ids = factsFor(attribute)
      expect(ids, attribute).toHaveLength(5)
      act(() => {
        void outcome({ masteryChanges: ids.map((factId) => ({ factId, to: 'mastered' })) })
      })
      const { result } = renderHook(() => useAchievementProgress())
      expect(result.current.get(id)?.value ?? 0, `${attribute} → ${id}`).toBe(5)
    }
  })

  it('counts only a change INTO a mastered state', () => {
    act(() => {
      void outcome({ masteryChanges: [{ factId: 'geo.SE.capital', to: 'learning' }] })
    })
    const { result } = renderHook(() => useAchievementProgress())
    expect(result.current.get('ach.capitals.collector')?.value ?? 0).toBe(0)
  })

  it('ignores a fact the shipped packs no longer contain', () => {
    // Mastery rows outlive the pack that created them. A retired fact must be skipped,
    // never guessed at from the text of its id.
    act(() => {
      void outcome({ masteryChanges: [{ factId: 'geo.ZZ.capital', to: 'mastered' }] })
    })
    const { result } = renderHook(() => useAchievementProgress())
    expect(result.current.get('ach.capitals.collector')?.value ?? 0).toBe(0)
    expect(result.current.get('ach.facts.everything')?.value ?? 0).toBe(0)
  })

  it('never emits more cleared reviews than a lesson could hold', () => {
    // The count arrives over the network. A loop whose trip count is a number off the
    // wire is a hang if that number is ever wrong.
    for (const overdueCleared of [Number.NaN, Number.POSITIVE_INFINITY, -5, 1e9]) {
      remove('achievements.progress.v1')
      resetAchievementCache()
      act(() => void outcome({ overdueCleared }))
      const { result } = renderHook(() => useAchievementProgress())
      expect(result.current.get('ach.review.faithful')?.value ?? 0, String(overdueCleared)).toBeLessThanOrEqual(100)
    }
  })
})
