/**
 * Streak freezes and repair — the two ways a run survives a bad day.
 *
 * `applyActivity` in this module's sibling already spends a held freeze automatically.
 * This file owns the rest: acquiring freezes, and buying a broken streak back inside a
 * short window.
 *
 * ## Why repair exists at all
 *
 * A streak is the strongest retention mechanic this product has and also its cruellest
 * failure mode: 200 days destroyed by one flight, one illness, one flat battery. The
 * users who lose a long streak that way are disproportionately the ones who never come
 * back — the loss reads as "all of that was for nothing".
 *
 * ## Why it is deliberately limited
 *
 * Unlimited repair makes the streak meaningless, and a repair the user can be
 * *pressured* into is a dark pattern aimed at exactly the moment they feel worst.
 * So: a 48-hour window, a fixed coin price from the balance table, and once every
 * 30 days. Outside those, the streak is gone and we say so plainly.
 *
 * The prices are NOT defined here. They live in `xp/balance.ts`, which is the single
 * source of truth for every number a user can feel — a second copy is a second number
 * to forget to change.
 *
 * Spec: docs/systems/xp-economy.md · docs/systems/progression.md
 */

import { BALANCE } from '../xp/balance.js'
import { daysBetween, localDate, type IsoDate, type StreakState } from './index.js'

/** Holding more than a couple turns "protected" into "immune". */
export const MAX_FREEZES = 2

/** How long after a break a streak can still be bought back. */
export const REPAIR_WINDOW_HOURS = 48

/** A repair every 30 days at most. Any more and the streak stops meaning anything. */
export const REPAIR_COOLDOWN_DAYS = 30

export const FREEZE_PRICE = BALANCE.prices.streakFreeze
export const REPAIR_PRICE = BALANCE.prices.streakRepair

export type RecoveryState = StreakState & {
  /** The local date the streak broke, or null if it is intact. */
  readonly brokenOn: IsoDate | null
  /** Epoch ms of the last repair, for the cooldown. */
  readonly lastRepairAt: number | null
}

// ── freezes ─────────────────────────────────────────────────────────────────

export type GrantResult = {
  readonly freezesHeld: number
  /** False when the user was already at the cap — the caller must not charge them. */
  readonly granted: boolean
}

/**
 * Add a freeze, up to the cap.
 *
 * Returns `granted: false` rather than throwing, because the common caller is a
 * purchase flow: taking the coins and silently discarding the freeze is the worst
 * possible outcome, and an exception at that point is a crash mid-transaction.
 */
export function grantFreeze(state: Pick<StreakState, 'freezesHeld'>): GrantResult {
  if (state.freezesHeld >= MAX_FREEZES) {
    return { freezesHeld: state.freezesHeld, granted: false }
  }
  return { freezesHeld: state.freezesHeld + 1, granted: true }
}

// ── repair ──────────────────────────────────────────────────────────────────

export type RepairAvailability =
  | { readonly available: true; readonly price: number; readonly expiresAt: number }
  | {
      readonly available: false
      readonly reason: 'not-broken' | 'window-expired' | 'cooldown' | 'nothing-to-restore'
    }

/**
 * Whether a broken streak can be bought back right now.
 *
 * Every rejection carries a reason, because the UI has to say WHICH — "you can repair
 * this again in 12 days" and "the window closed yesterday" are different messages, and
 * a generic "not available" invites the user to keep tapping.
 */
export function repairAvailability(
  state: RecoveryState,
  now: number,
  timeZone: string,
): RepairAvailability {
  if (state.brokenOn === null) return { available: false, reason: 'not-broken' }

  // Nothing to sell back. Charging 600 coins to restore a one-day streak would be
  // taking money for a rounding error.
  if (state.current <= 1 && state.longest <= 1) {
    return { available: false, reason: 'nothing-to-restore' }
  }

  const brokenAtMs = Date.parse(`${state.brokenOn}T00:00:00Z`)
  const expiresAt = brokenAtMs + REPAIR_WINDOW_HOURS * 3_600_000
  if (now > expiresAt) return { available: false, reason: 'window-expired' }

  if (state.lastRepairAt !== null) {
    const since = daysBetween(localDate(state.lastRepairAt, timeZone), localDate(now, timeZone))
    if (since < REPAIR_COOLDOWN_DAYS) return { available: false, reason: 'cooldown' }
  }

  return { available: true, price: REPAIR_PRICE, expiresAt }
}

export type RepairFailure =
  | 'not-broken'
  | 'window-expired'
  | 'cooldown'
  | 'nothing-to-restore'
  | 'insufficient-coins'

export type RepairResult =
  | { readonly ok: true; readonly state: RecoveryState; readonly coinsSpent: number }
  | { readonly ok: false; readonly reason: RepairFailure }

/**
 * Restore a broken streak.
 *
 * Takes the length to restore explicitly rather than reading it from `current`:
 * `applyActivity` has already reset `current` to 1 by the time anyone can tap
 * "repair", so the pre-break length has to be carried in. Getting this wrong restores
 * a 200-day streak as a 1-day streak and charges for the privilege.
 *
 * This is a `Result`, not a throw — a failed repair is an expected outcome (the window
 * closed while the user was deciding), and the caller must be able to refund.
 */
export function repair(
  state: RecoveryState,
  restoreTo: number,
  coinBalance: number,
  now: number,
  timeZone: string,
): RepairResult {
  const availability = repairAvailability(state, now, timeZone)
  if (!availability.available) return { ok: false, reason: availability.reason }
  if (coinBalance < availability.price) return { ok: false, reason: 'insufficient-coins' }

  return {
    ok: true,
    coinsSpent: availability.price,
    state: {
      ...state,
      current: restoreTo,
      longest: Math.max(restoreTo, state.longest),
      // Today counts as active: the user has just paid to be considered present, and
      // making them also complete a lesson to keep the streak they just bought is the
      // kind of small betrayal that gets remembered.
      lastActiveDate: localDate(now, timeZone),
      brokenOn: null,
      lastRepairAt: now,
    },
  }
}

/**
 * Record that a streak broke, so the repair window can start.
 *
 * Called with the outcome of `applyActivity` when it reports `reset`. Separate from
 * `applyActivity` because that function is about a day's activity, and a break is
 * about the absence of one.
 */
export function markBroken(
  state: RecoveryState,
  brokenOn: IsoDate,
  previousLength: number,
): RecoveryState & { readonly restorableLength: number } {
  return {
    ...state,
    brokenOn,
    // Carried out so the caller can persist it — `current` has already been reset.
    restorableLength: previousLength,
  }
}
