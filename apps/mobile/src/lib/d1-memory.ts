/**
 * The server's learning memory, as last seen by this account on this device (L01).
 *
 * On a D1 build the Worker composes every lesson from its own memory, so due reviews
 * are right whenever a lesson is issued. This snapshot is what the device grades
 * against optimistically while a lesson runs, and what offline screens read. Written
 * after every acknowledged lesson (`d1-lessons.ts`), scoped to the current account by
 * the storage layer, and never trusted by the server for anything.
 *
 * Its own module on purpose: `content.ts` reads it, and `content.ts` is imported nearly
 * everywhere; the network half lives in `d1-lessons.ts`.
 */

import { useSyncExternalStore } from 'react'
import type { MemoryState } from '@worldquest/engines'
import { isRecord, onStorageScopeChange, readJson } from './storage.js'

export const MEMORY_KEY = 'd1.memory.v1'

const isMemoryList = (value: unknown): boolean =>
  Array.isArray(value) && value.every((m) => isRecord(m) && typeof (m as { factId?: unknown }).factId === 'string')

/** Empty before the first acknowledged lesson, and on a legacy build. */
export function cachedMemory(): Map<string, MemoryState> {
  const list = readJson<MemoryState[]>(MEMORY_KEY, isMemoryList) ?? []
  return new Map(list.map((m) => [m.factId, m]))
}

// ── finished lessons per chosen focus — what a course path follows ──────────

/**
 * The Worker's count of finished lessons per focus the learner chose, for this account,
 * as last fetched (`refreshMemory` in `d1-lessons.ts`). A course step's lessons are
 * issued with exactly that step's focus, so these counts are the account's course
 * progress wherever it was played (`features/course/serverProgress.ts`).
 */
export const FOCUS_FINISHED_KEY = 'd1.focusFinished.v1'

export type FocusFinished = { readonly focus: Readonly<Record<string, unknown>>; readonly finished: number }

const isFocusList = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.every((e) => isRecord(e) && isRecord((e as { focus?: unknown }).focus) &&
    typeof (e as { finished?: unknown }).finished === 'number')

const NONE: readonly FocusFinished[] = []
let focusSnapshot: readonly FocusFinished[] | null = null
const focusListeners = new Set<() => void>()

/** Empty before the first fetch, offline on a fresh install, and on a legacy build. */
export function cachedFocusFinished(): readonly FocusFinished[] {
  return (focusSnapshot ??= readJson<FocusFinished[]>(FOCUS_FINISHED_KEY, isFocusList) ?? NONE)
}

/** Called by the writer after a fetch, so the path redraws with what the server said. */
export function announceFocusFinished(): void {
  focusSnapshot = null
  for (const listener of focusListeners) listener()
}

function subscribeFocus(listener: () => void): () => void {
  focusListeners.add(listener)
  // Another account's counts must never draw this one's path, for even a frame.
  const off = onStorageScopeChange(() => {
    focusSnapshot = null
    listener()
  })
  return () => {
    focusListeners.delete(listener)
    off()
  }
}

export function useFocusFinished(): readonly FocusFinished[] {
  return useSyncExternalStore(subscribeFocus, cachedFocusFinished, cachedFocusFinished)
}
