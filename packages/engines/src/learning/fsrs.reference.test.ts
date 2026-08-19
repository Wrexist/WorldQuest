/**
 * The scheduler, against the reference implementation it claims to be.
 *
 * ## The `TODO(verify)` this closes
 *
 * `fsrs.ts` carried "TODO(verify): pin these against the reference implementation
 * (open-spaced-repetition/fsrs4anki) and record the exact version before Phase 1 ships"
 * from the day it was written. Nothing else in the suite could have closed it: every
 * other test asserts a *property* — intervals grow, a lapse shortens them, retrievability
 * meets the target at `dueAt` — and every one of those properties holds just as well for
 * a scheduler that is subtly wrong. 544 engine tests passed against the version this
 * file caught.
 *
 * ## What the reference is, exactly
 *
 * `ts-fsrs@4.7.1`, whose default weight vector is this repo's `DEFAULT_WEIGHTS` followed
 * by two more: `0.51655, 0.6621`. Those two are FSRS-5's same-day-review parameters, and
 * WorldQuest has no same-day path — a fact is not asked twice in one session — so
 * carrying seventeen of the nineteen is a deliberate subset rather than a truncation.
 *
 * Pinning the version matters more than it looks. The first attempt at this comparison
 * resolved `ts-fsrs` to 5.4.1, which is FSRS-**6** with twenty-one weights, and produced
 * differences of up to 220 % that meant nothing at all except that two different
 * algorithms are different. A reference that is not version-pinned is not a reference.
 *
 * ## What it found
 *
 * The repo computed the updated difficulty first and then fed THAT into the stability
 * formulas. FSRS uses the difficulty from before the update. Difficulty itself was
 * exact — it does not depend on stability — so the error was invisible in every D
 * assertion and showed only in S, and only on Hard and Easy answers, where the
 * difficulty actually moves:
 *
 * - **Easy** dropped D first, making `(11 - D)` larger, inflating stability by up to
 *   **12.6 %**. Intervals too long: the fact comes back after the user has forgotten it.
 * - **Hard** raised D first, suppressing stability by up to **8.2 %**. Intervals too
 *   short: busywork on the items already hardest to face.
 *
 * Both are the wrong direction, they compound over a learning career, and nobody would
 * ever have filed a ticket about either.
 *
 * ## The values below
 *
 * Emitted by the reference at FIXED elapsed intervals, so this test depends on no
 * external package and cannot drift with one. Regenerating them means running the
 * reference again and saying so here — they are not numbers anybody should adjust to
 * make a failing test pass.
 */

import { describe, expect, it } from 'vitest'
import { review, DEFAULT_WEIGHTS } from './fsrs.js'
import type { MemoryState, Rating } from './types.js'

const DAY = 86_400_000

/** `ts-fsrs@4.7.1`'s default `w`, in full. The first seventeen are ours. */
const REFERENCE_W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
  1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
] as const

/**
 * Agreement to one part in a million, RELATIVE.
 *
 * `toBeCloseTo` takes an ABSOLUTE tolerance, and these values span 1 to 10 000 — the
 * same digit count is a very different demand at each end. Asking for 5e-7 absolute at a
 * stability of 142 failed on 6e-6, which is the reference having printed eight decimal
 * places of a three-digit number rather than either implementation being wrong.
 *
 * 1e-6 relative is far tighter than the defect this file exists to catch: the smallest of
 * those was 0.16 %, which is sixteen hundred times looser.
 */
const RELATIVE_TOLERANCE = 1e-6

const drift = (actual: number, expected: number): number =>
  Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-9)

type Step = {
  readonly rating: Rating
  /** Days since the first review, when this answer is given. */
  readonly atDay: number
  readonly stability: number
  readonly difficulty: number
}

/**
 * Golden traces from `ts-fsrs@4.7.1` with fuzz and the short-term scheduler off.
 *
 * `good` barely moves difficulty, so it agreed to 0.16 % even with the bug — which is
 * why the cases that matter are `easy` and `hard`, where difficulty swings by a whole
 * point on the first answer.
 */
const TRACES: Readonly<Record<string, readonly Step[]>> = {
  good: [
    { rating: 3, atDay: 0, stability: 3.173, difficulty: 5.28243442 },
    { rating: 3, atDay: 3, stability: 10.73892592, difficulty: 5.27296793 },
    { rating: 3, atDay: 13, stability: 32.61522229, difficulty: 5.26354498 },
  ],
  easy: [
    { rating: 4, atDay: 0, stability: 15.69105, difficulty: 3.22450159 },
    { rating: 4, atDay: 15, stability: 142.68512525, difficulty: 2.13012146 },
  ],
  hard: [
    { rating: 2, atDay: 0, stability: 1.18385, difficulty: 6.48830527 },
    { rating: 2, atDay: 1, stability: 1.70736294, difficulty: 7.04050155 },
  ],
  lapse: [
    { rating: 3, atDay: 0, stability: 3.173, difficulty: 5.28243442 },
    { rating: 1, atDay: 3, stability: 1.05556109, difficulty: 6.79693258 },
    { rating: 3, atDay: 4, stability: 3.16899663, difficulty: 6.7804994 },
  ],
}

describe('FSRS against ts-fsrs@4.7.1', () => {
  it('carries the reference weight vector, minus the two same-day parameters', () => {
    expect([...DEFAULT_WEIGHTS]).toEqual(REFERENCE_W.slice(0, 17))
    // Stated rather than implied: seventeen is a decision, and a nineteenth weight
    // appearing here later would mean the same-day path had been built.
    expect(DEFAULT_WEIGHTS).toHaveLength(17)
  })

  for (const [name, trace] of Object.entries(TRACES)) {
    it(`reproduces the reference trace: ${name}`, () => {
      let state: MemoryState | null = null
      for (const step of trace) {
        state = review({ factId: 'geo.SE.capital', state, rating: step.rating, now: step.atDay * DAY })
        expect(drift(state.stability, step.stability)).toBeLessThan(RELATIVE_TOLERANCE)
        expect(drift(state.difficulty, step.difficulty)).toBeLessThan(RELATIVE_TOLERANCE)
      }
    })
  }

  it('computes stability from the difficulty BEFORE this answer updated it', () => {
    // The bug, stated as the rule it broke, so a future refactor that reorders these two
    // lines fails here with a name that says what is wrong rather than "trace mismatch".
    //
    // An Easy answer lowers difficulty. Using the lowered value makes `(11 - D)` bigger
    // and the resulting stability higher — 12.6 % higher by the fourth review — so the
    // fact is scheduled further out than the model intends, and comes back after the
    // user has forgotten it.
    const first = review({ factId: 'geo.SE.capital', state: null, rating: 3, now: 0 })
    const easy = review({ factId: 'geo.SE.capital', state: first, rating: 4, now: 3 * DAY })

    expect(easy.difficulty).toBeLessThan(first.difficulty)
    // The reference's answer, not a recomputation of ours. Both numbers were measured:
    // 25.7936 uses the pre-update difficulty, 28.8457 the post-update one — the bug made
    // this fact 11.8 % more stable than the model says it is, on one answer.
    expect(drift(easy.stability, 25.79360533)).toBeLessThan(RELATIVE_TOLERANCE)
  })
})
