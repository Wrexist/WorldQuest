/**
 * How far this account has walked each course: finished lessons per node.
 *
 * ## Where it lives, and why there
 *
 * In the account-scoped app store (`lib/storage.ts`), like the quest's progress and the
 * activity log. Scoped, so two accounts on one phone never share a path — signing in as
 * somebody else starts from their own node, and a fresh guest starts from the first.
 * `onStorageScopeChange` below drops the cached snapshot the moment the scope moves, so
 * no render can draw the previous account's path for a frame.
 *
 * Local optimistic course progress is merged with the D1 server's per-node finished
 * lesson counts, so a linked account resumes on another device. Course credit itself
 * pays nothing; the server grades and rewards the underlying lesson.
 *
 * ## Only a finished lesson counts
 *
 * `recordCourseLesson` is called by the lesson route with the same `completed` the
 * after-lesson plan uses — the server's reading on a D1 build when its receipt arrives
 * in time, the device's otherwise — and ignores an abandoned lesson. Which node earns
 * the credit is the engine's rule (`creditLesson`): a locked node earns nothing.
 */

import { useSyncExternalStore } from 'react'
import { creditLesson, type Course, type CourseProgress } from '@worldquest/engines'
import { isNumberRecord, isRecord, onStorageScopeChange, readJson, writeJson } from '../../lib/storage.js'
import { cachedFocusFinished, cachedNodeFinished } from '../../lib/d1-memory.js'
import { withServerProgress } from './serverProgress.js'

const KEY = 'course.progress.v1'

/** Course id → node id → finished lessons. */
type Stored = Readonly<Record<string, CourseProgress>>

/**
 * Every value checked, not only the outer object.
 *
 * `courseStanding` indexes into a course's record, so a stored course whose value is a
 * string or an array would reach it. `readJson` deletes a value that fails its shape —
 * costing a cache of finished-lesson counts rather than a Home screen that throws.
 */
const isStored = (value: unknown): boolean =>
  isRecord(value) && Object.values(value as Record<string, unknown>).every(isNumberRecord)

const EMPTY: CourseProgress = {}

let snapshot: Stored | null = null
const listeners = new Set<() => void>()

const read = (): Stored => {
  if (snapshot !== null) return snapshot
  snapshot = readJson<Stored>(KEY, isStored) ?? {}
  return snapshot
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const notify = () => {
  for (const listener of listeners) listener()
}

/** This account's progress on one course. Re-renders when a lesson is recorded. */
export function useCourseProgress(courseId: string): CourseProgress {
  const stored = useSyncExternalStore(subscribe, read, read)
  return stored[courseId] ?? EMPTY
}

/** The same, outside React — for the lesson route's exit handler. */
export function courseProgress(courseId: string): CourseProgress {
  return read()[courseId] ?? EMPTY
}

/** Capture before starting a lesson, before its receipt can arrive. */
export function currentCourseProgress(course: Course): CourseProgress {
  return withServerProgress(course, courseProgress(course.id), cachedFocusFinished(), cachedNodeFinished())
}

/**
 * One finished lesson, against the node it was started from.
 *
 * Returns whether anything was recorded: false for a node the course does not have or
 * one that is still locked, which the engine refuses (`creditLesson` hands back the same
 * object, so nothing is written either).
 */
export function recordCourseLesson(course: Course, nodeId: string, startedFrom = currentCourseProgress(course)): boolean {
  const stored = read()
  // Judged against what the path shows, which includes what the account finished on
  // other phones (`serverProgress.ts`): on a phone just signed into, a step the server
  // has opened is open here too, and its lesson counts at once rather than after a sync.
  // Stored as the merged count, so this device catches up rather than keeping two ledgers.
  const earned = creditLesson(course, startedFrom, nodeId)
  if (earned === startedFrom) return false
  // A fast receipt may already include this lesson. Advance the starting snapshot,
  // then merge maxima; adding one to the latest server count would count it twice.
  const current = currentCourseProgress(course)
  const combined = { ...earned }
  for (const [id, count] of Object.entries(current)) combined[id] = Math.max(combined[id] ?? 0, count)
  const after = withServerProgress(course, combined, cachedFocusFinished(), cachedNodeFinished())
  const next: Stored = { ...stored, [course.id]: after }
  snapshot = next
  writeJson(KEY, next)
  notify()
  return true
}

/** Test seam. Drops the cached snapshot so the next read hits storage again. */
export function resetCourseProgressCache(): void {
  snapshot = null
}

onStorageScopeChange(() => {
  resetCourseProgressCache()
  notify()
})
