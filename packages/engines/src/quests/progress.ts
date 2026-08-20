/**
 * The quest's progress half — everything that decides what was DONE.
 *
 * Split from `index.ts`, which owns generation, and the split is not tidiness: composing
 * a quest needs the content index, and advancing one needs nothing but the tasks and the
 * events. `submit-lesson` pays the quest reward, so it has to run exactly this code — and
 * the edge bundle's budget test exists to stop a function acquiring an engine it does not
 * call. Vendoring generation to reach `applyQuestEvent` would have dragged the content
 * types in behind it and breached that budget, which is precisely the event the budget is
 * there to stop.
 *
 * Pure, like everything in this package: no clock, no RNG, no storage.
 *
 * Spec: docs/systems/quests-and-liveops.md §1
 */

import type { FactId } from '../learning/types.js'
import { BALANCE } from '../xp/balance.js'
import type { IsoDate } from '../time/index.js'

/** Five slots, in this order, every day. The shape is the recognisable part. */
export const SLOTS = ['locate', 'recognise', 'recall', 'discover', 'perform'] as const
export type Slot = (typeof SLOTS)[number]

/** What slot 5 can ask for. Scaled to recent accuracy, never to a target we set. */
export type PerformGoal = 'perfect_lesson' | 'speed_round' | 'streak_keeper'

export type QuestTask = {
  readonly slot: Slot
  /** How many of the thing. Always small enough to finish in one sitting. */
  readonly target: number
  /** Facts this task draws on. Empty for `perform`, which is about how, not what. */
  readonly factIds: readonly FactId[]
  /** Only on `perform`. */
  readonly goal?: PerformGoal
  readonly progress: number
  readonly complete: boolean
}

export type DailyQuest = {
  /** `${userId}:${localDate}` — the idempotency key, so a replay is a no-op. */
  readonly id: string
  readonly date: IsoDate
  readonly tasks: readonly QuestTask[]
  readonly complete: boolean
  /** Awarded once, when the fifth task completes. */
  readonly bonusClaimed: boolean
}

export const TASK_XP = BALANCE.xp.dailyQuestTask
export const COMPLETION_BONUS = BALANCE.xp.dailyQuest


// ── progress ────────────────────────────────────────────────────────────────

export type QuestEvent =
  | { readonly type: 'fact_answered'; readonly factId: FactId; readonly correct: boolean }
  | { readonly type: 'lesson_completed'; readonly accuracy: number; readonly durationMs: number }

export type ProgressResult = {
  readonly quest: DailyQuest
  /** Tasks completed by THIS event — the celebration list. */
  readonly completed: readonly Slot[]
  /** XP earned by this event, including the all-five bonus. */
  readonly xpAwarded: number
}

/** A speed round is a lesson finished inside this. Generous — it is a goal, not a trap. */
export const SPEED_ROUND_MS = 90_000

/**
 * Apply one event.
 *
 * Incremental and idempotent-ish: a task already complete is never advanced again, so
 * replaying the same lesson submission cannot award the bonus twice.
 */
export function applyQuestEvent(quest: DailyQuest, event: QuestEvent): ProgressResult {
  const completed: Slot[] = []

  const tasks = quest.tasks.map((task) => {
    if (task.complete) return task

    const advanced = advanceTask(task, event)
    if (advanced === task) return task

    if (advanced.complete) completed.push(advanced.slot)
    return advanced
  })

  const allComplete = tasks.every((t) => t.complete)
  const earnsBonus = allComplete && !quest.bonusClaimed

  return {
    quest: {
      ...quest,
      tasks,
      complete: allComplete,
      bonusClaimed: quest.bonusClaimed || allComplete,
    },
    completed,
    xpAwarded: completed.length * TASK_XP + (earnsBonus ? COMPLETION_BONUS : 0),
  }
}

function advanceTask(task: QuestTask, event: QuestEvent): QuestTask {
  const bump = (by: number): QuestTask => {
    const progress = Math.min(task.target, task.progress + by)
    return { ...task, progress, complete: progress >= task.target }
  }

  switch (event.type) {
    case 'fact_answered':
      // Only a CORRECT answer advances a review slot. Counting wrong answers would
      // make the quest a measure of attendance rather than of learning.
      if (!event.correct) return task
      if (task.slot === 'perform') return task
      if (!task.factIds.includes(event.factId)) return task
      return bump(1)

    case 'lesson_completed': {
      if (task.slot !== 'perform') return task
      switch (task.goal) {
        case 'perfect_lesson':
          return event.accuracy >= 1 ? bump(1) : task
        case 'speed_round':
          return event.durationMs <= SPEED_ROUND_MS ? bump(1) : task
        case 'streak_keeper':
          return bump(1)
        default:
          return task
      }
    }
  }
}

/**
 * Replay a day's worth of events over a quest, from zero.
 *
 * ## Why the server needs this
 *
 * The quest is composed ON THE DEVICE, and it has to be: `generateDailyQuest` reads the
 * user's memory to decide which facts are due, and the rules above require a quest that
 * is "always achievable with the content already on the device — a quest that needs a
 * download is a quest that fails on a plane". A server cannot re-derive it either, and
 * not for want of trying: the fact partition depends on `dueAt` at the moment of
 * generation, and by the time a lesson is submitted the answers in it have moved exactly
 * those dates. The server would compose a DIFFERENT five tasks and pay for those.
 *
 * So the client composes the quest and the server pins it, and then this is what decides
 * what was actually done — from the server's own `review_log` and `lessons`, replayed
 * through the same `applyQuestEvent` the device runs. The client chooses the questions;
 * it does not get a vote on the answers.
 *
 * ## Why it starts from zero rather than from stored progress
 *
 * Progress is a projection of the day's evidence, so deriving it is both simpler and
 * safer than storing it: nothing can drift, and a device that lost its local progress
 * cannot lose the reward with it. `applyQuestEvent` already refuses to advance a task it
 * has completed, so replaying the same day twice lands on the same answer.
 *
 * ## One fact counts once
 *
 * `applyQuestEvent` advances a review slot on every matching `fact_answered`, so the same
 * fact answered correctly in four lessons across a day satisfies a task that asks for
 * four FACTS. Within a lesson that cannot happen — the composer does not repeat an item —
 * and across a day it is unlikely, because a fact just answered correctly is no longer
 * due. Unlikely is not a guarantee, and this is the side that pays.
 *
 * So the dedupe lives here rather than in `advanceTask`: tracking seen facts per task
 * would change the shape of `QuestTask` and of what every device has already stored, for
 * a case only the paying side has to be exact about. The consequence is that the device
 * can occasionally show a slot complete that the server declines to pay — the same
 * direction as every other optimistic number in this product, and the direction that
 * errs towards the user being told less than they earned rather than more.
 */
export function replayQuest(quest: DailyQuest, events: readonly QuestEvent[]): DailyQuest {
  const zeroed: DailyQuest = {
    ...quest,
    tasks: quest.tasks.map((t) => ({ ...t, progress: 0, complete: false })),
    complete: false,
    bonusClaimed: false,
  }

  const counted = new Set<FactId>()
  const distinct = events.filter((event) => {
    if (event.type !== 'fact_answered') return true
    if (counted.has(event.factId)) return false
    counted.add(event.factId)
    return true
  })

  return distinct.reduce((q, event) => applyQuestEvent(q, event).quest, zeroed)
}

// ── expiry ──────────────────────────────────────────────────────────────────

/**
 * Whether a quest belongs to a day that has passed.
 *
 * There is deliberately no `penalty`, no `missedCount`, and nothing to return about a
 * lapsed quest beyond the fact that it lapsed. A missed daily quest is never mentioned
 * again — no make-up guilt, no "you missed 3 quests this week". That mechanic is what
 * turns a game into an obligation, and this product does not use it.
 */
export const hasExpired = (quest: DailyQuest, today: IsoDate): boolean => quest.date < today

/** Progress across the five slots, for the ring on Home. */
export function questProgress(quest: DailyQuest): { done: number; total: number } {
  return { done: quest.tasks.filter((t) => t.complete).length, total: quest.tasks.length }
}
