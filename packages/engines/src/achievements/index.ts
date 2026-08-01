/**
 * The achievement rule engine.
 *
 * ## Incremental by contract
 *
 * `evaluate` takes the stored progress plus ONE new event and returns the new
 * progress. It never rescans history. That is what makes ~300 achievements cheap
 * enough to evaluate on every single answer — the alternative is a full replay per
 * event, which is quadratic in a user's lifetime and gets slower the longer someone
 * stays, punishing exactly the users we most want to keep.
 *
 * ## Pure, like everything here
 *
 * No clock: `event.at` is the time. This module runs in the app for an optimistic
 * celebration AND in the edge function that awards the XP, and those two must agree.
 * A `Date.now()` in here would make them disagree by however long the network took.
 *
 * ## Server-authoritative
 *
 * Achievements award XP and coins, so a client that could unlock them could mint
 * currency. The client's unlocks are a guess used to start an animation; the server's
 * list is the truth, and a client-only unlock is discarded silently.
 *
 * Spec: docs/systems/achievements.md §4
 */

import {
  TIERS,
  emptyProgress,
  type AchievementDef,
  type AchievementProgress,
  type CompositeRule,
  type DomainEvent,
  type EvaluateResult,
  type Filter,
  type Rule,
  type SessionRule,
  type Tier,
  type Unlock,
} from './types.js'

export * from './types.js'

const tierRank = (tier: Tier): number => TIERS.indexOf(tier)

/** Every field in the filter must match the event's payload exactly. */
function matches(event: DomainEvent, where: Filter | undefined): boolean {
  if (where === undefined) return true
  const payload = event.payload ?? {}
  for (const [key, expected] of Object.entries(where)) {
    if (payload[key] !== expected) return false
  }
  return true
}

const numberField = (event: DomainEvent, field: string): number | null => {
  const value = event.payload?.[field]
  return typeof value === 'number' ? value : null
}

/**
 * The new counter value after this event, or `null` if the event is irrelevant.
 *
 * `null` rather than "the same value" so the caller can tell "this event did nothing"
 * from "this event set the value to what it already was" — only the second should be
 * able to unlock anything, and only the first should leave `seen` untouched.
 */
type Advance = { readonly value: number; readonly seen?: readonly string[] } | null

function advance(rule: Rule, progress: AchievementProgress, event: DomainEvent): Advance {
  switch (rule.type) {
    case 'counter': {
      if (event.name !== rule.event || !matches(event, rule.where)) return null

      if (rule.distinctBy === undefined) return { value: progress.value + 1 }

      // Distinct: "100 flags mastered" must not be satisfied by mastering, forgetting
      // and re-mastering the same flag a hundred times.
      const key = event.payload?.[rule.distinctBy]
      if (key === undefined) return null
      const seen = progress.seen ?? []
      if (seen.includes(String(key))) return { value: progress.value }
      return { value: progress.value + 1, seen: [...seen, String(key)] }
    }

    case 'streak': {
      // `streak_extended` is the daily streak's event name — it predates this engine
      // and ships in analytics dashboards, so it is not renameable. Other metrics use
      // the regular `streak_<metric>` shape.
      const names =
        rule.metric === 'daily_lesson'
          ? ['streak_extended', 'streak_daily_lesson']
          : [`streak_${rule.metric}`]
      if (!names.includes(event.name)) return null

      const length = numberField(event, 'length')
      if (length === null) return null

      // The streak's CURRENT length, not a running total. A broken streak must be
      // able to move this value DOWN — an achievement showing "28 / 30" after the
      // streak died at 28 is a lie the user notices the next day.
      return { value: length }
    }

    case 'threshold': {
      const value = numberField(event, rule.stat)
      if (value === null) return null
      // Absolute, not incremental: the event reports the stat, the rule compares it.
      return { value }
    }

    case 'set-completion': {
      if (event.name !== rule.event || !matches(event, rule.where)) return null
      const key = event.payload?.[rule.distinctBy]
      if (key === undefined) return null

      const member = String(key)
      // A member that is not in the set does not count towards it. Without this, a
      // "all African countries" achievement completes on 54 European ones.
      if (!rule.members.includes(member)) return null

      const seen = progress.seen ?? []
      if (seen.includes(member)) return { value: progress.value }
      return { value: progress.value + 1, seen: [...seen, member] }
    }

    case 'session':
      return sessionAdvance(rule, progress, event)

    case 'composite':
      return compositeAdvance(rule, progress, event)
  }
}

/**
 * A condition within ONE event.
 *
 * All conditions must hold in the same event — "a perfect lesson under 60 seconds" is
 * one lesson, not a perfect lesson last week and a fast one today. Progress is the
 * number of qualifying sessions, so it tiers naturally: 1, 10, 50 perfect lessons.
 */
function sessionAdvance(
  rule: SessionRule,
  progress: AchievementProgress,
  event: DomainEvent,
): Advance {
  if (event.name !== rule.event) return null

  for (const condition of rule.conditions) {
    const raw = event.payload?.[condition.stat]
    if (raw === undefined) return null

    if ('eq' in condition) {
      if (raw !== condition.eq) return null
      continue
    }
    if (typeof raw !== 'number') return null
    if ('gte' in condition && raw < condition.gte) return null
    if ('lte' in condition && raw > condition.lte) return null
  }

  return { value: progress.value + 1 }
}

/**
 * AND / OR over sub-rules.
 *
 * Progress is expressed as the number of satisfied branches, which is the only
 * meaning that works for both operators: `and` needs all of them, `or` needs one. A
 * composite's tier thresholds are therefore counts of branches, not domain units.
 */
function compositeAdvance(
  rule: CompositeRule,
  progress: AchievementProgress,
  event: DomainEvent,
): Advance {
  // Each branch keeps its own counter, packed into `seen` as `index:value` so the
  // whole composite still round-trips through one progress row. Storing a nested
  // structure would make this the one rule type the database has to know about.
  const branch = new Map<number, number>()
  for (const entry of progress.seen ?? []) {
    const [index, value] = entry.split(':')
    branch.set(Number(index), Number(value))
  }

  let touched = false
  rule.rules.forEach((sub, index) => {
    const subProgress: AchievementProgress = {
      achievementId: progress.achievementId,
      value: branch.get(index) ?? 0,
      tier: null,
    }
    const result = advance(sub, subProgress, event)
    if (result === null) return
    touched = true
    branch.set(index, result.value)
  })

  if (!touched) return null

  const satisfied = rule.rules.filter((_, index) => (branch.get(index) ?? 0) > 0).length
  const value = rule.op === 'and' ? (satisfied === rule.rules.length ? 1 : 0) : satisfied > 0 ? 1 : 0

  return {
    value,
    seen: [...branch.entries()].map(([index, count]) => `${index}:${count}`),
  }
}

/**
 * Apply one event to one achievement.
 *
 * Returns the new progress and every tier crossed by this event — plural, because a
 * backfilled counter jumping from 0 to 200 passes bronze, silver and gold at once.
 */
export function evaluate(
  def: AchievementDef,
  progress: AchievementProgress,
  event: DomainEvent,
): EvaluateResult {
  const next = advance(def.rule, progress, event)
  if (next === null) return { progress, unlocked: [] }

  const currentRank = progress.tier === null ? -1 : tierRank(progress.tier)

  // Ascending, so the last one reached is the highest. Sorting here rather than
  // trusting the definition means a mis-ordered content file cannot silently award
  // platinum at ten flags.
  const tiers = [...def.tiers].sort((a, b) => a.threshold - b.threshold)

  const unlocked: Unlock[] = []
  let tier = progress.tier

  for (const spec of tiers) {
    if (next.value < spec.threshold) break
    if (tierRank(spec.tier) <= currentRank) continue
    unlocked.push({ achievementId: def.id, tier: spec.tier, at: event.at })
    tier = spec.tier
  }

  return {
    progress: {
      achievementId: def.id,
      value: next.value,
      // A tier, once earned, is never taken away. A streak achievement's VALUE falls
      // when the streak breaks — the badge does not. Revoking a badge for something
      // the user genuinely did is the kind of thing that ends a habit.
      tier,
      ...(next.seen !== undefined ? { seen: next.seen } : progress.seen ? { seen: progress.seen } : {}),
      ...(unlocked.length > 0
        ? { unlockedAt: event.at }
        : progress.unlockedAt !== undefined
          ? { unlockedAt: progress.unlockedAt }
          : {}),
    },
    unlocked,
  }
}

/**
 * Apply one event across a whole catalogue.
 *
 * The hot path: called once per domain event with every definition. Rules that do not
 * match the event name bail in a string comparison, so a catalogue of 300 costs a few
 * hundred comparisons rather than a database round trip.
 */
export function evaluateAll(
  definitions: readonly AchievementDef[],
  progressById: ReadonlyMap<string, AchievementProgress>,
  event: DomainEvent,
): { progress: Map<string, AchievementProgress>; unlocked: readonly Unlock[] } {
  const progress = new Map(progressById)
  const unlocked: Unlock[] = []

  for (const def of definitions) {
    const before = progressById.get(def.id) ?? emptyProgress(def.id)
    const result = evaluate(def, before, event)
    if (result.progress !== before) progress.set(def.id, result.progress)
    unlocked.push(...result.unlocked)
  }

  return { progress, unlocked }
}

/**
 * Replay a history of events — for backfilling an achievement that ships late.
 *
 * A user with a 200-day streak must never see a "7-day streak" achievement appear as
 * locked. Definitions marked `backfill: false` are skipped: nothing in the log records
 * that a lesson was finished in under sixty seconds two years ago, and inventing that
 * unlock is worse than granting it late.
 *
 * The unlocks come back in bulk so the caller can show one summary. Twelve consecutive
 * celebration animations is a bug, not a reward.
 */
export function backfill(
  definitions: readonly AchievementDef[],
  history: readonly DomainEvent[],
): { progress: Map<string, AchievementProgress>; unlocked: readonly Unlock[] } {
  const replayable = definitions.filter((def) => def.backfill !== false)

  let progress = new Map<string, AchievementProgress>()
  const unlocked: Unlock[] = []

  for (const event of history) {
    const result = evaluateAll(replayable, progress, event)
    progress = result.progress
    unlocked.push(...result.unlocked)
  }

  return { progress, unlocked }
}

/** 0–1 towards the next tier, for a progress bar. 1 when fully complete. */
export function tierProgress(
  def: AchievementDef,
  progress: AchievementProgress,
): { readonly next: Tier | null; readonly fraction: number } {
  const tiers = [...def.tiers].sort((a, b) => a.threshold - b.threshold)
  const currentRank = progress.tier === null ? -1 : tierRank(progress.tier)
  const next = tiers.find((spec) => tierRank(spec.tier) > currentRank)

  if (next === undefined) return { next: null, fraction: 1 }

  const floor = tiers.filter((s) => tierRank(s.tier) <= currentRank).at(-1)?.threshold ?? 0
  const span = next.threshold - floor
  if (span <= 0) return { next: next.tier, fraction: 1 }

  const fraction = (progress.value - floor) / span
  return { next: next.tier, fraction: Math.max(0, Math.min(1, fraction)) }
}
