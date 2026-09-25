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

import type { MemoryState } from '@worldquest/engines'
import { isRecord, readJson } from './storage.js'

export const MEMORY_KEY = 'd1.memory.v1'

const isMemoryList = (value: unknown): boolean =>
  Array.isArray(value) && value.every((m) => isRecord(m) && typeof (m as { factId?: unknown }).factId === 'string')

/** Empty before the first acknowledged lesson, and on a legacy build. */
export function cachedMemory(): Map<string, MemoryState> {
  const list = readJson<MemoryState[]>(MEMORY_KEY, isMemoryList) ?? []
  return new Map(list.map((m) => [m.factId, m]))
}
