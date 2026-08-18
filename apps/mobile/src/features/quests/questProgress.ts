/**
 * Today's quest progress, on the device.
 *
 * ## The gap this closes
 *
 * The quest was generated and rendered correctly, and then nothing ever advanced it.
 * `applyQuestEvent` had no caller, so five tasks sat at 0/5 for ever no matter how
 * many lessons a user finished. A daily quest that cannot be completed is worse than
 * no daily quest: it is a promise on the home screen that the app quietly breaks
 * every single day.
 *
 * ## Progress is stored, the quest is not
 *
 * `generateDailyQuest` is deterministic per (user, day), so the five tasks can always
 * be recomposed and never need saving. What cannot be recomposed is what the user has
 * done, so that is the only thing here — keyed by date, so yesterday's progress can
 * never be mistaken for today's.
 *
 * One day at a time is kept. A missed quest is never mentioned again
 * (quests-and-liveops.md): keeping a history would make "you completed 3 of 7 this
 * week" possible, and the moment that number exists someone will render it.
 *
 * ## The XP is still the server's
 *
 * `applyQuestEvent` returns `xpAwarded` and this deliberately drops it. The client
 * renders which tasks are done; the server pays (ADR 0006). Nothing here writes a balance.
 *
 * "The server re-derives the same quest when it grades the lesson" is what this said, and
 * it was wrong twice over: the server had no quest logic at all, and it could not have
 * re-derived one if it wanted to — generation partitions facts by what was DUE at that
 * moment, and the answers in the submission have already moved those dates. What happens
 * instead is that the quest goes UP with the lesson, the first submission of a local day
 * pins it, and the award is decided from `review_log` and `lessons`. See
 * `supabase/migrations/20260818100000_pay_daily_quest.sql`.
 */

import { useSyncExternalStore } from 'react'
import {
  applyQuestEvent,
  type DailyQuest,
  type QuestEvent,
  type QuestTask,
  type Slot,
} from '@worldquest/engines'
import { isNumberRecord, readJson, writeJson } from '../../lib/storage.js'

const KEY = 'quest.progress.v1'

/** Only what the user did. The tasks themselves are regenerated from the seed. */
type Stored = {
  readonly date: string
  /** Slot → units done, so a task whose target changes still restores sensibly. */
  readonly done: Record<string, number>
  readonly bonusClaimed: boolean
}

let snapshot: Stored | null = null
const listeners = new Set<() => void>()

const empty = (date: string): Stored => ({ date, done: {}, bonusClaimed: false })

/**
 * `date` was checked and `done` was not, which is the half that gets indexed.
 *
 * `withStoredProgress` reads `stored.done[task.slot]` as soon as the stored date matches
 * today — so a row whose `done` is missing or is not an object threw a TypeError while
 * RENDERING Home and Quests, with no way out but a reinstall. Checking one field of a
 * record and casting the rest is the shape of most of these bugs.
 */
const isStored = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Stored).date === 'string' &&
  isNumberRecord((value as Stored).done) &&
  typeof (value as Stored).bonusClaimed === 'boolean'

const read = (): Stored => {
  if (snapshot !== null) return snapshot
  snapshot = readJson<Stored>(KEY, isStored) ?? empty('')
  return snapshot
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function write(next: Stored): void {
  snapshot = next
  writeJson(KEY, next)
  for (const listener of listeners) listener()
}

/**
 * The stored quest with today's progress applied.
 *
 * Returns the quest unchanged when the stored progress is from another day — which is
 * how a new day starts clean without anything having to remember to clear it.
 */
export function withStoredProgress(quest: DailyQuest, stored: Stored): DailyQuest {
  if (stored.date !== quest.date) return quest

  const tasks = quest.tasks.map((task): QuestTask => {
    const done = stored.done[task.slot] ?? 0
    if (done <= 0) return task
    // Clamped to the target: a task's target can change between app versions, and a
    // restored `done` above it would render as "6 of 4".
    const progress = Math.min(done, task.target)
    return { ...task, progress, complete: progress >= task.target }
  })

  return {
    ...quest,
    tasks,
    complete: tasks.every((t) => t.complete),
    bonusClaimed: stored.bonusClaimed,
  }
}

/** Today's quest, with what the user has actually done applied to it. */
export function useQuestWithProgress(quest: DailyQuest | null): DailyQuest | null {
  const stored = useSyncExternalStore(subscribe, read, read)
  return quest === null ? null : withStoredProgress(quest, stored)
}

/**
 * Advances the quest and persists the result.
 *
 * Takes the freshly generated quest rather than holding one, so the caller is always
 * applying an event to today's real five tasks.
 */
export type QuestOutcome = {
  /** Tasks finished by THIS event — the celebration list. */
  readonly completed: readonly Slot[]
  /**
   * The whole quest finished, on this event and not before.
   *
   * Distinct from `completed.length > 0`, which is the distinction that was missing.
   * `quest_completed` and `ach.quest.regular` were both fired on any TASK completing,
   * so a five-task quest announced itself finished the first time one task landed —
   * and then up to four more times, since each subsequent task also completed. The
   * achievement counted events, so "complete 30 daily quests" could be earned in six
   * days, and the analytics number it is measured against was inflated the same way.
   */
  readonly becameComplete: boolean
}

export function recordQuestEvent(quest: DailyQuest, event: QuestEvent): QuestOutcome {
  const stored = read()
  const base = withStoredProgress(quest, stored)
  const wasComplete = base.tasks.every((t) => t.complete)
  const result = applyQuestEvent(base, event)

  write({
    date: quest.date,
    done: Object.fromEntries(result.quest.tasks.map((t) => [t.slot, t.progress])),
    bonusClaimed: result.quest.bonusClaimed,
  })

  // `result.xpAwarded` is deliberately dropped — see the header. The server awards it.
  return { completed: result.completed, becameComplete: result.quest.complete && !wasComplete }
}

/** Test seam. Drops the cached snapshot so the next read hits storage again. */
export function resetQuestProgressCache(): void {
  snapshot = null
}
