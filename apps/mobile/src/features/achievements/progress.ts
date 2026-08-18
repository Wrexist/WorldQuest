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
 * ## The rest, and where they come from now
 *
 * That paragraph used to end here, with `fact_mastered`, `entity_mastered` and
 * `streak_extended` listed as unwirable because they "need real memory state, which
 * arrives with the server" and because "a client that can write a streak is a client
 * that can be edited". Both were right, and both stopped being obstacles the moment
 * `submit-lesson` started returning `masteryChanges` and the authoritative streak.
 *
 * So they are fed from the SERVER'S answer rather than from a local guess —
 * `recordServerOutcome` below — which is the distinction that was actually load-bearing.
 * The client is not deciding that a fact was mastered; it is being told, and passing
 * that on to a rule engine that only counts.
 *
 * That takes six achievements from permanently-zero to reachable: the flag and capital
 * collectors, countries completed, the streak keeper, quests, and continents. Before
 * this, seven of the twelve could never move at all.
 *
 * Nothing is left. All six event kinds the catalogue counts now have a producer, and
 * every achievement in the pack can move. The two that could only ever be answered
 * server-side — `fact_mastered` and `entity_mastered` — are, and the client forwards
 * rather than decides.
 */

import { useCallback, useSyncExternalStore } from 'react'
import {
  emptyProgress,
  evaluateAll,
  type AchievementProgress,
  type DomainEvent,
  type Unlock,
} from '@worldquest/engines'
import { isRecord, readJson, writeJson } from '../../lib/storage.js'
import { CATALOGUE } from './useAchievements.js'

const KEY = 'achievements.progress.v1'

/**
 * The most cleared reviews one lesson can plausibly report.
 *
 * A ceiling rather than a rule: no lesson composes anywhere near this many items, so it
 * never truncates anything real, and it turns a corrupted count off the wire from a hang
 * into a slightly wrong badge.
 */
const MAX_CLEARED_PER_LESSON = 100

type Stored = Record<string, AchievementProgress>

let snapshot: ReadonlyMap<string, AchievementProgress> | null = null
const listeners = new Set<() => void>()

/**
 * A row the engine can add to.
 *
 * The map itself was shape-checked and its VALUES were not, and the values are what
 * arithmetic runs on: `evaluateAll` adds to `value` and compares it against a tier
 * threshold, so a stored `value` of `null` makes every comparison false and a stored
 * string makes `"3" + 1` into `"31"` — a legendary tier awarded on the fourth event. Both
 * then persist. `seen` is spread into a Set, so a non-array throws outright.
 */
const isProgressRow = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false
  const row = value as AchievementProgress
  if (typeof row.value !== 'number' || !Number.isFinite(row.value)) return false
  if (row.seen !== undefined && !Array.isArray(row.seen)) return false
  return row.tier === null || typeof row.tier === 'string'
}

const load = (): ReadonlyMap<string, AchievementProgress> => {
  const stored = readJson<Stored>(KEY, isRecord)
  if (stored === null) return new Map()
  // Only ids the shipped catalogue still carries, and only rows the engine can use. An
  // achievement removed from a pack leaves rows behind on every device that ever had it,
  // and a stale row would render as a row with no name.
  //
  // A bad ROW is dropped rather than taking the whole map with it, unlike the sync queue
  // where the parts are interdependent: these are independent counters, and losing one
  // badge's progress is a smaller harm than losing every badge's.
  const known = new Set(CATALOGUE.map((def) => def.id))
  return new Map(
    Object.entries(stored).filter(([id, row]) => known.has(id) && isProgressRow(row)),
  )
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

/**
 * Everything the SERVER just told us, as achievement events.
 *
 * The three event kinds that could not previously be emitted honestly, emitted from the
 * only source that can emit them honestly. `masteryChanges` and `streak` are computed by
 * `submit-lesson` from the authoritative memory state and the authoritative streak; this
 * function does not decide anything, it forwards.
 *
 * Called after a sync rather than after a lesson, because that is when the truth arrives.
 * A lesson finished offline unlocks its achievements when the queue flushes, which is
 * later than the XP appears and is the honest ordering — the alternative is unlocking on
 * a prediction and un-unlocking it, and an achievement that is taken back is worse than
 * one that is late.
 */
export function recordServerOutcome(input: {
  readonly masteryChanges: readonly { readonly factId: string; readonly to: string }[]
  readonly streak: number | null
  readonly overdueCleared: number
  readonly entityMastered: readonly string[]
  readonly at: number
}): readonly Unlock[] {
  const unlocked: Unlock[] = []

  for (const change of input.masteryChanges) {
    if (change.to !== 'mastered' && change.to !== 'burnished') continue
    // `geo.SE.capital` → subject `geo`, entity `SE`, attribute `capital`. The id format
    // is fixed by the content pipeline, so splitting it reads the shape rather than
    // guessing at it — and the BARE code is what `distinctBy: 'entityId'` and the
    // `members` lists both use, so `geo.SE` here would count as a different country from
    // `SE` in `ach.set.nordics`.
    const parts = change.factId.split('.')
    const attribute = parts[parts.length - 1] ?? ''
    const entityId = parts[1] ?? ''
    if (attribute === '' || entityId === '') continue
    unlocked.push(
      ...recordAchievementEvent({
        name: 'fact_mastered',
        at: input.at,
        payload: { attribute, entityId, factId: change.factId },
      }),
    )
  }

  for (const entityId of input.entityMastered) {
    unlocked.push(
      ...recordAchievementEvent({ name: 'entity_mastered', at: input.at, payload: { entityId } }),
    )
  }

  // One event per cleared review, because `counter` counts events. Sending one event
  // carrying the number would make a ten-review lesson worth one, which is the shape of
  // bug that makes a 1000-tier take a decade.
  // Bounded before it is trusted. The count arrives over the network from
  // `record_lesson`'s response, and a loop whose trip count is a number off the wire is
  // a hang if that number is ever wrong — `NaN` is falsy here and would be fine, but a
  // corrupted large integer would not. The ceiling is a whole lesson's worth of items,
  // which is more than any real lesson can clear.
  const cleared = Number.isInteger(input.overdueCleared)
    ? Math.min(Math.max(input.overdueCleared, 0), MAX_CLEARED_PER_LESSON)
    : 0
  for (let i = 0; i < cleared; i++) {
    unlocked.push(
      ...recordAchievementEvent({ name: 'overdue_review_cleared', at: input.at, payload: {} }),
    )
  }

  if (input.streak !== null) {
    // `streak_extended`, not `daily_lesson`: the engine notes that this name predates it
    // and ships in analytics dashboards, so it is not renameable. `length` is the field
    // the rule reads — the CURRENT length, which is why a broken streak moves the
    // achievement's value down while the badge it already earned stays earned.
    unlocked.push(
      ...recordAchievementEvent({
        name: 'streak_extended',
        at: input.at,
        payload: { length: input.streak },
      }),
    )
  }

  return unlocked
}

/** A region opened for the first time. Feeds `ach.explorer.continents`. */
export function recordRegionStarted(region: string, at: number): readonly Unlock[] {
  return recordAchievementEvent({ name: 'region_started', at, payload: { region } })
}

/** A daily quest finished. Feeds `ach.quest.regular`. */
export function recordQuestCompleted(at: number): readonly Unlock[] {
  return recordAchievementEvent({ name: 'daily_quest_completed', at, payload: {} })
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
