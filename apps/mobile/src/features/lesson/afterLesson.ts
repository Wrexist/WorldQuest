/**
 * What follows a finished lesson, in order.
 *
 * Duolingo's end-of-lesson rhythm is a short run of full screens, each about one
 * thing: the lesson (the summary), the day (the streak), the daily quest, and only
 * then anything we want from the learner. WorldQuest keeps that order because each
 * beat means something different — collapsed into one screen, a quest bonus reads
 * as lesson XP and a streak reads as a score.
 *
 * Pure, so the order is testable without a router. The route asks for a plan and
 * walks it; each celebration forwards the rest with `nextAfterLesson`.
 *
 * The chain travels in the URL (`?then=quest,paywall`) rather than a store: every
 * one of these routes is deep-linkable, a restart mid-chain must not replay it, and
 * a URL cannot outlive the navigation it belongs to. Anything a URL says is
 * re-parsed against the allowlist below, so a hand-written link can skip a beat but
 * never invent one.
 */

export type AfterLessonStep = 'streak' | 'quest' | 'paywall'

const ORDER: readonly AfterLessonStep[] = ['streak', 'quest', 'paywall']

export type AfterLessonInput = {
  /** Finished rather than ended early. An abandoned lesson is not a day's activity. */
  readonly completed: boolean
  /** Whether today already counted in the streak before this lesson started. */
  readonly countedTodayBefore: boolean
  /** Whether this lesson landed the daily quest's last task. */
  readonly questCompleted: boolean
  /** Whether a paywall may follow: the taster, with something to sell, to a non-subscriber adult. */
  readonly offerPaywall: boolean
}

export function planAfterLesson(input: AfterLessonInput): readonly AfterLessonStep[] {
  const steps: AfterLessonStep[] = []
  // Once a day, the first finished lesson — the moment the streak actually moves.
  if (input.completed && !input.countedTodayBefore) steps.push('streak')
  if (input.questCompleted) steps.push('quest')
  if (input.offerPaywall) steps.push('paywall')
  return steps
}

/** Reads a `then` param back into steps: known names only, in canonical order, once each. */
export function parseSteps(raw: string | undefined): readonly AfterLessonStep[] {
  if (!raw) return []
  const asked = new Set(raw.split(','))
  return ORDER.filter((step) => asked.has(step))
}

/**
 * The href for the first of `steps`, carrying the rest.
 *
 * `countries` rides along for the paywall, whose first page draws the flags just
 * practised; it is a list of ISO codes, safe in a URL. No steps left means Home.
 */
export function hrefFor(steps: readonly AfterLessonStep[], countries: readonly string[] = []): string {
  const [first, ...rest] = steps
  if (first === undefined) return '/'
  const query = new URLSearchParams()
  if (rest.length > 0) query.set('then', rest.join(','))
  if (countries.length > 0 && steps.includes('paywall')) query.set('countries', countries.join(','))
  if (first === 'paywall') {
    query.delete('then')
    query.set('source', 'onboarding')
  }
  const path = first === 'streak' ? '/streak-extended' : first === 'quest' ? '/quest-complete' : '/paywall'
  const search = query.toString()
  return search ? `${path}?${search}` : path
}

/** Where a celebration goes when it is dismissed. */
export function nextAfterLesson(then: string | undefined, countries: string | undefined): string {
  return hrefFor(parseSteps(then), countries ? countries.split(',').filter(Boolean) : [])
}
