import { describe, expect, it } from 'vitest'
import { questFocus, questStanding } from './play.js'
import type { DailyQuest, QuestTask, Slot } from './index.js'

const task = (slot: Slot, factIds: readonly string[], complete = false): QuestTask => ({
  slot,
  target: Math.max(1, factIds.length),
  factIds,
  progress: complete ? Math.max(1, factIds.length) : 0,
  complete,
})

const quest = (tasks: readonly QuestTask[]): DailyQuest => ({
  id: 'u:2026-08-10',
  date: '2026-08-10',
  tasks,
  complete: tasks.every((t) => t.complete),
  bonusClaimed: false,
})

describe('questFocus', () => {
  it('asks for exactly the facts the outstanding tasks name', () => {
    // The whole point. Before this, Home started a generic lesson and the quest advanced
    // only if the shuffle happened to serve a fact a task happened to want — a progress
    // bar moving for reasons the user could not see.
    const focus = questFocus(
      quest([task('locate', ['a', 'b']), task('recognise', ['c']), task('perform', [])]),
    )

    expect(focus?.factIds).toEqual(['a', 'b', 'c'])
  })

  it('drops the facts of tasks already done', () => {
    // Resuming mid-day must not re-ask what is already finished, or the second half of a
    // quest is a re-run of the first.
    const focus = questFocus(
      quest([task('locate', ['a', 'b'], true), task('recognise', ['c', 'd'])]),
    )

    expect(focus?.factIds).toEqual(['c', 'd'])
  })

  it('never asks for the same fact twice, however many tasks want it', () => {
    // Two slots can legitimately draw on one country. A duplicated id would weight that
    // fact twice in the composer's pool for no reason anybody chose.
    const focus = questFocus(quest([task('locate', ['a', 'b']), task('recall', ['b', 'c'])]))

    expect(focus?.factIds).toEqual(['a', 'b', 'c'])
  })

  it('is undefined once the quest is finished', () => {
    // Undefined, NOT an empty list. `focusFilter` reads an empty array as "these facts,
    // of which there are none" and would compose a lesson of nothing — so getting this
    // backwards hands somebody a zero-question lesson as a reward for finishing.
    expect(questFocus(quest([task('locate', ['a'], true), task('recall', ['b'], true)]))).toBeUndefined()
  })

  it('is undefined when only `perform` is left, because it names no facts', () => {
    // Slot 5 is about HOW a lesson went, not which facts it held. Left alone it completes
    // off the back of the others; treated as a fact filter it would ask for nothing.
    expect(questFocus(quest([task('locate', ['a'], true), task('perform', [])]))).toBeUndefined()
  })
})

describe('questStanding', () => {
  it('counts tasks, which is what the screen promised', () => {
    // "Five things, about ten minutes". Facts would be a truer measure of effort and a
    // worse measure of the thing the user was told they were doing.
    const standing = questStanding(
      quest([task('locate', ['a'], true), task('recall', ['b']), task('perform', [])]),
    )

    expect(standing).toEqual({ done: 1, total: 3, complete: false })
  })

  it('reports the quest complete only when the quest says so', () => {
    // Read from the quest rather than recomputed, so this can never disagree with the
    // engine that awards the completion bonus.
    const done = quest([task('locate', ['a'], true)])
    expect(questStanding(done).complete).toBe(true)
  })
})
