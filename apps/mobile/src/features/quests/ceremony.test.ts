import { afterEach, describe, expect, it } from 'vitest'
import { QUEST_CELEBRATION, QUEST_COVER } from './ceremony.js'
import { __resetFeatureFlagsForTests, evaluateFlag, getFeatureFlag } from '../../lib/featureFlags.js'

/**
 * The flags that stage the quest ceremony.
 *
 * Worth testing for one reason, and it is the reason this repo keeps rediscovering: a
 * flag system with no consumers and a consumer with no flag row look identical from the
 * outside — both are a feature that never turns on, and neither fails. `featureFlags.ts`
 * shipped in August with the machinery complete and nothing gating on it at all.
 *
 * So these assert the two ends: that the keys the app asks for are the keys the migration
 * seeds, and that "never fetched" means OFF rather than on.
 */
describe('the quest ceremony flags', () => {
  afterEach(() => __resetFeatureFlagsForTests())

  it('asks for the keys the migration actually seeds', () => {
    // The one thing a typo here would cost: a flag that reads false for ever and a
    // feature nobody can turn on, with nothing anywhere reporting a problem. Kept in
    // step with `20260813110000_seed_quest_ceremony_flags.sql` by hand, because a
    // string in a database cannot be checked by a compiler.
    expect(QUEST_COVER).toBe('quest_cover_page')
    expect(QUEST_CELEBRATION).toBe('quest_completion_screen')
  })

  it('is closed for a flag that has never been fetched', () => {
    // A rollout ladder that starts at 5 % and defaults to "everyone" when it cannot
    // reach the server is not a 5 % rollout. First launch, no network: the old path.
    expect(getFeatureFlag(QUEST_COVER, 'user-1')).toBe(false)
    expect(getFeatureFlag(QUEST_CELEBRATION, 'user-1')).toBe(false)
  })

  it('is closed for a row that exists but is disabled, whatever its percentage', () => {
    // The halt case. `enabled = false` is the kill switch, and it has to beat a
    // rollout_percent left at 100 from before the incident.
    expect(
      evaluateFlag({ key: QUEST_COVER, enabled: false, rolloutPercent: 100 }, 'user-1'),
    ).toBe(false)
  })

  it('buckets a user stably, so nobody flickers in and out of the rollout', () => {
    const row = { key: QUEST_COVER, enabled: true, rolloutPercent: 50 }
    const first = evaluateFlag(row, 'user-42')
    expect(evaluateFlag(row, 'user-42')).toBe(first)
    expect(evaluateFlag(row, 'user-42')).toBe(first)
  })

  it('reaches roughly the share of users it was set to', () => {
    const row = { key: QUEST_COVER, enabled: true, rolloutPercent: 25 }
    const ids = Array.from({ length: 2000 }, (_, i) => `user-${i}`)
    const on = ids.filter((id) => evaluateFlag(row, id)).length / ids.length
    // Loose on purpose — this asserts the bucketing is not broken, not that a hash is
    // uniform to three decimal places. A 25 % flag reaching 2 % or 60 % is the defect.
    expect(on).toBeGreaterThan(0.18)
    expect(on).toBeLessThan(0.32)
  })
})
