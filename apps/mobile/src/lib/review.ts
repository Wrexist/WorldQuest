/**
 * Asking for a review, at a moment the user might actually want to give one.
 *
 * ## Why this exists
 *
 * Ratings are the single largest lever on App Store conversion, and almost nobody
 * leaves one unasked. So the question is never *whether* to ask — it is *when*, and
 * every wrong answer to that costs a one-star review from someone who was interrupted.
 *
 * ## The four rules
 *
 * 1. **Never to a child.** `onboarding.isChild` is decided at the age gate and stored on
 *    device (see `useOnboarding` for why it is stored rather than recomputed). A rating
 *    prompt is a request to leave the app and write in public; we do not send ten-year
 *    olds to the App Store. This is checked first and has no override.
 * 2. **Only after real pride.** The callers are the celebration screen and nothing else.
 *    There is no `moment` value for a lesson summary, so the prompt structurally cannot
 *    fire after a wrong answer, a lost heart, or a broken streak. A rule enforced by the
 *    absence of a code path is a rule that survives the next refactor.
 * 3. **Only once the app has earned an opinion.** `MIN_ACTIVE_DAYS` separate days with a
 *    finished lesson. Day one is a rating of the screenshots.
 * 4. **Rarely.** Once per version, and never twice inside `COOL_OFF_DAYS`.
 *
 * ## Why the cool-off is 122 days and not "every release"
 *
 * iOS caps the native prompt at three per user per 365 days and then silently does
 * nothing — no error, no callback, no way to tell. Asking on every release would burn
 * the year's quota on the first three builds, and the request that mattered (a user on
 * a 30-day streak) would hit a no-op. 122 days is 365 ÷ 3 rounded UP, so we spend the
 * allowance strictly no faster than the platform refills it. It was 120 first, which
 * reads like the same number and is not: three asks 120 days apart fit inside 360 days,
 * and the third one lands in a year that already had three.
 *
 * ## Why `isAvailableAsync` and not `hasAction`
 *
 * `hasAction()` also returns true when the app config merely carries a store URL, and
 * in that case `requestReview()` opens the App Store in a browser — throwing the user
 * out of the app mid-celebration. That is the dark pattern this repo does not ship. We
 * gate on the native in-app modal being genuinely available and otherwise do nothing.
 *
 * A side effect worth knowing: on iOS `isAvailableAsync()` is false under TestFlight, so
 * this will not fire for the beta build. That is correct — TestFlight has no store
 * listing to rate — and it does mean the only way to see this work is a real release.
 *
 * ## Never throws
 *
 * Same contract as `haptics.ts`. A celebration must not fail because a store SDK did.
 */

import Constants from 'expo-constants'
import * as StoreReview from 'expo-store-review'
import { readJson, writeJson } from './storage.js'
import { track } from './analytics.js'
import { readOnboarding } from '../features/onboarding/useOnboarding.js'
import { activeDays } from '../features/profile/useWeekActivity.js'

/**
 * The occasions that qualify. Both are the quest-complete celebration; they are
 * distinguished so the dashboard can tell which one people say yes to.
 *
 * Nothing else may be added here without a good answer to "is the user proud right
 * now, and will an interruption spoil it".
 */
export type ReviewMoment = 'quest_complete' | 'streak_milestone'

/** Separate days with a finished lesson before we are willing to ask. */
export const MIN_ACTIVE_DAYS = 3

/** 365 ÷ 3, rounded up — no faster than iOS refills its own quota. See the header. */
export const COOL_OFF_DAYS = 122

const DAY_MS = 86_400_000

const KEY = 'review.asked.v1'

/** What we remember about the last ask. Absent means we have never asked. */
export type ReviewLog = {
  readonly version: string
  readonly at: number
}

/** Everything the decision depends on, so the decision itself can be a pure function. */
export type ReviewSituation = {
  /** `StoreReview.isAvailableAsync()` — the native modal, not a store link. */
  readonly available: boolean
  readonly isChild: boolean
  /** The running app version, which is what "once per version" is counted in. */
  readonly version: string
  readonly now: number
  readonly activeDays: number
  readonly log: ReviewLog | null
}

/**
 * Why we did or did not ask.
 *
 * A verdict rather than a boolean because every one of these is a distinct product
 * decision, and a test that asserts `false` cannot tell you which rule it hit.
 */
export type ReviewVerdict =
  | 'ask'
  | 'unavailable'
  | 'child'
  | 'too-new'
  | 'asked-this-version'
  | 'cooling-off'

/** Pure. Given the situation, do we ask? */
export function reviewVerdict(situation: ReviewSituation): ReviewVerdict {
  // First, and with no exception. See rule 1.
  if (situation.isChild) return 'child'
  if (!situation.available) return 'unavailable'
  if (situation.activeDays < MIN_ACTIVE_DAYS) return 'too-new'
  if (situation.log === null) return 'ask'
  if (situation.log.version === situation.version) return 'asked-this-version'
  if (situation.now - situation.log.at < COOL_OFF_DAYS * DAY_MS) return 'cooling-off'
  return 'ask'
}

/**
 * Gather the situation, decide, and — if the answer is yes — ask.
 *
 * Resolves to the verdict so a caller or a test can see what happened. Callers ignore
 * it: there is nothing sensible for a screen to do differently either way.
 *
 * The ask is RECORDED BEFORE it is made. If `requestReview()` throws or the process is
 * killed while the modal is up, the recorded state must be "we asked" — the failure mode
 * of over-recording is one missed prompt, and the failure mode of under-recording is a
 * user who gets asked on every single quest until they uninstall.
 */
export async function askForReview(moment: ReviewMoment): Promise<ReviewVerdict> {
  try {
    // Cheap and synchronous, and it is the rule with no override — so it runs before we
    // touch the store SDK at all. A child's device should not even ask iOS the question.
    const { isChild } = readOnboarding()
    if (isChild === true) return 'child'

    const version = Constants.expoConfig?.version ?? '0.0.0'
    const situation: ReviewSituation = {
      available: await StoreReview.isAvailableAsync(),
      isChild: false,
      version,
      now: Date.now(),
      activeDays: activeDays(),
      log: readJson<ReviewLog>(KEY),
    }

    const verdict = reviewVerdict(situation)
    if (verdict !== 'ask') return verdict

    writeJson(KEY, { version, at: situation.now } satisfies ReviewLog)
    // No user identifier and no rating — iOS does not tell us what they chose, and we
    // would not want it per-user if it did. This answers one question: which moment is
    // worth asking at.
    track('review_prompt_requested', { moment, active_days: situation.activeDays })
    await StoreReview.requestReview()
    return 'ask'
  } catch {
    // Swallowed on purpose — see the header.
    return 'unavailable'
  }
}
