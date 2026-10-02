import { describe, expect, it } from 'vitest'
import { BALANCE, type DailyQuest, type QuestTask } from '@worldquest/engines'
import { applyLesson, project, type QuestDay } from './src/quests'

const task = (slot: QuestTask['slot'], activity?: QuestTask['activity']): QuestTask => ({
  slot, target: slot === 'perform' ? 1 : 2, factIds: [`${slot}-a`, `${slot}-b`],
  progress: 0, complete: false, ...(activity ? { activity } : {}),
  ...(slot === 'perform' ? { goal: 'streak_keeper' as const } : {}),
})
const day = (activity: boolean): QuestDay => ({
  base: { id: 'a:2026-10-02', date: '2026-10-02', complete: false, bonusClaimed: false,
    tasks: [task('locate', activity ? 'review' : undefined), task('recognise', activity ? 'practice' : undefined),
      task('recall', activity ? 'practice' : undefined), task('discover', activity ? 'new' : undefined), task('perform')],
  } satisfies DailyQuest, credited: [], performDone: false,
})
const lesson = { accuracy: 1, durationMs: 9000, finished: true }
describe('quest progress from ordinary lessons', () => {
  it('counts facts outside the suggested list and gives each fact one task per day', () => {
    const first = applyLesson(day(true), { ...lesson, correctFacts: ['fresh', 'fresh', 'due', 'known'], newFacts: ['fresh'], dueFacts: ['due'] })
    expect(first.next.credited).toEqual(['discover:fresh', 'locate:due', 'recognise:known'])
    const again = applyLesson(first.next, { ...lesson, correctFacts: ['fresh', 'due', 'known'], newFacts: [], dueFacts: [] })
    expect(again.next.credited).toEqual(first.next.credited)
    expect(again.xp).toBe(0)
    expect(again.coins).toBe(0)
  })
  it('uses pre-grading eligibility for review and discovery, with no reward for an unfinished perform task', () => {
    const result = applyLesson(day(true), { ...lesson, finished: false, correctFacts: ['not-due'], newFacts: [], dueFacts: [] })
    const tasks = project(result.next).tasks
    expect(tasks.find(t => t.slot === 'locate')?.progress).toBe(0)
    expect(tasks.find(t => t.slot === 'discover')?.progress).toBe(0)
    expect(tasks.find(t => t.slot === 'recognise')?.progress).toBe(1)
    expect(tasks.find(t => t.slot === 'perform')?.complete).toBe(false)
  })
  it('pays each task and completion once, retaining the existing daily reward cap', () => {
    const correctFacts = ['n1', 'n2', 'd1', 'd2', 'p1', 'p2', 'p3', 'p4']
    const result = applyLesson(day(true), { ...lesson, correctFacts, newFacts: ['n1', 'n2'], dueFacts: ['d1', 'd2'] })
    expect(result).toMatchObject({ complete: true, done: 5, xp: BALANCE.xp.dailyQuestTask * 5 + BALANCE.xp.dailyQuest, coins: BALANCE.coins.dailyQuest })
    const next = applyLesson(result.next, { ...lesson, correctFacts: [...correctFacts, 'extra'], newFacts: ['extra'] })
    expect(next).toMatchObject({ xp: 0, coins: 0, completedSlots: [] })
    expect(next.next.credited).toHaveLength(8)
  })
  it('keeps already-issued fixed-fact quests on their original rules', () => {
    const result = applyLesson(day(false), { ...lesson, correctFacts: ['outside', 'locate-a', 'locate-b'] })
    expect(result.next.credited).toEqual(['locate-a', 'locate-b'])
    expect(project(result.next).tasks[0]?.complete).toBe(true)
    expect(applyLesson(result.next, { ...lesson, correctFacts: ['locate-a', 'locate-b'] }).xp).toBe(0)
  })
  it('removes already-credited suggestions even when another task received that credit', () => {
    const first = applyLesson(day(true), { ...lesson, correctFacts: ['locate-a'], newFacts: ['locate-a'] })
    expect(first.next.credited).toEqual(['discover:locate-a'])
    expect(project(first.next).tasks[0]?.factIds).toEqual(['locate-b'])
    expect(first.next.base.tasks[0]?.factIds).toEqual(['locate-a', 'locate-b'])
  })
})
