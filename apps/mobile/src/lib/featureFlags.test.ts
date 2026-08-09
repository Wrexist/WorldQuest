/**
 * The two properties that matter most here: a flag defaults CLOSED when there is
 * nothing to go on, and rollout bucketing is stable per (flag, user) rather than
 * re-rolled on every call. See the header of featureFlags.ts for why.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluateFlag, type FeatureFlagRow } from './featureFlags.js'

const row = (overrides: Partial<FeatureFlagRow> = {}): FeatureFlagRow => ({
  key: 'wq_new_home_layout',
  enabled: true,
  rolloutPercent: 50,
  ...overrides,
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('evaluateFlag — the closed-by-default contract', () => {
  it('is closed when the row does not exist (never fetched, or unknown key)', () => {
    expect(evaluateFlag(undefined, 'user-1')).toBe(false)
  })

  it('is closed when enabled is false, regardless of rollout percent', () => {
    expect(evaluateFlag(row({ enabled: false, rolloutPercent: 100 }), 'user-1')).toBe(false)
  })

  it('is closed when the user id is not known yet, even at 100%', () => {
    // Session still resolving — a flag must never read as enabled before we know who
    // is asking.
    expect(evaluateFlag(row({ rolloutPercent: 100 }), null)).toBe(false)
  })

  it('is open for everyone at 100%, once a user id exists', () => {
    expect(evaluateFlag(row({ rolloutPercent: 100 }), 'any-user-at-all')).toBe(true)
  })

  it('is closed for everyone at 0%', () => {
    expect(evaluateFlag(row({ rolloutPercent: 0 }), 'any-user-at-all')).toBe(false)
  })
})

describe('evaluateFlag — bucketing', () => {
  it('is deterministic: the same (flag, user) pair always lands the same way', () => {
    const r = row({ rolloutPercent: 50 })
    const first = evaluateFlag(r, 'stable-user-id')
    for (let i = 0; i < 20; i++) {
      expect(evaluateFlag(r, 'stable-user-id')).toBe(first)
    }
  })

  it('spreads roughly evenly across many users at 50%', () => {
    const r = row({ rolloutPercent: 50 })
    let on = 0
    const total = 2000
    for (let i = 0; i < total; i++) {
      if (evaluateFlag(r, `user-${i}`)) on++
    }
    // Not asserting exactly 50% — a hash bucket is not a coin flip — but it should not
    // be lopsided enough to make "50%" a lie.
    expect(on / total).toBeGreaterThan(0.4)
    expect(on / total).toBeLessThan(0.6)
  })

  it('is independent per flag key: two flags do not share a bucket', () => {
    const a = row({ key: 'wq_flag_a', rolloutPercent: 50 })
    const b = row({ key: 'wq_flag_b', rolloutPercent: 50 })
    const users = Array.from({ length: 200 }, (_, i) => `user-${i}`)
    const aOn = users.filter((u) => evaluateFlag(a, u)).length
    const bOn = users.filter((u) => evaluateFlag(b, u)).length
    const agree = users.filter((u) => evaluateFlag(a, u) === evaluateFlag(b, u)).length
    // If the two flags always agreed, they would not be independent buckets — this
    // would be a real regression in `bucketOf`, not a flaky assertion.
    expect(aOn).toBeGreaterThan(0)
    expect(bOn).toBeGreaterThan(0)
    expect(agree).toBeLessThan(users.length)
  })
})
