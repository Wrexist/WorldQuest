/**
 * What the server is willing to believe about when a lesson happened.
 *
 * `submit-lesson` decides every reward rather than accepting one. That was true of WHAT
 * was answered and false of WHEN: `parseBody` asserted `typeof answeredAt === 'number'`
 * and nothing else, and `answeredAt` is the clock the scheduler runs on. Dated a year
 * ahead, every item scored retrievability ≈ 0 — the largest stability multiplier the
 * curve has — AND `wasOverdue`, so one payload minted mastery, the overdue bonus and
 * `factMastered` together. `factMastered` is the XP source xp-economy.md calls
 * impossible to farm by volume.
 *
 * Bounding the timestamps closes that, and it closes it completely: once nothing may be
 * dated in the future, mastery is gated by the calendar again — stability grows across
 * sessions and no payload compresses a week into a request.
 *
 * Per-answer DURATION is weaker and worth being honest about. The server can prove an
 * answer was not slower than the gap to the next one, so `elapsedMs` is capped there.
 * It cannot prove one was not faster. A payload claiming every answer took 401 ms inside
 * a session it also claims lasted four seconds is internally consistent, so that case is
 * caught in aggregate instead: a lesson shorter than `MIN_ANSWER_MS` per item is a
 * forged window, and its timing is discarded rather than scored. `deriveRating` already
 * takes that line for a 30-second answer — no signal means fall back to Good, not infer.
 *
 * Clamping, never rejection. A lesson finished in a tunnel is why per-answer timestamps
 * exist at all; a real offline submission passes through every line below unchanged.
 *
 * Pure, and tested without a store, a network or a clock — the same split the Apple
 * verifier uses, for the same reason.
 */

/**
 * How far back a submission may be dated. Generous, because a parked mutation can be
 * retried by hand days later — but finite, because scheduling from 2019 hands back an
 * interval measured in years.
 */
export const MAX_OFFLINE_AGE_MS = 7 * 86_400_000

/**
 * Below this an answer is not credible. Mirrors `MIN_CREDIBLE_ANSWER_MS` in the engine —
 * the shared modules redeclare engine constants because Deno cannot resolve a pnpm
 * workspace, and the test asserts the two agree.
 */
export const MIN_ANSWER_MS = 400

/** Past this the user put the phone down. `deriveRating` falls back to Good there. */
export const MAX_ANSWER_MS = 30_000

/**
 * Credited when the session's own clock is not believable. The grader's
 * `DEFAULT_MEDIAN_MS`, deliberately: it reads as exactly average, so `deriveRating`
 * returns Good — no Easy bonus, no Hard penalty — and it is far above the 3-second
 * speed-bonus threshold. A forged session earns what an ordinary one earns, and no less.
 */
export const NO_TIMING_SIGNAL_MS = 8_000

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** A number a `Date` can represent. `typeof x === 'number'` admits NaN and 1e300. */
export const isFiniteMs = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 8.64e15

export type TimedAnswer = {
  readonly answeredAt: number
  readonly elapsedMs: number
}

export type RetimedLesson<T> = {
  readonly startedAt: number
  readonly answers: readonly T[]
  /**
   * True when the session was too short to contain the answers it claims. Surfaced
   * rather than swallowed so a spike is visible — the same reason `GradeResult` reports
   * `rejected`.
   */
  readonly timingDiscarded: boolean
}

/**
 * The instant the session began, as the server is prepared to record it. Clamped rather
 * than rejected — it is a display value and the floor for the answers, not something
 * worth failing a real lesson over. Moving it later buys an attacker nothing; it only
 * shortens the window their own answers must fit inside.
 */
export function clampStartedAt(startedAt: number, now: number): number {
  const safe = isFiniteMs(startedAt) ? startedAt : now
  return clamp(safe, now - MAX_OFFLINE_AGE_MS, now)
}

/**
 * Re-time a lesson so the scheduler runs on something defensible. Four properties hold
 * on the way out, whatever came in:
 *
 * 1. **Bounded** — every `answeredAt` in `[startedAt, now]`, `startedAt` no older than
 *    `MAX_OFFLINE_AGE_MS`. Nothing in the future; the change that closes the exploit.
 * 2. **Monotonic** — out-of-order input is pulled forward onto its predecessor rather
 *    than dropped. The honest reading of a scrambled clock is "we do not know", and
 *    "the same moment as the one before" assumes least.
 * 3. **Capped by physics** — no answer took longer than the gap to the one after it.
 * 4. **An impossible session loses its timing** — every duration becomes
 *    `NO_TIMING_SIGNAL_MS`, which grades as Good and earns no speed bonus.
 */
export function retimeLesson<T extends TimedAnswer>(
  answers: readonly T[],
  startedAt: number,
  now: number,
): RetimedLesson<T> {
  const start = clampStartedAt(startedAt, now)
  // A session cannot end before it began; if the clamp inverted the window the lesson
  // collapses onto `now` rather than producing a negative one.
  const floor = Math.min(start, now)

  let previous = floor
  const timed = answers.map((answer) => {
    const claimed = isFiniteMs(answer.answeredAt) ? answer.answeredAt : now
    const at = clamp(claimed, previous, now)
    // The gap to the PREVIOUS answer is the ceiling on how long this one can have taken.
    //
    // Never allowed below `MIN_ANSWER_MS`, though, and that floor is doing real work: a
    // ceiling under 400 ms would push a HONEST claim beneath the credibility threshold
    // and the grader would discard a correct answer the user genuinely gave. Two
    // timestamps landing close together is ordinary — a fast reader on a speed round —
    // and it must not cost XP. Nothing is lost by the floor either: a payload sitting
    // just above 400 ms is exactly the shape the aggregate check below is for.
    const gap = at - previous
    const ceiling = Math.max(MIN_ANSWER_MS, Math.min(gap, MAX_ANSWER_MS))
    const elapsed = isFiniteMs(answer.elapsedMs) ? answer.elapsedMs : MAX_ANSWER_MS
    previous = at
    return { ...answer, answeredAt: at, elapsedMs: clamp(elapsed, 0, ceiling) }
  })

  const span = (timed[timed.length - 1]?.answeredAt ?? floor) - floor
  // Inclusive on purpose. `MIN_ANSWER_MS × items` is the theoretical floor of a possible
  // session, and a payload landing exactly on it — every answer taking precisely the
  // minimum credible time, to the millisecond — is not a fast learner, it is a loop. A
  // real session clears this by two orders of magnitude, because `startedAt` is when the
  // screen appeared and the span includes reading every question.
  const timingDiscarded = answers.length > 0 && span <= MIN_ANSWER_MS * answers.length

  return {
    startedAt: start,
    answers: timingDiscarded
      ? timed.map((a) => ({ ...a, elapsedMs: NO_TIMING_SIGNAL_MS }))
      : timed,
    timingDiscarded,
  }
}
