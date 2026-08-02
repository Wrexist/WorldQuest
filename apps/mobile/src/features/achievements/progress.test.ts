import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  recordAchievementEvent,
  recordLessonForAchievements,
  resetAchievementCache,
  useAchievementProgress,
} from './progress.js'
import { CATALOGUE } from './useAchievements.js'
import { remove } from '../../lib/storage.js'

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
