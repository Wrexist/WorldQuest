/**
 * Quest progress against a stored row it cannot use.
 *
 * `withStoredProgress` reads `stored.done[task.slot]` the moment the stored date matches
 * today. `date` was shape-checked and `done` was not, so a row missing `done` threw a
 * TypeError while RENDERING Home and the Quests tab — the two screens a user opens first
 * — with no way out but a reinstall.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { generateDailyQuest, buildIndex, seededRng } from '@worldquest/engines'
import { clearAll, writeJson } from '../../lib/storage.js'
import {
  recordQuestEvent,
  resetQuestProgressCache,
  withStoredProgress,
} from './questProgress.js'

const KEY = 'quest.progress.v1'
const T0 = 1_800_000_000_000

const quest = generateDailyQuest({
  userId: 'local',
  date: '2026-08-18',
  index: buildIndex({ entities: [], facts: [], templates: [] }),
  memory: new Map(),
  now: T0,
  rng: seededRng(1),
  recentAccuracy: 0.8,
})

/**
 * Everything a build could find under this key that it cannot use.
 *
 * The first four were fatal: `date` passed the old check, so `withStoredProgress` went on
 * to index a `done` that was absent, null, an array, or full of strings. The last three
 * were already survivable — the old check rejected them — and are here so the table
 * describes the whole space rather than only the part that broke.
 */
const UNUSABLE = [
  { date: '2026-08-18' }, // `done` absent — the shape that threw
  { date: '2026-08-18', done: null, bonusClaimed: false },
  { date: '2026-08-18', done: [1, 2], bonusClaimed: false },
  { date: '2026-08-18', done: { locate: 'four' }, bonusClaimed: false },
  5,
  'progress',
  [],
]

beforeEach(() => {
  clearAll()
  resetQuestProgressCache()
})

describe('a stored quest row that cannot be read', () => {
  it.each(UNUSABLE.map((v) => [JSON.stringify(v), v] as const))(
    'starts today clean rather than throwing, for %s',
    (_label, value) => {
      writeJson(KEY, value)
      resetQuestProgressCache()

      // Driven through the public surface rather than the predicate: the predicate is not
      // what a screen calls, and the read is what threw.
      expect(() =>
        recordQuestEvent(quest, { type: 'lesson_completed', accuracy: 1, durationMs: 1_000 }),
      ).not.toThrow()
    },
  )

  it('still applies a good row', () => {
    const stored = { date: quest.date, done: { perform: 1 }, bonusClaimed: false }
    const applied = withStoredProgress(quest, stored)
    expect(applied.tasks.find((t) => t.slot === 'perform')?.complete).toBe(true)
  })
})
