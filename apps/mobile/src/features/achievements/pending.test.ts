/**
 * The queue that stopped achievements unlocking in silence.
 *
 * An unlock produced `track('achievement_unlocked')` and nothing a user could see. Most
 * of them are decided by the SERVER, on a sync flush that can happen with the app in the
 * background — so a callback is not enough and the unlock has to be recorded and shown
 * later.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { clearAll, writeJson } from '../../lib/storage.js'
import { drainUnlocks, peekUnlocks, queueUnlocks } from './pending.js'
import { CATALOGUE } from './useAchievements.js'

const REAL = CATALOGUE[0]!.id
const ALSO_REAL = CATALOGUE[1]!.id

beforeEach(() => clearAll())

describe('pending unlocks', () => {
  it('holds an unlock until something drains it', () => {
    queueUnlocks([{ achievementId: REAL, tier: 'bronze' }])
    expect(peekUnlocks()).toHaveLength(1)
    expect(drainUnlocks()).toEqual([{ achievementId: REAL, tier: 'bronze' }])
    expect(peekUnlocks()).toHaveLength(0)
  })

  it('never celebrates the same tier twice', () => {
    // A lesson replayed off the sync queue re-runs the same server outcome, and
    // `evaluateAll` is incremental rather than idempotent about what it REPORTS. Two
    // identical medals on one summary reads as the app being confused, not generous.
    queueUnlocks([{ achievementId: REAL, tier: 'bronze' }])
    queueUnlocks([{ achievementId: REAL, tier: 'bronze' }])
    expect(peekUnlocks()).toHaveLength(1)
  })

  it('keeps a higher tier of the same achievement', () => {
    queueUnlocks([{ achievementId: REAL, tier: 'bronze' }])
    queueUnlocks([{ achievementId: REAL, tier: 'silver' }])
    expect(peekUnlocks()).toHaveLength(2)
  })

  it('drops an id the shipped catalogue no longer carries', () => {
    // A pack can remove an achievement; every device that ever had it keeps the row. A
    // pending unlock with no name is a blank medal on a celebration screen.
    queueUnlocks([{ achievementId: 'ach.removed.gone', tier: 'gold' }])
    expect(peekUnlocks()).toHaveLength(0)
  })

  it('is a display buffer, not a ledger', () => {
    // Bounded, and the OLDEST go: a summary lists what just happened, and the
    // achievements screen is the permanent record either way.
    for (const tier of ['bronze', 'silver', 'gold', 'platinum', 'legendary'] as const) {
      queueUnlocks([{ achievementId: REAL, tier }])
      queueUnlocks([{ achievementId: ALSO_REAL, tier }])
    }
    const held = peekUnlocks()
    expect(held).toHaveLength(6)
    expect(held.at(-1)).toEqual({ achievementId: ALSO_REAL, tier: 'legendary' })
  })

  it('survives a stored value it cannot read', () => {
    // The queue is persisted so an unlock delivered by a background flush is not lost
    // when the app is killed — which means it is one more thing that can come back
    // malformed, on a path that runs at the end of a lesson.
    writeJson('achievements.pending.v1', { not: 'an array' })
    expect(peekUnlocks()).toEqual([])
    expect(() => queueUnlocks([{ achievementId: REAL, tier: 'bronze' }])).not.toThrow()
    expect(peekUnlocks()).toHaveLength(1)
  })
})
