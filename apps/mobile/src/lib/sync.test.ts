import { describe, expect, it } from 'vitest'
import { MAX_ATTEMPTS, backoffMs } from '@worldquest/engines'

/**
 * The adapter itself needs a configured backend and a network to exercise, so these
 * assert the POLICY the adapter now applies rather than mocking a server. The
 * behaviour they protect: `backoffMs` had no caller, so a failing server got all five
 * attempts back to back and the mutation parked in about a second.
 */
describe('sync backoff policy', () => {
  it('grows with each attempt', () => {
    const delays = Array.from({ length: MAX_ATTEMPTS }, (_, i) => backoffMs(i, 0.5))
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!).toBeGreaterThan(delays[i - 1]!)
    }
  })

  it('spends real time before parking, rather than a second', () => {
    // Five immediate retries is not a retry policy, it is a burst. The whole point of
    // parking at MAX_ATTEMPTS is that the server had a fair chance first.
    const total = Array.from({ length: MAX_ATTEMPTS }, (_, i) => backoffMs(i, 0.5)).reduce(
      (a, b) => a + b,
      0,
    )
    expect(total).toBeGreaterThan(20_000)
  })

  it('is jittered, so a fleet does not retry in lockstep', () => {
    expect(backoffMs(3, 0)).not.toBe(backoffMs(3, 1))
  })

  it('never waits absurdly long', () => {
    // A user who reopens the app should not be stuck behind an hour-long delay.
    expect(backoffMs(50, 1)).toBeLessThanOrEqual(60_000)
  })
})
