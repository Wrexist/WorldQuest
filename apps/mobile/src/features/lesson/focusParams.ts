/**
 * A lesson focus, to and from a query string.
 *
 * ## Who sends one
 *
 * The country page ("Practise this country"), the continent page ("Start"), and the
 * daily quest. All three are STRUCTURED entry points: each has a subject and sends it.
 *
 * A practice picker used to send one too, and was removed — a configuration screen in
 * front of the one action this app wants repeated makes the habit harder, and it made the
 * session different every day when a ritual is a thing that is the same every day. See
 * `docs/product/daily-quest-research.md §1`. The machinery survives because the three
 * callers above are not configuration; they are a place with a name.
 *
 * ## Why a URL rather than a store
 *
 * `/lesson` is already deep-linkable on purpose — the daily reminder opens it directly —
 * and a focused lesson is the same thing with a narrower pool. Putting the choice in the
 * URL means "practise Sweden" is a link: the country page can send one, the region page
 * can send one, a notification could send one, and none of them needs to write to a store
 * the lesson then reads back. It also means the choice cannot outlive the lesson, which
 * is the correct lifetime — nobody wants yesterday's "capitals only" still in force
 * tomorrow because a store kept it.
 *
 * ## The parse is defensive, and deliberately silent
 *
 * These values arrive from a URL, which means they arrive from anywhere: a typo, an old
 * link, a notification built by a version of the app that has since changed. So every
 * field is validated and a bad one is dropped rather than thrown on. Dropping a filter
 * widens the lesson, which is the safe direction to fail in — the user gets more
 * questions than they asked for rather than a crash or an empty lesson.
 *
 * `region` is expanded to entity ids by the CALLER, not here, for the same reason
 * `focus.ts` has no region field: this file would have to know that "EU" means Europe.
 * It carries the code across and the route resolves it against the index.
 */

import type { LessonFocus } from '@worldquest/engines'

/** Bounds the engine itself enforces, so a URL cannot ask for a 500-question lesson. */
const MIN_LENGTH = 5
const MAX_LENGTH = 20

export type ParsedFocus = {
  /** Exact facts, from the daily quest. */
  readonly factIds: readonly string[]
  readonly attributes: readonly string[]
  /** Entity ids named directly — `/lesson?entity=SE` from the country page. */
  readonly entities: readonly string[]
  /** A group code the caller must expand against the index — `/lesson?region=EU`. */
  readonly region: string | undefined
  readonly difficulty: { readonly min?: number; readonly max?: number } | undefined
  readonly length: number | undefined
}

/**
 * Build the query string. Only what was chosen appears, so an unfocused lesson is
 * `/lesson` exactly as before and the URL stays readable in a bug report.
 */
export function focusToParams(focus: LessonFocus, length: number | undefined): string {
  const params = new URLSearchParams()
  // The daily quest's facts. Long — five tasks is up to about fifteen ids — and that is
  // acceptable for an in-app route: this URL is never typed, shared or stored, and the
  // alternative is a store the runner reads back, which is the coupling the whole
  // params module exists to avoid.
  if (focus.factIds && focus.factIds.length > 0) params.set('facts', focus.factIds.join(','))
  if (focus.attributes && focus.attributes.length > 0) params.set('attr', focus.attributes.join(','))
  if (focus.entities && focus.entities.length > 0) params.set('entity', focus.entities.join(','))
  if (focus.difficulty?.min !== undefined) params.set('min', String(focus.difficulty.min))
  if (focus.difficulty?.max !== undefined) params.set('max', String(focus.difficulty.max))
  if (length !== undefined) params.set('len', String(length))
  return params.toString()
}

const list = (value: string | undefined): readonly string[] =>
  value === undefined || value === ''
    ? []
    : value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)

/** A whole number inside `[lo, hi]`, or undefined. Anything else is dropped. */
const bounded = (value: string | undefined, lo: number, hi: number): number | undefined => {
  if (value === undefined) return undefined
  const n = Number(value)
  return Number.isInteger(n) && n >= lo && n <= hi ? n : undefined
}

export function parseFocusParams(params: {
  facts?: string | undefined
  attr?: string | undefined
  entity?: string | undefined
  region?: string | undefined
  min?: string | undefined
  max?: string | undefined
  len?: string | undefined
}): ParsedFocus {
  const min = bounded(params.min, 1, 5)
  const max = bounded(params.max, 1, 5)

  return {
    factIds: list(params.facts),
    attributes: list(params.attr),
    entities: list(params.entity),
    // Not validated against the region list here: this file does not know what regions
    // exist, and the route's expansion returns an empty entity set for a code nobody is
    // in, which the focus builder then treats as "no filter" — widening, which is the
    // safe direction.
    region: params.region === '' ? undefined : params.region,
    // A band with min above max would match nothing at all, which is the one parse that
    // fails CLOSED rather than open. Swapped rather than dropped: somebody asking for
    // 4..2 meant 2..4, and an empty lesson is the least useful reading of that.
    difficulty:
      min === undefined && max === undefined
        ? undefined
        : {
            ...(min !== undefined ? { min: max !== undefined ? Math.min(min, max) : min } : {}),
            ...(max !== undefined ? { max: min !== undefined ? Math.max(min, max) : max } : {}),
          },
    length: bounded(params.len, MIN_LENGTH, MAX_LENGTH),
  }
}
