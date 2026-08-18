/**
 * The figure that decides the quest's fifth slot.
 *
 * `generateDailyQuest` scales that slot to recent accuracy so it is always reachable —
 * "a perfect-lesson goal handed to someone at 60 % accuracy is a task they will fail
 * every day, and a daily failure is the opposite of the point". `todaysQuest` passed the
 * literal 0.8, so every user got `speed_round` for ever and `streak_keeper` was
 * unreachable by anybody.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { AnsweredItem } from '@worldquest/engines'
import { clearAll, writeJson } from '../../lib/storage.js'
import {
  UNKNOWN_ACCURACY,
  accuracyBefore,
  recentAccuracy,
  recordAccuracy,
  resetAccuracyCache,
} from './useAccuracy.js'

const answer = (wasCorrect: boolean, answered = true): AnsweredItem => ({
  itemId: 'i',
  factId: 'geo.SE.capital',
  templateId: 'tpl.capital-of.mc4',
  chosenOptionId: answered ? 'SE' : null,
  wasCorrect,
  elapsedMs: 3_000,
  answeredAt: 1_800_000_000_000,
})

beforeEach(() => {
  clearAll()
  resetAccuracyCache()
})

describe('accuracyBefore', () => {
  it('is the reachable goal when nobody has watched this user yet', () => {
    // Not 0.8. Day one is the day a quest most needs to be finishable, and the old
    // default put a first-day user on "a lesson in under 90 seconds".
    expect(accuracyBefore([], '2026-08-18')).toBe(UNKNOWN_ACCURACY)
    expect(UNKNOWN_ACCURACY).toBeLessThan(0.75)
  })

  it('ignores today, so the goal cannot change under the user mid-day', () => {
    // `todaysQuest` is called by the screen that draws the quest and by the runner that
    // advances it. A figure that moved as the day went on would compose one quest in the
    // morning and another after lunch — and `submit-lesson` pins the first it sees, so
    // the drawn quest and the paid one would disagree.
    const samples = [
      { day: '2026-08-17', accuracy: 0.4 },
      { day: '2026-08-18', accuracy: 1 },
    ]
    expect(accuracyBefore(samples, '2026-08-18')).toBe(0.4)
  })

  it('averages the window it has', () => {
    expect(
      accuracyBefore(
        [
          { day: '2026-08-16', accuracy: 0.5 },
          { day: '2026-08-17', accuracy: 1 },
        ],
        '2026-08-18',
      ),
    ).toBe(0.75)
  })
})

describe('recordAccuracy', () => {
  it('records what a lesson scored', () => {
    const yesterday = new Date('2026-08-17T10:00:00Z')
    recordAccuracy([answer(true), answer(true), answer(false), answer(false)], yesterday)
    expect(recentAccuracy(new Date('2026-08-18T10:00:00Z'))).toBe(0.5)
  })

  it('never counts a question the clock ran out on', () => {
    // A timeout says nothing about whether the user knew it, and counting it as wrong
    // would let a speed round permanently lower somebody's band.
    const yesterday = new Date('2026-08-17T10:00:00Z')
    recordAccuracy([answer(true), answer(false, false), answer(false, false)], yesterday)
    expect(recentAccuracy(new Date('2026-08-18T10:00:00Z'))).toBe(1)
  })

  it('records nothing at all for a lesson left on the first question', () => {
    recordAccuracy([answer(false, false)], new Date('2026-08-17T10:00:00Z'))
    expect(recentAccuracy(new Date('2026-08-18T10:00:00Z'))).toBe(UNKNOWN_ACCURACY)
  })

  it('survives a stored value it cannot read', () => {
    writeJson('accuracy.recent.v1', [{ day: 5, accuracy: 'high' }])
    resetAccuracyCache()
    expect(recentAccuracy(new Date('2026-08-18T10:00:00Z'))).toBe(UNKNOWN_ACCURACY)
    expect(() => recordAccuracy([answer(true)], new Date('2026-08-17T10:00:00Z'))).not.toThrow()
  })
})
