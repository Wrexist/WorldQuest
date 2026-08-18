/**
 * The quest engine — generation, progress, expiry.
 *
 * A daily quest is five slots. NOT five random tasks: it is composed against the
 * user's actual state, so slots 1–3 come from what is due for review, slot 4 comes
 * from content they have never seen (a quest should teach something), and slot 5 is a
 * performance goal scaled to how they have actually been doing.
 *
 * ## Rules the code enforces, not the copy
 *
 * - **Always completable in ten minutes.** A quest that cannot be finished in one
 *   sitting is a chore, and a chore is how a daily habit dies.
 * - **Always achievable with the content already on the device.** A quest that needs
 *   a download is a quest that fails on a plane.
 * - **Deterministic per (user, day).** Same seed, same quest — so a reinstall or a
 *   second device shows the same five tasks rather than a fresh set to farm.
 * - **A missed quest is never mentioned again.** `expire` returns no penalty and no
 *   record. There is no make-up guilt and no "you missed 3 this week", because that
 *   is the mechanic that turns a game into an obligation.
 *
 * Pure: `now`, the RNG and the user's state all come in as arguments.
 *
 * Spec: docs/systems/quests-and-liveops.md §1
 */

import type { Rng } from '../shared/index.js'
import { shuffle } from '../shared/index.js'
import type { ContentIndex } from '../content/types.js'
import type { FactId, MemoryState } from '../learning/types.js'
import type { IsoDate } from '../time/index.js'
import type { DailyQuest, PerformGoal, QuestTask, Slot } from './progress.js'

/**
 * The progress half, re-exported so `@worldquest/engines` still has one quest surface.
 *
 * Callers import `applyQuestEvent` and `generateDailyQuest` from the same place they
 * always did; only the edge bundle cares that they are two files.
 */
export * from './progress.js'

/**
 * Facts per review slot.
 *
 * Three review slots × four facts, plus two new ones and a performance goal, lands
 * around eight minutes for a median learner — inside the ten-minute ceiling with room
 * for a slow day.
 */
const REVIEW_TARGET = 4
const DISCOVER_TARGET = 2

export type GenerateInput = {
  readonly userId: string
  readonly date: IsoDate
  readonly index: ContentIndex
  readonly memory: ReadonlyMap<FactId, MemoryState>
  readonly now: number
  readonly rng: Rng
  /** 0–1 over the user's recent lessons. Scales slot 5 and nothing else. */
  readonly recentAccuracy: number
}

/**
 * Compose today's quest.
 *
 * Degrades rather than fails. A brand-new user has nothing due, so the review slots
 * fill from new content; a user who has seen everything has nothing new, so the
 * discover slot falls back to the least-well-known fact. Either way five tasks come
 * back — a quest screen with three cards on it looks broken, and "come back when you
 * have more history" is not an answer.
 */
export function generateDailyQuest(input: GenerateInput): DailyQuest {
  const { userId, date, index, memory, now, rng } = input

  const due: FactId[] = []
  const unseen: FactId[] = []
  const weak: { factId: FactId; stability: number }[] = []

  for (const fact of index.facts.values()) {
    const state = memory.get(fact.id)
    if (state === undefined) {
      unseen.push(fact.id)
      continue
    }
    if (state.suspended) continue
    if (state.dueAt <= now) due.push(fact.id)
    weak.push({ factId: fact.id, stability: state.stability })
  }

  // Shuffled with the injected RNG, so the same (user, day) seed produces the same
  // quest on every device and after a reinstall. A quest that rerolls is a quest to
  // farm.
  const dueShuffled = shuffle(due, rng)
  const unseenShuffled = shuffle(unseen, rng)

  // Weakest first — if we have to fall back for the discover slot, the most useful
  // thing to show is the fact closest to being forgotten.
  const weakest = [...weak].sort((a, b) => a.stability - b.stability).map((w) => w.factId)

  let dueCursor = 0
  const takeReview = (n: number): FactId[] => {
    const slice = dueShuffled.slice(dueCursor, dueCursor + n)
    dueCursor += slice.length
    // Nothing due: a first-week user. Fill from new content rather than handing them
    // an empty task.
    if (slice.length < n) {
      const filler = unseenShuffled.slice(0, n - slice.length)
      return [...slice, ...filler]
    }
    return slice
  }

  const discover = unseenShuffled.slice(-DISCOVER_TARGET)
  const discoverFacts =
    discover.length >= DISCOVER_TARGET ? discover : weakest.slice(0, DISCOVER_TARGET)

  const tasks: QuestTask[] = [
    task('locate', REVIEW_TARGET, takeReview(REVIEW_TARGET)),
    task('recognise', REVIEW_TARGET, takeReview(REVIEW_TARGET)),
    task('recall', REVIEW_TARGET, takeReview(REVIEW_TARGET)),
    task('discover', DISCOVER_TARGET, discoverFacts),
    performTask(input.recentAccuracy),
  ]

  return { id: `${userId}:${date}`, date, tasks, complete: false, bonusClaimed: false }
}

const task = (slot: Slot, target: number, factIds: readonly FactId[]): QuestTask => ({
  slot,
  // Never ask for more than we actually have. A task showing 0 / 4 that cannot reach
  // 4 is worse than a task showing 0 / 2 that can.
  target: Math.max(1, Math.min(target, factIds.length)),
  factIds,
  progress: 0,
  complete: false,
})

/**
 * Slot 5, scaled to recent accuracy.
 *
 * A struggling learner gets `streak_keeper` — finish one lesson, any accuracy. A
 * confident one gets a perfect lesson. The scaling exists so the fifth slot is always
 * *reachable*: a perfect-lesson goal handed to someone at 60 % accuracy is a task
 * they will fail every day, and a daily failure is the opposite of the point.
 */
function performTask(recentAccuracy: number): QuestTask {
  const goal: PerformGoal =
    recentAccuracy >= 0.9 ? 'perfect_lesson' : recentAccuracy >= 0.75 ? 'speed_round' : 'streak_keeper'
  return { slot: 'perform', target: 1, factIds: [], goal, progress: 0, complete: false }
}

