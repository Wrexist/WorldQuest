/**
 * What follows a finished lesson, in order.
 *
 * Duolingo's end-of-lesson rhythm is a short run of full screens, each about one
 * thing: the lesson (the summary), the day (the streak), the daily quest, a badge when
 * one landed, and only then anything we want from the learner — a profile, and a
 * paywall when there is something to sell. WorldQuest keeps that order because each
 * beat means something different — collapsed into one screen, a quest bonus reads as
 * lesson XP and a streak reads as a score. And the asks come last because a
 * celebration you have to get past an offer to reach is not a celebration.
 *
 * Pure, so the order is testable without a router. The route asks for a plan and
 * walks it; each step forwards the rest with `nextAfterLesson`.
 *
 * The chain travels in the URL (`?then=quest,paywall`) rather than a store: every
 * one of these routes is deep-linkable, a restart mid-chain must not replay it, and
 * a URL cannot outlive the navigation it belongs to. Anything a URL says is
 * re-parsed against the allowlist below, so a hand-written link can skip a beat but
 * never invent one — and the unlocks it carries are re-read against the achievement
 * catalogue for the same reason (`achievements/unlockParams.ts`).
 */

import type { PendingUnlock } from '../achievements/pending.js'
import { formatUnlocks, parseUnlocks } from '../achievements/unlockParams.js'

export type AfterLessonStep = 'streak' | 'quest' | 'achievements' | 'profile' | 'paywall'

const ORDER: readonly AfterLessonStep[] = ['streak', 'quest', 'achievements', 'profile', 'paywall']

const PATHS: Record<AfterLessonStep, string> = {
  streak: '/streak-extended',
  quest: '/quest-complete',
  achievements: '/achievement-unlocked',
  profile: '/create-profile',
  paywall: '/paywall',
}

export type AfterLessonInput = {
  /** Finished rather than ended early. An abandoned lesson is not a day's activity. */
  readonly completed: boolean
  /** Whether today already counted in the streak before this lesson started. */
  readonly countedTodayBefore: boolean
  /** Whether this lesson landed the daily quest's last task. */
  readonly questCompleted: boolean
  /**
   * How many unlocked tiers are waiting to be seen.
   *
   * Not only this lesson's: a server unlock that arrived during a background flush had
   * no screen to appear on, and the end of a lesson is the next one.
   */
  readonly unlocked: number
  /** Whether a guest adult may be asked to create a profile now (`shouldOfferProfile`). */
  readonly offerProfile: boolean
  /** Whether a paywall may follow: the taster, with something to sell, to a non-subscriber adult. */
  readonly offerPaywall: boolean
}

export function planAfterLesson(input: AfterLessonInput): readonly AfterLessonStep[] {
  const steps: AfterLessonStep[] = []
  // Once a day, the first finished lesson — the moment the streak actually moves.
  if (input.completed && !input.countedTodayBefore) steps.push('streak')
  if (input.questCompleted) steps.push('quest')
  // After an early exit too. The badge was earned by answers that were given, and the
  // summary has always celebrated it either way: withholding it now would punish
  // somebody for stopping.
  if (input.unlocked > 0) steps.push('achievements')
  // Only after a FINISHED lesson. An offer at the end of a lesson somebody chose to
  // leave is an offer at the worst moment to make one.
  if (input.completed && input.offerProfile) steps.push('profile')
  if (input.offerPaywall) steps.push('paywall')
  return steps
}

/** Reads a `then` param back into steps: known names only, in canonical order, once each. */
export function parseSteps(raw: string | undefined): readonly AfterLessonStep[] {
  if (!raw) return []
  const asked = new Set(raw.split(','))
  return ORDER.filter((step) => asked.has(step))
}

/** What the chain carries in its URL besides the steps themselves. */
export type AfterLessonCarry = {
  /** ISO codes for the paywall, whose first page draws the flags just practised. */
  readonly countries?: readonly string[] | undefined
  /** The tiers the achievement cards celebrate. */
  readonly unlocks?: readonly PendingUnlock[] | undefined
}

/**
 * The href for the first of `steps`, carrying the rest.
 *
 * Each carried value rides only while a step that reads it is still ahead, so a URL
 * never holds data for a screen it will not reach. No steps left means Home.
 */
export function hrefFor(steps: readonly AfterLessonStep[], carry: AfterLessonCarry = {}): string {
  const [first, ...rest] = steps
  if (first === undefined) return '/'
  const query = new URLSearchParams()
  if (rest.length > 0) query.set('then', rest.join(','))
  const countries = carry.countries ?? []
  if (countries.length > 0 && steps.includes('paywall')) query.set('countries', countries.join(','))
  const unlocks = carry.unlocks ?? []
  if (unlocks.length > 0 && steps.includes('achievements')) query.set('unlocks', formatUnlocks(unlocks))
  if (first === 'paywall') {
    query.delete('then')
    query.set('source', 'onboarding')
  }
  const search = query.toString()
  return search ? `${PATHS[first]}?${search}` : PATHS[first]
}

/**
 * The query every step in the chain receives.
 *
 * A step hands the WHOLE of it to `nextAfterLesson` rather than picking the fields it
 * knows about: a step that forwarded only `then` and `countries` would silently drop the
 * unlocks for the card two screens later, and nothing would fail — the card would simply
 * never appear.
 */
export type AfterLessonParams = {
  readonly then?: string | undefined
  readonly countries?: string | undefined
  readonly unlocks?: string | undefined
}

/** Where a step goes when it is dismissed: the rest of the chain, else Home. */
export function nextAfterLesson(params: AfterLessonParams): string {
  return hrefFor(parseSteps(params.then), {
    countries: params.countries ? params.countries.split(',').filter(Boolean) : [],
    unlocks: parseUnlocks(params.unlocks),
  })
}
