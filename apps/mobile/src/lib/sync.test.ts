import { describe, expect, it } from 'vitest'
import { MAX_ATTEMPTS, backoffMs } from '@worldquest/engines'
import { __isPermanent } from './sync.js'

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

/**
 * Which failures are worth retrying.
 *
 * Exported for this test only — the classification is a policy decision with a real cost
 * on either side, and it was wrong in the expensive direction: every 4xx except 429 was
 * treated as permanent, which includes the 401 an expired anonymous session produces.
 * The taster lesson runs on exactly such a session, refreshed on a timer, so a flush
 * landing in the refresh gap parked work the user genuinely did — the failure this file
 * calls the most trust-destroying bug a learning app has.
 */
describe('which failures park a lesson', () => {
  const parks = (status: number): boolean => __isPermanent({ status })

  it('retries an expired or missing session', () => {
    expect(parks(401)).toBe(false)
    expect(parks(403)).toBe(false)
  })

  it('retries the server asking for patience', () => {
    expect(parks(429)).toBe(false)
    expect(parks(408)).toBe(false)
    // 425 Too Early. In `RETRYABLE` since it was written and asserted nowhere, which is
    // the same "in the list, never checked" shape as the entries this suite exists for.
    expect(parks(425)).toBe(false)
  })

  it('reads the status off the shape supabase-js actually throws', () => {
    // `FunctionsHttpError` carries the status on `context`, not on the error. The flat
    // `status` every case above uses is the shape this suite invented; the nested one is
    // the shape production produces, and the fallback that reads it had no test at all —
    // so a refactor that dropped it would have left every real 4xx retrying for ever.
    const httpError = (status: number): unknown => ({ name: 'FunctionsHttpError', context: { status } })
    expect(__isPermanent(httpError(401))).toBe(false)
    expect(__isPermanent(httpError(425))).toBe(false)
    expect(__isPermanent(httpError(500))).toBe(false)
    expect(__isPermanent(httpError(422))).toBe(true)
  })

  it('retries anything server-side', () => {
    for (const status of [500, 502, 503, 504]) expect(parks(status)).toBe(false)
  })

  it('retries a failure with no status at all — DNS, timeout, aeroplane mode', () => {
    expect(__isPermanent(new Error('network'))).toBe(false)
  })

  it('parks a request the server will refuse identically for ever', () => {
    // 400 invalid_body, 409 lesson_id_conflict, 422 no_gradable_answers. Retrying these
    // wastes battery and delays every item behind them.
    for (const status of [400, 409, 422]) expect(parks(status)).toBe(true)
  })
})
