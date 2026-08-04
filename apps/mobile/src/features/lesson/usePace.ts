/**
 * How long this user takes to answer one item.
 *
 * ## Why anything needs this
 *
 * `lessonLength()` and `lessonsPerDay()` in the engine both take a median item time,
 * and neither was ever called — so every lesson was a hardcoded ten items and the
 * daily goal did nothing at all. The engine's own comment predicted the failure:
 *
 *   > with realistic item times every goal from 5 to 20 minutes lands above the
 *   > 20-item cap, so a 5-minute user and a 20-minute user get identical lessons and
 *   > the setting does nothing.
 *
 * That was the shipped behaviour, reached by a different route: nobody called it.
 * A user was asked their daily goal during onboarding, saw it in Settings, and it
 * changed nothing anywhere.
 *
 * ## Measured, not assumed
 *
 * The median of the user's own recent answers, kept on the device. A ten-year-old
 * reading a flag description and an adult tapping through capitals they half-know are
 * not the same person, and a fixed constant would size both lessons for whoever
 * happened to be in the room when it was picked.
 *
 * Median rather than mean: one answer where the phone was put down mid-question would
 * drag a mean far enough to reshape every lesson afterwards.
 *
 * ## The starting value
 *
 * A default is needed before there is any data, and it is a tuning constant rather
 * than a claim about anyone — the very first lesson uses it and then it stops
 * mattering. 6 seconds sits inside the engine's own credible-answer window
 * (`MIN_CREDIBLE_ANSWER_MS`..`MAX_CREDITED_ANSWER_MS`) and yields a 20-item lesson,
 * which is the cap the engine already treats as the sane maximum.
 */

import { useSyncExternalStore } from 'react'
import {
  MAX_CREDITED_ANSWER_MS,
  MIN_CREDIBLE_ANSWER_MS,
  type AnsweredItem,
} from '@worldquest/engines'
import { readJson, writeJson } from '../../lib/storage.js'

const KEY = 'pace.itemMs.v1'

/** See the header. Only ever used before the user has answered anything. */
export const DEFAULT_ITEM_MS = 6_000

/**
 * Enough to be stable, few enough to follow a user who is speeding up.
 *
 * A learner's pace on their first day and their thirtieth are different facts, and a
 * lifetime median would keep sizing lessons for the beginner they no longer are.
 */
const WINDOW = 40

let snapshot: readonly number[] | null = null
const listeners = new Set<() => void>()

const load = (): readonly number[] => {
  const stored = readJson<unknown>(KEY)
  return Array.isArray(stored) ? stored.filter((n): n is number => typeof n === 'number') : []
}

const read = (): readonly number[] => (snapshot ??= load())

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function medianOf(samples: readonly number[]): number {
  if (samples.length === 0) return DEFAULT_ITEM_MS
  const sorted = [...samples].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  // Even counts take the lower of the two middles rather than averaging them: an
  // average of two samples is a number nobody actually recorded, and for sizing a
  // lesson the slightly faster estimate is the kinder error — it makes lessons a
  // little shorter rather than a little longer than the user asked for.
  return sorted.length % 2 === 1 ? sorted[mid]! : sorted[mid - 1]!
}

/** The user's median answer time in ms, or the default until there is data. */
export function useItemPace(): number {
  return medianOf(useSyncExternalStore(subscribe, read, read))
}

export const itemPace = (): number => medianOf(read())

/**
 * Records the answers from a finished lesson.
 *
 * Timeouts and implausible times are dropped rather than clamped. A question the user
 * never answered says nothing about how fast they answer, and a ten-minute "answer"
 * is a phone left on a table — feeding either in would reshape every later lesson
 * around a moment that was not learning.
 */
export function recordPace(answers: readonly AnsweredItem[]): void {
  const credible = answers
    .filter((answer) => answer.chosenOptionId !== null)
    .map((answer) => answer.elapsedMs)
    .filter((ms) => ms >= MIN_CREDIBLE_ANSWER_MS && ms <= MAX_CREDITED_ANSWER_MS)

  if (credible.length === 0) return

  const next = [...read(), ...credible].slice(-WINDOW)
  snapshot = next
  writeJson(KEY, next)
  for (const listener of listeners) listener()
}

/** Test seam. Drops the cached snapshot so the next read hits storage again. */
export function resetPaceCache(): void {
  snapshot = null
}
