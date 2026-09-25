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
 * Not server state. The server is authoritative for XP, coins, streaks, hearts, leagues
 * and entitlements (rule 6); a position on a course is none of those, it pays nothing,
 * and the lessons that move it are graded and paid by the server as usual. What that
 * costs is stated rather than hidden: the path does not follow an account to a second
 * device yet (U04 is the same open question for everything else local).
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

/**
 * One finished lesson, against the node it was started from.
 *
 * Returns whether anything was recorded: false for a node the course does not have or
 * one that is still locked, which the engine refuses (`creditLesson` hands back the same
 * object, so nothing is written either).
 */
export function recordCourseLesson(course: Course, nodeId: string): boolean {
  const stored = read()
  const before = stored[course.id] ?? EMPTY
  const after = creditLesson(course, before, nodeId)
  if (after === before) return false
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
