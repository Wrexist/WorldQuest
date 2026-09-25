/**
 * "Create a profile" — whether to ask, and how often it has been asked.
 *
 * ## The Duolingo beat, and the half of it we do not copy
 *
 * Duolingo lets you play before it asks who you are, then shows "Create a profile"
 * after an early lesson — the moment there is progress worth keeping. We ask at the
 * same moment for the same reason (`screen-catalog.md` §2: a real lesson before any
 * account ask). What we do not copy is the pressure around it: no "or you'll lose
 * everything", no ask on every launch, no ask that cannot be declined. The screen says
 * what a profile is FOR and offers "Not now", and this module makes sure "not now" is
 * believed.
 *
 * ## The rules, all of which must hold
 *
 * · **An adult.** `isChild === false`, exactly. Unknown is not permission — the same
 *   reading `track()` gives it — and an under-13 is never asked for an email address
 *   (COPPA / GDPR-K; Settings and Profile already hide the account flow for them).
 * · **A guest, KNOWN to be one.** `linked` in `useAccountStatus` starts false and only
 *   becomes true when the server answers, which is the right default for a card on
 *   Profile and the wrong one for a full screen after a lesson: offline, a signed-in
 *   learner would be asked to create the profile they already have. So only an answered
 *   "no email yet" counts.
 * · **Online.** The next screen sends an email code. Asking someone who cannot act on
 *   the answer spends one of their two asks on nothing.
 * · **Early.** One of this install's first two lessons. Past that the moment has passed,
 *   and Settings and Profile carry the offer for anybody who wants it later.
 * · **Twice, ever, per device.** Counted when the screen is actually shown, and kept in
 *   device storage so signing out does not reset it (`lib/storage.ts`).
 */

import { readDeviceJson, writeDeviceJson } from '../../lib/storage.js'

/** The most times this device is ever asked. */
export const PROFILE_ASK_LIMIT = 2

/** Only after one of the first this-many lessons on the install. */
export const PROFILE_ASK_WITHIN_LESSONS = 2

const KEY = 'account.profileAsk.v1'

export type ProfileAskInput = {
  /**
   * Lessons this install has brought to their end screen, INCLUDING the one that just
   * ended (`lessonsEverCompleted`). That counter also counts a lesson ended early, which
   * is why the after-lesson plan separately requires this one to be finished.
   */
  readonly lessonsEnded: number
  /** How many times this device has already shown the ask. */
  readonly timesShown: number
  /** From the age gate. Only an explicit `false` is an adult. */
  readonly isChild: boolean | undefined
  /** What the account lookup has said, if it has said anything yet. */
  readonly account: 'guest' | 'linked' | 'unknown'
  readonly online: boolean
}

export function shouldOfferProfile(input: ProfileAskInput): boolean {
  return (
    input.isChild === false &&
    input.account === 'guest' &&
    input.online &&
    input.timesShown < PROFILE_ASK_LIMIT &&
    input.lessonsEnded >= 1 &&
    input.lessonsEnded <= PROFILE_ASK_WITHIN_LESSONS
  )
}

/**
 * Whether the lesson that is starting could end in the ask.
 *
 * Asked before the lesson, so the account lookup — a round trip — is only made for the
 * handful of lessons where the answer matters, and has the whole lesson to arrive.
 */
export function mayOfferProfileAfterNextLesson(input: {
  readonly lessonsEndedBefore: number
  readonly timesShown: number
  readonly isChild: boolean | undefined
}): boolean {
  return shouldOfferProfile({
    lessonsEnded: input.lessonsEndedBefore + 1,
    timesShown: input.timesShown,
    isChild: input.isChild,
    account: 'guest',
    online: true,
  })
}

const isCount = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

/** How many times this device has shown the ask. */
export const profileAsksShown = (): number => readDeviceJson<number>(KEY, isCount) ?? 0

/** Called once per showing, by the screen that shows it. */
export function recordProfileAskShown(): void {
  writeDeviceJson(KEY, profileAsksShown() + 1)
}
