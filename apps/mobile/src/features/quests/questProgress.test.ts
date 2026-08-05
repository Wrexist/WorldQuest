import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { DailyQuest, QuestTask } from '@worldquest/engines'
import {
  recordQuestEvent,
  resetQuestProgressCache,
  useQuestWithProgress,
  withStoredProgress,
} from './questProgress.js'
import { remove } from '../../lib/storage.js'

const task = (over: Partial<QuestTask> = {}): QuestTask => ({
  slot: 'recall',
  target: 4,
  progress: 0,
  complete: false,
  factIds: ['geo.SE.capital'],
  ...over,
} as QuestTask)

const quest = (over: Partial<DailyQuest> = {}): DailyQuest => ({
  userId: 'local',
  date: '2026-08-02',
  tasks: [
    task({ slot: 'locate', factIds: ['geo.SE.capital'] }),
    task({ slot: 'recognise', factIds: ['geo.NO.flag'] }),
    task({ slot: 'recall', factIds: ['geo.JP.capital'] }),
    task({ slot: 'discover', factIds: ['geo.BR.currency'] }),
    task({ slot: 'perform', target: 1, goal: 'streak_keeper' } as Partial<QuestTask>),
  ],
  complete: false,
  bonusClaimed: false,
  ...over,
} as DailyQuest)

beforeEach(() => {
  remove('quest.progress.v1')
  resetQuestProgressCache()
})

describe('quest progress', () => {
  it('advances a task when a lesson finishes', () => {
    // The gap this closes: applyQuestEvent had no caller, so five tasks sat at 0/5
    // forever no matter how many lessons a user finished.
    const today = quest()
    const completed = recordQuestEvent(today, {
      type: 'lesson_completed',
      accuracy: 1,
      durationMs: 30_000,
    })
    expect(completed.completed).toContain('perform')
    // A TASK finished, not the quest. The two used to be the same value, which is how
    // `quest_completed` came to fire on the first task of five.
    expect(completed.becameComplete).toBe(false)

    const { result } = renderHook(() => useQuestWithProgress(today))
    expect(result.current?.tasks.find((t) => t.slot === 'perform')?.complete).toBe(true)
  })

  it('answering a fact advances the slot that asked for it', () => {
    const today = quest()
    recordQuestEvent(today, { type: 'fact_answered', factId: 'geo.JP.capital', correct: true })

    const { result } = renderHook(() => useQuestWithProgress(today))
    expect(result.current?.tasks.find((t) => t.slot === 'recall')?.progress).toBe(1)
  })

  it('persists across a restart', () => {
    // Through storage, not through a value handed back — a cache that survives its
    // own reset proves nothing about what a cold start would read.
    const today = quest()
    recordQuestEvent(today, { type: 'lesson_completed', accuracy: 1, durationMs: 30_000 })
    resetQuestProgressCache()

    const { result } = renderHook(() => useQuestWithProgress(today))
    expect(result.current?.tasks.find((t) => t.slot === 'perform')?.complete).toBe(true)
  })

  it('does not carry yesterday’s progress into today', () => {
    // Stored progress is keyed by date, which is how a new day starts clean without
    // anything having to remember to clear it.
    const yesterday = { date: '2026-08-01', done: { perform: 1 }, bonusClaimed: true }
    const restored = withStoredProgress(quest({ date: '2026-08-02' }), yesterday)
    expect(restored.tasks.every((t) => t.progress === 0)).toBe(true)
    expect(restored.bonusClaimed).toBe(false)
  })

  it('clamps restored progress to the task target', () => {
    // A task's target can change between app versions, and a restored `done` above it
    // would render as "6 of 4".
    const restored = withStoredProgress(quest(), {
      date: '2026-08-02',
      done: { recall: 99 },
      bonusClaimed: false,
    })
    const recall = restored.tasks.find((t) => t.slot === 'recall')!
    expect(recall.progress).toBe(recall.target)
  })

  it('marks the quest complete only when every task is', () => {
    const restored = withStoredProgress(quest(), {
      date: '2026-08-02',
      done: { locate: 4, recognise: 4, recall: 4, discover: 4 },
      bonusClaimed: false,
    })
    expect(restored.complete).toBe(false)
  })
})
