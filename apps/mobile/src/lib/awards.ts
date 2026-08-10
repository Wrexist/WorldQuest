/**
 * The local record of what finished lessons are expected to be worth.
 *
 * Written when a lesson ends, marked delivered when the server accepts it, and dropped
 * once the server's own totals have caught up. `packages/engines/src/sync/optimistic.ts`
 * holds the rules and the reasoning; this file is the storage and the subscription,
 * which is the part that needs a device.
 *
 * Persisted, for the same reason the sync queue is: a lesson finished in a tunnel has to
 * survive the app being killed on the walk home. An in-memory ledger would zero the
 * user's visible XP on every cold start until the queue happened to flush.
 *
 * Kept separate from the queue rather than folded into `QueuedMutation.payload`, on
 * purpose. The payload is what gets SENT — it is the client's report of what happened,
 * and the server re-derives every reward from it. A predicted award is the opposite
 * direction: a local display value the server never sees and must never be handed, or
 * the client would be deciding rewards rather than rendering them.
 */

import { useSyncExternalStore } from 'react'
import { settledAwards, type PredictedAward } from '@worldquest/engines'
import { readJson, writeJson } from './storage.js'

const KEY = 'awards.predicted.v1'

/**
 * A ceiling, so a user who is offline for a month cannot grow this without bound.
 *
 * Generous on purpose — losing a row means under-reporting XP the user really earned,
 * which is the bug this whole file exists to fix — and it only ever binds for someone
 * with hundreds of unsynced lessons, whose sync queue is the real problem by then.
 */
const MAX_ROWS = 500

let snapshot: readonly PredictedAward[] | null = null
const listeners = new Set<() => void>()

const load = (): readonly PredictedAward[] => {
  const stored = readJson<unknown>(KEY)
  return Array.isArray(stored) ? (stored as readonly PredictedAward[]) : []
}

const read = (): readonly PredictedAward[] => (snapshot ??= load())

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function commit(next: readonly PredictedAward[]): void {
  snapshot = next.slice(-MAX_ROWS)
  writeJson(KEY, snapshot)
  for (const listener of listeners) listener()
}

/**
 * Record what a finished lesson is expected to be worth.
 *
 * The figures come from the `GradeResult` the lesson runner already computed — the same
 * one the summary card renders — so this predicts nothing new. It only carries a number
 * that was already on screen to the screens that were showing zero.
 *
 * Keyed by `lessonId`, which is the server's idempotency key, so finishing the same
 * lesson twice cannot count twice.
 */
export function recordPredictedAward(entry: {
  lessonId: string
  xp: number
  coins: number
  localDay: string
}): void {
  const existing = read()
  if (existing.some((a) => a.lessonId === entry.lessonId)) return
  commit([...existing, { ...entry, deliveredAt: null }])
}

/** The server accepted this lesson. It keeps counting until the totals catch up. */
export function markAwardDelivered(lessonId: string, at: number): void {
  const existing = read()
  if (!existing.some((a) => a.lessonId === lessonId && a.deliveredAt === null)) return
  commit(existing.map((a) => (a.lessonId === lessonId ? { ...a, deliveredAt: at } : a)))
}

/**
 * Forget everything the server has both accepted and reported back.
 *
 * Called from the screens that read this, after the authoritative figures arrive. A
 * pruner on a timer would be a second clock to reason about; the moment fresh totals
 * land is exactly the moment a row can be retired, and it is the moment a reader is
 * already awake.
 */
export function pruneSettledAwards(progressFetchedAt: number): void {
  const existing = read()
  const done = new Set(settledAwards(existing, progressFetchedAt).map((a) => a.lessonId))
  if (done.size === 0) return
  commit(existing.filter((a) => !done.has(a.lessonId)))
}

/** Every predicted award still on the books, settled or not. */
export function useAwards(): readonly PredictedAward[] {
  return useSyncExternalStore(subscribe, read, read)
}

export const peekAwards = (): readonly PredictedAward[] => read()

/** Test seam. Drops the cached snapshot so the next read hits storage again. */
export function resetAwardsCache(): void {
  snapshot = null
}
