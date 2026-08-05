/**
 * The learning engine's vocabulary.
 *
 * Note what is absent: nothing here knows what geography is. The engine handles
 * facts, items, reviews and memory. Geography is content pack #1, and history,
 * wildlife and astronomy plug into exactly these types.
 *
 * Spec: docs/systems/learning-engine.md
 */

/** Stable content ID, e.g. 'geo.JP.capital'. Ships in save data — never renamed. */
export type FactId = string

/** Stable template ID, e.g. 'tpl.capital.mc4'. */
export type TemplateId = string

/** FSRS grade. Derived from a binary answer plus response time — see deriveRating(). */
export type Rating = 1 | 2 | 3 | 4

export const RATING = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
} as const satisfies Record<string, Rating>

/**
 * The label the UI shows. The user never sees "stability = 12.4".
 * `mastered` is what "183 / 195 countries" means — a claim we can defend.
 */
export type Mastery =
  | 'unseen'
  | 'learning'
  | 'familiar'
  | 'proficient'
  | 'mastered'
  | 'burnished'

/**
 * A user's memory state for one fact. Keyed on (user, fact) — NOT (user, item):
 * knowing "Tokyo is the capital of Japan" is one piece of knowledge however we
 * choose to ask about it. Varying the presentation strengthens encoding and stops
 * users memorising an answer's position instead of the answer.
 */
export type MemoryState = {
  readonly factId: FactId
  /** Days until recall probability decays to the target. The memory's strength. */
  readonly stability: number
  /** 1–10. How hard this fact is *for this user*. */
  readonly difficulty: number
  readonly reps: number
  readonly lapses: number
  /** Epoch ms, or null if never reviewed. */
  readonly lastReviewAt: number | null
  /** Epoch ms. */
  readonly dueAt: number
  /** Leeches are suspended from normal rotation and given different treatment. */
  readonly suspended: boolean
}

/** One answer to one item. `review_log` is append-only and authoritative. */
export type ReviewEvent = {
  readonly factId: FactId
  readonly templateId: TemplateId
  readonly rating: Rating
  readonly wasCorrect: boolean
  readonly elapsedMs: number
  /** Epoch ms, server-assigned. */
  readonly at: number
}

export type ReviewInput = {
  readonly factId: FactId
  /** null on the first ever review of this fact. */
  readonly state: MemoryState | null
  readonly rating: Rating
  /** Injected clock — never Date.now(). */
  readonly now: number
  /** Product decision: 0.85 kids · 0.90 default · 0.93 completionists. */
  readonly targetRetention?: number
}

/** Tuned per audience. Exposed to users in human terms, never as a number. */
export const DEFAULT_TARGET_RETENTION = 0.9

/** Answers faster than this earn nothing and do not affect scheduling (anti-cheat). */
export const MIN_CREDIBLE_ANSWER_MS = 400

/** The user put the phone down — cap rather than score it as forgetting. */
export const MAX_CREDITED_ANSWER_MS = 30_000

/** Beyond this, the review is logged but excluded from scheduling entirely. */
export const MAX_SCHEDULABLE_ANSWER_MS = 60_000

/** A fact that lapses this many times gets a different treatment, not more repeats. */
export const LEECH_LAPSE_THRESHOLD = 8

/**
 * How long a leech rests before it is offered again.
 *
 * Suspension used to be permanent, and not by design: `suspended` was computed from
 * lifetime `lapses`, a number that only ever goes up, and `selectItems` dropped every
 * suspended candidate. So a fact that crossed the threshold could never be shown again,
 * and therefore could never be answered correctly, and therefore could never come back —
 * for the life of the account. A ten-year-old who struggled with Ulaanbaatar in November
 * would simply never see it again, and the app would go on reporting that they had not
 * learned it.
 *
 * The spec has always said a leech needs "a different template or an explanation, not
 * another repetition". Resting is the honest version of that with the pieces that exist
 * today: two weeks of distance, then the item returns through the struggling slot with a
 * presentation `itemsForFact` shuffles independently. One correct answer releases it.
 */
export const LEECH_COOLDOWN_DAYS = 14
