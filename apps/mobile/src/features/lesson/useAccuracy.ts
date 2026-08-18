/**
 * How well this user has been doing lately, for the one thing that scales to it.
 *
 * ## The gap this closes
 *
 * `generateDailyQuest` takes `recentAccuracy` and uses it for exactly one decision: which
 * goal the fifth quest slot asks for. The engine states the reason plainly — "a
 * perfect-lesson goal handed to someone at 60 % accuracy is a task they will fail every
 * day, and a daily failure is the opposite of the point".
 *
 * `todaysQuest` passed the literal `0.8`, with a note saying to read it from real lessons
 * "once history is synced". So every user on earth got `speed_round` — finish a lesson in
 * under ninety seconds — every day, permanently. For a confident learner that is easier
 * than the goal they earned; for a slow reader, a child, or anyone using a screen reader
 * it is the daily failure the scaling exists to prevent, and `streak_keeper` (finish one
 * lesson, any accuracy) was unreachable.
 *
 * ## Why yesterday's accuracy and not today's
 *
 * The window deliberately EXCLUDES today. `todaysQuest` is called both by the screen that
 * draws the quest and by the runner that advances it, so a figure that moved as the day
 * went on would compose one quest in the morning and a different one after lunch — the
 * fifth slot's goal would change under the user, and `submit-lesson` pins the first
 * version it sees, so the paid quest and the drawn quest would disagree.
 *
 * Excluding today makes it constant for the whole day by construction rather than by a
 * snapshot somebody has to remember to take.
 *
 * ## No history is not 80 %
 *
 * A user with no finished lessons gets `streak_keeper`. The old default put a first-day
 * user on `speed_round`, which is a guess about somebody nobody has watched yet — and
 * the wrong direction of guess, because day one is the day a quest most needs to be
 * finishable. "Finish a lesson" is also, on day one, exactly the right thing to ask.
 *
 * Mirrors `usePace`, which solves the same shape of problem for lesson length.
 */

import { useSyncExternalStore } from 'react'
import type { AnsweredItem } from '@worldquest/engines'
import { isRecord, readJson, writeJson } from '../../lib/storage.js'
import { localDay } from '../../lib/day.js'

const KEY = 'accuracy.recent.v1'

/**
 * Below `speed_round`'s threshold, so an unknown user gets the reachable goal.
 *
 * `performTask` reads ≥ 0.9 as `perfect_lesson`, ≥ 0.75 as `speed_round`, and anything
 * else as `streak_keeper`. This is a stand-in for "we have not watched you yet", and the
 * honest thing to ask somebody in that position is to finish one lesson.
 */
export const UNKNOWN_ACCURACY = 0.5

/**
 * Enough to be stable, few enough to follow somebody who is improving.
 *
 * Ten lessons rather than `usePace`'s forty answers: these are whole lessons, and a
 * learner's accuracy moves on a slower clock than their reading speed.
 */
const WINDOW = 10

type Sample = {
  /** The user's local day, so today's lessons can be excluded from today's quest. */
  readonly day: string
  /** 0–1 over the lesson's answered items. */
  readonly accuracy: number
}

const isSamples = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.every(
    (s) =>
      isRecord(s) &&
      typeof (s as Sample).day === 'string' &&
      typeof (s as Sample).accuracy === 'number' &&
      Number.isFinite((s as Sample).accuracy),
  )

let snapshot: readonly Sample[] | null = null
const listeners = new Set<() => void>()

const load = (): readonly Sample[] => readJson<Sample[]>(KEY, isSamples) ?? []
const read = (): readonly Sample[] => (snapshot ??= load())

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * The mean accuracy of recent lessons finished before `today`.
 *
 * Exported and parameterised so it is testable without a clock, which is the same
 * discipline `goalTargetFor` is held to.
 */
export function accuracyBefore(samples: readonly Sample[], today: string): number {
  const earlier = samples.filter((s) => s.day < today)
  if (earlier.length === 0) return UNKNOWN_ACCURACY
  return earlier.reduce((sum, s) => sum + s.accuracy, 0) / earlier.length
}

/** What the quest should scale its fifth slot to. Stable for the whole local day. */
export function recentAccuracy(now: Date = new Date()): number {
  return accuracyBefore(read(), localDay(now))
}

export function useRecentAccuracy(): number {
  const samples = useSyncExternalStore(subscribe, read, read)
  return accuracyBefore(samples, localDay(new Date()))
}

/**
 * Record what a finished lesson scored.
 *
 * Unanswered items are excluded, exactly as `recordPace` excludes them: a question the
 * clock ran out on says nothing about whether the user knew it, and counting it as wrong
 * would make a speed round permanently lower somebody's band.
 *
 * A lesson with nothing answered records nothing rather than a zero — leaving on the
 * first question is not evidence of anything.
 */
export function recordAccuracy(answers: readonly AnsweredItem[], now: Date = new Date()): void {
  const answered = answers.filter((a) => a.chosenOptionId !== null)
  if (answered.length === 0) return

  const accuracy = answered.filter((a) => a.wasCorrect).length / answered.length
  const next = [...read(), { day: localDay(now), accuracy }].slice(-WINDOW)
  snapshot = next
  writeJson(KEY, next)
  for (const listener of listeners) listener()
}

/** Test seam. Drops the cached snapshot so the next read hits storage again. */
export function resetAccuracyCache(): void {
  snapshot = null
}
