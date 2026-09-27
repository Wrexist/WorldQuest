/**
 * The course path from the server's records, so it follows the account to another phone.
 *
 * Course progress is stored on the device (`progress.ts`), which left a learner who
 * signed in on a new phone back at step one of a course they had half walked. The Worker
 * counts finished lessons from the tickets it issued (`/v1/learning/state`), with
 * "finished" decided by its own rule, so the path can be derived from records the server
 * already keeps without being stored anywhere.
 *
 * ## Per step, not per focus
 *
 * Every step's lesson names its step (`node` on the ticket), and `finishedByNode` is the
 * count this reads first. It used to share out the count per FOCUS in path order, which
 * assumed every lesson with a focus advanced the next step that has it. Two steps can
 * share one (the first week's mix and its check do), and practising a finished step is a
 * lesson with its focus too: finish the mix, practise it once, and three lessons were
 * shared out as two for the mix and one for the check, so the check showed done without
 * ever being played (PR #21 review).
 *
 * The per-focus count still covers tickets issued before steps were named, but only for
 * a focus no other step has, where it cannot be anybody else's lesson.
 *
 * Folded into the device's count by taking the higher, node by node. The device credits a
 * lesson the moment it ends and the server once it has synced; neither can make the other
 * go backwards.
 */

import type { Course, CourseProgress } from '@worldquest/engines'
import type { FocusFinished, NodeFinished } from '../../lib/d1-memory.js'

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

/** The device's progress with the server's counts folded in. */
export function withServerProgress(
  course: Course,
  local: CourseProgress,
  byFocus: readonly FocusFinished[],
  byNode: readonly NodeFinished[] = [],
): CourseProgress {
  if (byFocus.length === 0 && byNode.length === 0) return local

  const counted = new Map<string, number>()
  for (const { node, finished } of byNode) counted.set(node, (counted.get(node) ?? 0) + finished)

  const nodes = course.units.flatMap((unit) => unit.nodes)
  // How many steps ask about each focus: a count for a focus two steps share cannot say
  // which of them a lesson was for, so it is left to the per-step count.
  const sharing = new Map<string, number>()
  for (const node of nodes) {
    const key = focusKey(node.focus)
    if (key !== null) sharing.set(key, (sharing.get(key) ?? 0) + 1)
  }
  const pool = new Map<string, number>()
  for (const { focus, finished } of byFocus) {
    const key = focusKey(focus)
    if (key !== null) pool.set(key, (pool.get(key) ?? 0) + finished)
  }

  const merged: Record<string, number> = { ...local }
  for (const node of nodes) {
    const key = focusKey(node.focus)
    const fromStep = counted.get(node.id) ?? 0
    const fromFocus = key !== null && sharing.get(key) === 1 ? (pool.get(key) ?? 0) : 0
    // Capped at the step's own lessons: practising a finished step is still that step.
    const server = Math.min(Math.max(fromStep, fromFocus), node.lessons)
    if (server > 0) merged[node.id] = Math.max(local[node.id] ?? 0, server)
  }
  return merged
}
