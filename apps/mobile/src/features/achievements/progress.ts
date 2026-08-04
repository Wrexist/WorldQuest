/**
 * Achievement progress, evaluated on the device.
 *
 * ## The gap this closes
 *
 * `useAchievements()` was called with no progress map, defaulting to empty. So every
 * achievement was permanently locked and the screen could never show a single unlock —
 * the definitions, the tier maths, the sorting and all the copy were built, and none
 * of it could ever fire. `pnpm reachability` is what finally named it.
 *
 * ## Optimistic, exactly like XP
 *
 * Achievements award coins, so the server is the authority (ADR 0006). This is a
 * prediction the client renders immediately and the server later confirms or corrects
 * — the same bargain `gradeLesson` already makes. It is not a way to grant anything:
 * nothing here writes a balance.
 *
 * ## Only the events the client genuinely knows
 *
 * `lesson_completed` is fully observable on the device: the count, the accuracy and
 * the duration are all measured here, so three achievements become genuinely
 * reachable — lessons finished, perfect lessons, and perfect lessons under a minute.
 *
 * The rest are NOT wired, and deliberately:
 *
 * - `fact_mastered` / `entity_mastered` need real memory state, which arrives with the
 *   server. Emitting them from an empty local map would unlock nothing, or worse,
 *   unlock everything the moment memory is populated with the wrong shape.
 * - `streak_extended` is server-owned — a client that can write a streak is a client
 *   that can be edited.
 * - `region_started` and `daily_quest_completed` have no producer yet at all.
 *
 * Feeding an event we cannot honestly observe would make an achievement that unlocks
 * on nothing, which is worse than one that stays locked.
 */

import { useCallback, useSyncExternalStore } from 'react'
import {
  emptyProgress,
  evaluateAll,
  type AchievementProgress,
  type DomainEvent,
  type Unlock,
} from '@worldquest/engines'
import { readJson, writeJson } from '../../lib/storage.js'
import { CATALOGUE } from './useAchievements.js'

const KEY = 'achievements.progress.v1'

type Stored = Record<string, AchievementProgress>

let snapshot: ReadonlyMap<string, AchievementProgress> | null = null
const listeners = new Set<() => void>()

const load = (): ReadonlyMap<string, AchievementProgress> => {
  const stored = readJson<Stored>(KEY)
  if (stored === null || typeof stored !== 'object') return new Map()
  // Only ids the shipped catalogue still carries. An achievement removed from a pack
  // leaves rows behind on every device that ever had it, and a stale row would render
  // as a row with no name.
  const known = new Set(CATALOGUE.map((def) => def.id))
  return new Map(Object.entries(stored).filter(([id]) => known.has(id)))
}

const read = (): ReadonlyMap<string, AchievementProgress> => (snapshot ??= load())

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The user's progress against every achievement. Empty until something happens. */
export function useAchievementProgress(): ReadonlyMap<string, AchievementProgress> {
  return useSyncExternalStore(subscribe, read, read)
}

/**
 * Feeds one domain event through the whole catalogue and persists the result.
 *
 * Returns whatever it unlocked, so a caller can celebrate it. Nothing celebrates yet —
 * that is a screen, and this is the data underneath it.
 */
export function recordAchievementEvent(event: DomainEvent): readonly Unlock[] {
  const before = read()
  const { progress, unlocked } = evaluateAll(CATALOGUE, before, event)

  snapshot = progress
  writeJson(KEY, Object.fromEntries(progress))
  for (const listener of listeners) listener()

  return unlocked
}

/**
 * The one event the client can observe completely.
 *
 * `accuracy` and `durationMs` are the stats the session rules read; both are measured
 * on this device from the lesson that just ended, so neither is a guess.
 */
export function recordLessonForAchievements(input: {
  readonly accuracy: number
  readonly durationMs: number
  readonly at: number
}): readonly Unlock[] {
  return recordAchievementEvent({
    name: 'lesson_completed',
    at: input.at,
    payload: { accuracy: input.accuracy, durationMs: input.durationMs },
  })
}

/** Test seam. Drops the cached snapshot so the next read hits storage again. */
export function resetAchievementCache(): void {
  snapshot = null
}

/** Convenience for a screen that wants a row per definition, progress filled in. */
export function useProgressById(): {
  readonly progressById: ReadonlyMap<string, AchievementProgress>
  readonly progressFor: (id: string) => AchievementProgress
} {
  const progressById = useAchievementProgress()
  const progressFor = useCallback(
    (id: string) => progressById.get(id) ?? emptyProgress(id),
    [progressById],
  )
  return { progressById, progressFor }
}
