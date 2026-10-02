import { BALANCE, COMPLETION_BONUS, SPEED_ROUND_MS, TASK_XP, generateDailyQuest, seededRng,
  type DailyQuest, type MemoryState, type PerformGoal, type QuestTask } from '@worldquest/engines'
import { questContent } from './learning-content'

/**
 * The daily quest, decided by the server.
 *
 * The legacy backend pinned a quest the DEVICE composed, which is what let a client
 * send eight copies of a slot (S04). Here the Worker composes the day's quest itself,
 * seeded by (account, local day) so every device and every retry sees the same five
 * tasks, and a submission carries answers only. There is no field for a client to put
 * a slot in.
 *
 * Progress is derived, never incremented: `credited` holds the distinct quest facts
 * answered correctly today and `performDone` whether slot five's goal was met. A fact
 * answered correctly in three lessons counts once, and a replayed lesson changes
 * nothing because its receipt is returned before any of this runs.
 */

export type QuestRow = { quest: string; credited: string; perform_done: number }
export type QuestDay = { base: DailyQuest; credited: readonly string[]; performDone: boolean }

/** FNV-1a, 32-bit. A seed, not a secret: the quest is the learner's to see. */
function seedFor(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function composeQuest(owner: string, day: string, memory: ReadonlyMap<string, MemoryState>,
  now: number, recentAccuracy: number): DailyQuest {
  const quest = generateDailyQuest({ userId: owner, date: day, index: questContent, memory, now,
    rng: seededRng(seedFor(`${owner}:${day}`)), recentAccuracy })
  return { ...quest, tasks: quest.tasks.map(task => task.slot === 'perform' ? task : {
    ...task,
    activity: task.slot === 'discover'
      ? (task.factIds.length > 0 && task.factIds.every(id => !memory.has(id)) ? 'new' as const : 'practice' as const)
      : task.factIds.length > 0 && task.factIds.every(id => { const state = memory.get(id); return state && !state.suspended && state.dueAt <= now })
        ? 'review' as const : 'practice' as const,
  }) }
}

export function readQuestRow(row: QuestRow | undefined): QuestDay | null {
  if (!row) return null
  return { base: JSON.parse(row.quest) as DailyQuest, credited: JSON.parse(row.credited) as string[],
    performDone: row.perform_done === 1 }
}

function performMet(goal: PerformGoal | undefined, lesson: { accuracy: number; durationMs: number }): boolean {
  if (goal === 'perfect_lesson') return lesson.accuracy >= 1
  if (goal === 'speed_round') return lesson.durationMs <= SPEED_ROUND_MS
  return goal === 'streak_keeper'
}

/** The quest as it stands, from the day's evidence. */
export function project(day: QuestDay): DailyQuest {
  const credited = new Set(day.credited)
  const usedFacts = new Set(day.credited.map(key => key.slice(key.indexOf(':') + 1)))
  const tasks: QuestTask[] = day.base.tasks.map(task => {
    const progress = task.slot === 'perform'
      ? (day.performDone ? 1 : 0)
      : Math.min(task.target, task.activity
        ? day.credited.filter(id => id.startsWith(`${task.slot}:`)).length
        : task.factIds.filter(id => credited.has(id)).length)
    return { ...task, progress, complete: progress >= task.target,
      // A suggested fact may have satisfied a different task. Never send it back
      // as outstanding work that cannot earn progress again today.
      factIds: task.activity ? task.factIds.filter(id => !usedFacts.has(id)) : task.factIds }
  })
  const complete = tasks.every(t => t.complete)
  return { ...day.base, tasks, complete, bonusClaimed: complete }
}

export type QuestOutcome = {
  next: QuestDay
  /** Slots this lesson completed, for the celebration. */
  completedSlots: string[]
  complete: boolean
  xp: number
  coins: number
  done: number
  total: number
}

/** Apply one graded lesson to the day's quest and price what it newly completed. */
export function applyLesson(day: QuestDay, lesson: {
  correctFacts: readonly string[]; accuracy: number; durationMs: number
  /** Derived from server memory before grading, never supplied by the client. */
  newFacts?: readonly string[]
  dueFacts?: readonly string[]
  /** Only a finished lesson can meet slot five's goal; correct facts count either way. */
  finished: boolean
}): QuestOutcome {
  let credited: string[]
  if (day.base.tasks.some(t => t.activity !== undefined)) {
    credited = [...day.credited]
    const seen = new Set(credited.map(key => key.slice(key.indexOf(':') + 1)))
    const fresh = new Set(lesson.newFacts), due = new Set(lesson.dueFacts)
    // Reserve new knowledge for Discover first. Each distinct fact advances only
    // one task per day, even across multiple devices and repeated lessons.
    const tasks = [...day.base.tasks].sort((a, b) => Number(b.slot === 'discover') - Number(a.slot === 'discover'))
    for (const id of new Set(lesson.correctFacts)) {
      if (seen.has(id)) continue
      const task = tasks.find(t => t.activity !== undefined
        && credited.filter(key => key.startsWith(`${t.slot}:`)).length < t.target
        && (t.activity === 'practice' || (t.activity === 'new' && fresh.has(id))
          || (t.activity === 'review' && due.has(id))))
      if (task) { credited.push(`${task.slot}:${id}`); seen.add(id) }
    }
  } else {
    const wanted = new Set(day.base.tasks.flatMap(t => t.factIds))
    credited = [...new Set([...day.credited, ...lesson.correctFacts.filter(id => wanted.has(id))])]
  }
  const goal = day.base.tasks.find(t => t.slot === 'perform')?.goal
  const next: QuestDay = { base: day.base, credited, performDone: day.performDone || (lesson.finished && performMet(goal, lesson)) }
  const before = project(day), after = project(next)
  const completedSlots = after.tasks.filter((t, i) => t.complete && !before.tasks[i]!.complete).map(t => t.slot)
  const finished = after.complete && !before.complete
  return {
    next, completedSlots, complete: after.complete,
    xp: completedSlots.length * TASK_XP + (finished ? COMPLETION_BONUS : 0),
    coins: finished ? BALANCE.coins.dailyQuest : 0,
    done: after.tasks.filter(t => t.complete).length, total: after.tasks.length,
  }
}
