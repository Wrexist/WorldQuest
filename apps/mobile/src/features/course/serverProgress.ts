/**
 * The course path from the server's records, so it follows the account to another phone.
 *
 * Course progress is stored on the device (`progress.ts`), which left a learner who
 * signed in on a new phone back at step one of a course they had half walked. The Worker
 * already counts finished lessons per focus the learner chose (`/v1/learning/state`,
 * `finishedByFocus`), and every course step's lesson is issued with exactly that step's
 * focus. So the count for a step's focus is how many of its lessons were finished,
 * wherever they were played, without the path itself being stored anywhere, and with
 * "finished" decided by the server's own rule.
 *
 * Folded into the device's count by taking the higher, node by node. The device credits a
 * lesson the moment it ends and the server once it has synced; neither can make the other
 * go backwards.
 */

import type { Course, CourseProgress } from '@worldquest/engines'
import type { FocusFinished } from '../../lib/d1-memory.js'

const strings = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((v) => typeof v === 'string') ? [...value].sort() : null

/**
 * One comparable key for a course step's focus: its entities and attributes, sorted.
 * Null for any other kind of focus (named facts, a region, a level), which a course step
 * never asks for and so must never be counted as one.
 */
export function focusKey(focus: Readonly<Record<string, unknown>>): string | null {
  const { entities, attributes, ...rest } = focus
  const e = strings(entities)
  const a = strings(attributes)
  const other = Object.values(rest).some((v) => v !== undefined && !(Array.isArray(v) && v.length === 0))
  if (e === null || a === null || e.length === 0 || a.length === 0 || other) return null
  return JSON.stringify([e, a])
}

/**
 * The device's progress with the server's counts folded in.
 *
 * Nodes are visited in path order, and a count is shared out in that order, each node
 * taking at most the lessons it needs: two steps with the same focus (the closing check
 * and a later review share one) are walked in the order they unlock, which is the order
 * their lessons were played.
 */
export function withServerProgress(
  course: Course,
  local: CourseProgress,
  server: readonly FocusFinished[],
): CourseProgress {
  if (server.length === 0) return local
  const pool = new Map<string, number>()
  for (const { focus, finished } of server) {
    const key = focusKey(focus)
    if (key !== null) pool.set(key, (pool.get(key) ?? 0) + finished)
  }
  const merged: Record<string, number> = { ...local }
  for (const unit of course.units) {
    for (const node of unit.nodes) {
      const key = focusKey(node.focus)
      const available = key === null ? 0 : (pool.get(key) ?? 0)
      if (key === null || available === 0) continue
      const taken = Math.min(available, node.lessons)
      pool.set(key, available - taken)
      merged[node.id] = Math.max(local[node.id] ?? 0, taken)
    }
  }
  return merged
}
