/**
 * Which streak card Home shows, if any.
 *
 * Two, and never both: a freeze that has just done its job ("Your streak freeze kept
 * your 12 day streak"), or a broken streak that can still be brought back ("You can
 * bring back your 12 day streak"). Duolingo tells you both of these things; it also
 * counts the repair window down and calls a lost streak a loss. We tell you what
 * happened, and what you can do, and nothing else (rule 7).
 *
 * Pure: every clock reading and every stored dismissal is an argument, so each rule
 * below is a test rather than a hope.
 *
 * ## How a used freeze is detected, honestly
 *
 * The two backends spend a freeze at different moments, and each leaves a different
 * trace — so there are two signals, and each one is a fact rather than an inference:
 *
 * · **The D1 Worker** spends a held freeze with the NEXT lesson (`applyActivity`). Until
 *   then its state reads: last active two days ago, a freeze held, streak still alive.
 *   That is precisely the case `currentStreak` keeps alive only because of the freeze —
 *   yesterday is being covered, and the same rule the server uses says so.
 * · **The legacy backend** spends it in the hourly `expire_streaks` job, which moves
 *   `last_active_date` to the missed day and writes that day to `freeze_used_on`. The
 *   adapter reads the column; nothing is inferred from the dates.
 *
 * Either way the card is about YESTERDAY and appears the day after it, which is the
 * moment Duolingo tells you too. Once a lesson has been done today the D1 signal is gone
 * (the freeze is spent and today counts), and the card goes with it — the lesson's own
 * streak beat has just said the rest.
 *
 * ## The repair card names only a number the server stated
 *
 * `restoreTo` is the server's: what its repair would actually restore. A cache written
 * before the field existed has none, and then there is no card — "bring back your
 * 214-day streak" with the wrong number is a wrong price-per-day, and silence costs
 * nothing (the streak screen still offers the repair).
 *
 * It is also absent when the coins are not there. Home is not the place to advertise
 * something that cannot be bought; the streak screen states the gap once, plainly.
 */

import { daysBetween, repairAvailability, type IsoDate, type RecoveryState } from '@worldquest/engines'

export type StreakNotice =
  | { readonly kind: 'freeze'; readonly id: string; readonly streak: number }
  | { readonly kind: 'repair'; readonly id: string; readonly streak: number; readonly price: number }

export type StreakNoticeInput = {
  /** The streak as shown right now — the server's, plus a lesson it has not seen. */
  readonly streak: number
  /** The last day that counts, including a queued lesson (`useOptimisticProgress`). */
  readonly lastActiveDate: IsoDate | null
  readonly freezesHeld: number
  /** The missed day a freeze covered, where the backend records it (legacy only). */
  readonly freezeUsedOn?: IsoDate | null | undefined
  readonly brokenOn: IsoDate | null
  readonly lastRepairAt: number | null
  readonly longestStreak: number
  /** What a repair restores, as the server states it. Absent means unknown. */
  readonly restoreTo?: number | null | undefined
  /** The SPENDABLE balance — never a prediction, because the card points at a purchase. */
  readonly coins: number
  /** The learner's own day, `YYYY-MM-DD`. */
  readonly today: IsoDate
  readonly now: number
  readonly timeZone: string
  /** Cards the learner has dismissed, by id. A dismissed card never returns. */
  readonly dismissed: readonly string[]
}

const dayBefore = (day: IsoDate): IsoDate => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

export function streakNotice(input: StreakNoticeInput): StreakNotice | null {
  const notice = input.brokenOn === null ? freezeNotice(input) : repairNotice(input)
  return notice !== null && input.dismissed.includes(notice.id) ? null : notice
}

function freezeNotice(input: StreakNoticeInput): StreakNotice | null {
  if (input.streak <= 0) return null
  const yesterday = dayBefore(input.today)
  const recorded = input.freezeUsedOn === yesterday
  const covering =
    input.lastActiveDate !== null &&
    daysBetween(input.lastActiveDate, input.today) === 2 &&
    input.freezesHeld > 0
  if (!recorded && !covering) return null
  // Keyed by the day that was covered, so each freeze gets its own card, once.
  return { kind: 'freeze', id: `freeze:${yesterday}`, streak: input.streak }
}

function repairNotice(input: StreakNoticeInput): StreakNotice | null {
  const length = input.restoreTo
  // A repair of a one-day streak is not offered anywhere (`nothing-to-restore`).
  if (length === undefined || length === null || length < 2 || input.brokenOn === null) return null
  const state: RecoveryState = {
    current: input.streak,
    longest: input.longestStreak,
    lastActiveDate: input.lastActiveDate,
    freezesHeld: input.freezesHeld,
    brokenOn: input.brokenOn,
    lastRepairAt: input.lastRepairAt,
  }
  // The window and the cooldown are the engine's, exactly as the streak screen reads them.
  const offer = repairAvailability(state, input.now, input.timeZone)
  if (!offer.available || input.coins < offer.price) return null
  // Keyed by the break, so dismissing it is dismissing this one and not the next.
  return { kind: 'repair', id: 'repair:' + input.brokenOn, streak: length, price: offer.price }
}
