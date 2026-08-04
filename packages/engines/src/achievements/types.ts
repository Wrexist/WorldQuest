/**
 * The achievements vocabulary.
 *
 * Six rule types, and no seventh. A special case is one achievement's convenience and
 * every future achievement's tax — the moment the engine grows a bespoke branch, every
 * achievement written afterwards has to be checked against it.
 *
 * Nothing here knows what geography is. `counter` counts matching events; it does not
 * know a flag from a capital. That is what keeps a wildlife pack's achievements a
 * content release rather than an engine change.
 *
 * Spec: docs/systems/achievements.md
 */

export type AchievementId = string

/** Ordered weakest to strongest. The index is the comparison. */
export const TIERS = ['bronze', 'silver', 'gold', 'platinum', 'legendary'] as const
export type Tier = (typeof TIERS)[number]

// ── events ──────────────────────────────────────────────────────────────────

/**
 * What the engine observes.
 *
 * Domain events, not analytics events: these drive rewards, so they are emitted by
 * the authoritative grading path and never by a screen. The payload is a flat bag of
 * primitives so a rule's `where` clause stays a comparison rather than a traversal.
 */
export type DomainEvent = {
  readonly name: string
  /** Epoch ms. Supplied by the caller — this package never reads a clock. */
  readonly at: number
  readonly payload?: Readonly<Record<string, string | number | boolean>>
}

/** Equality only. Ranges and negation belong in the rule type, not in a mini-language. */
export type Filter = Readonly<Record<string, string | number | boolean>>

// ── rules ───────────────────────────────────────────────────────────────────

export type CounterRule = {
  readonly type: 'counter'
  readonly event: string
  readonly where?: Filter
  /**
   * Count distinct values of this payload field rather than occurrences.
   *
   * "100 flags mastered" must not be satisfied by mastering, forgetting and
   * re-mastering the same flag a hundred times.
   */
  readonly distinctBy?: string
}

export type StreakRule = {
  readonly type: 'streak'
  /** The streak the app already tracks; the event carries its current length. */
  readonly metric: 'daily_lesson' | 'perfect_lesson'
}

export type ThresholdRule = {
  readonly type: 'threshold'
  /** A stat the event reports as an absolute value — level, total XP, coins. */
  readonly stat: string
}

export type SetCompletionRule = {
  readonly type: 'set-completion'
  readonly event: string
  readonly where?: Filter
  readonly distinctBy: string
  /** The members that must all be seen. "All 54 African countries." */
  readonly members: readonly string[]
}

export type SessionCondition =
  | { readonly stat: string; readonly gte: number }
  | { readonly stat: string; readonly lte: number }
  | { readonly stat: string; readonly eq: string | number | boolean }

export type SessionRule = {
  readonly type: 'session'
  readonly event: string
  /** ALL conditions must hold within the SAME event. */
  readonly conditions: readonly SessionCondition[]
}

export type CompositeRule = {
  readonly type: 'composite'
  readonly op: 'and' | 'or'
  readonly rules: readonly Rule[]
}

export type Rule =
  | CounterRule
  | StreakRule
  | ThresholdRule
  | SetCompletionRule
  | SessionRule
  | CompositeRule

// ── definitions ─────────────────────────────────────────────────────────────

export type TierSpec = {
  readonly tier: Tier
  readonly threshold: number
}

export type AchievementDef = {
  /** Ships in user save data and in dashboards. Renaming one is a migration. */
  readonly id: AchievementId
  readonly category: string
  readonly hidden?: boolean
  readonly rule: Rule
  /** Ascending by threshold. A single-tier achievement has one entry. */
  readonly tiers: readonly TierSpec[]
  readonly showProgress?: boolean
  /**
   * Whether this can be replayed from history when it ships late.
   *
   * `session` rules and some streaks cannot: nothing in the log records that a lesson
   * was finished in under sixty seconds two years ago. Those apply from their release
   * date, and saying so here is what stops a backfill job inventing an unlock.
   */
  readonly backfill?: boolean
}

// ── progress ────────────────────────────────────────────────────────────────

export type AchievementProgress = {
  readonly achievementId: AchievementId
  /** The counter's current value, in whatever unit the rule counts. */
  readonly value: number
  /**
   * Distinct payload values already counted.
   *
   * Stored rather than recomputed: the engine is incremental by contract, so it must
   * know what it has already seen without rescanning history.
   */
  readonly seen?: readonly string[]
  readonly tier: Tier | null
  /** Epoch ms of the most recent tier unlock. */
  readonly unlockedAt?: number
}

export const emptyProgress = (achievementId: AchievementId): AchievementProgress => ({
  achievementId,
  value: 0,
  tier: null,
})

export type Unlock = {
  readonly achievementId: AchievementId
  readonly tier: Tier
  readonly at: number
}

export type EvaluateResult = {
  readonly progress: AchievementProgress
  /**
   * Tiers crossed by THIS event, weakest first.
   *
   * Plural because one event can cross several: a backfilled counter jumping from 0
   * to 200 passes bronze, silver and gold at once. The caller decides how to present
   * that — twelve consecutive celebration animations is a bug, not a reward.
   */
  readonly unlocked: readonly Unlock[]
}
