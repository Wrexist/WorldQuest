/**
 * What the user has earned but the server has not confirmed yet.
 *
 * ## The bug
 *
 * XP, coins and streaks are the server's to decide (ADR 0006), and Home, Profile and
 * Streak read them from the server and nowhere else. Lessons, meanwhile, are queued
 * locally and replayed when the connection returns — which is the whole point of the
 * sync queue.
 *
 * Put those two together and finishing a lesson on a plane earns you nothing you can
 * see. XP stays where it was, Profile says "Nothing to show yet", and Streak says "No
 * days yet" to somebody who has just done a lesson. The work is safe — it is in the
 * queue, it survives the app being killed — and the app shows no sign that it happened.
 * For a learning app that is the worst-feeling class of bug there is, and it is the one
 * `hasUnsyncedProgress`'s own comment names: "I lost my progress".
 *
 * ## What the rule actually says
 *
 * > The server is authoritative for XP, coins, streaks, hearts, leagues and
 * > entitlements. **The client may render optimistically; it may never decide.**
 *
 * So this is not a loosening of the rule — it is the half of the rule that was never
 * built. `reconcile()` below has always existed to correct an optimistic prediction
 * against the server's truth, and nothing ever produced a prediction for it to correct.
 *
 * ## Why the prediction is trustworthy
 *
 * It is not a guess. `awardForAnswer` and `gradeLesson` are the same functions the edge
 * function runs, and the lesson runner already computes a full `GradeResult` at the
 * moment a lesson ends — that is where the summary screen's "+14 XP" comes from. The
 * number is already on screen; it simply was not carried anywhere afterwards.
 *
 * When the server disagrees, the server wins, silently under 50 XP and audibly above it.
 * That is `reconcile`, unchanged.
 *
 * ## Settling, and the flicker it prevents
 *
 * An award stops counting when the server's totals have caught up with it — which is NOT
 * the moment the mutation is acknowledged. Between the server accepting a lesson and the
 * progress query refetching, dropping the prediction immediately would show the old
 * total, then jump. So an award carries `deliveredAt`, and it keeps counting until the
 * authoritative figures were fetched after that instant.
 *
 * Pure, like everything here: every clock reading is an argument.
 */

export type PredictedAward = {
  /** The server's idempotency key, so an award and its queued mutation are the same row. */
  readonly lessonId: string
  readonly xp: number
  readonly coins: number
  /**
   * The user's own local day, `YYYY-MM-DD`, stamped when the lesson ended.
   *
   * Stored rather than derived from a timestamp because deriving it needs a timezone,
   * and this package has no clock and no locale. It is also the more correct value: a
   * lesson finished at 23:58 belongs to the day the user was living in, not to whatever
   * day it is by the time something asks.
   */
  readonly localDay: string
  /** When the server accepted it, or null while it is still queued. */
  readonly deliveredAt: number | null
}

export type AuthoritativeProgress = {
  readonly xpTotal: number
  readonly coins: number
  readonly streak: number
  /** `YYYY-MM-DD` of the last day the server counted, or null for a user with no history. */
  readonly lastActiveDate: string | null
}

export type OptimisticProgress = {
  readonly xpTotal: number
  /**
   * The SPENDABLE balance — the server's, with nothing added.
   *
   * XP and a streak are records of what happened; coins are a wallet, and the two want
   * opposite treatment. Predicting a coin balance upward means offering a purchase the
   * server is about to refuse, because the coins the client is counting have not been
   * credited yet: the user taps Buy on an item they can "afford" and is told no. That is
   * a worse failure than a balance that lags, and it is the one place where rendering
   * optimistically edges into deciding.
   *
   * So this stays authoritative and `coinsIncludingPending` carries the prediction for
   * anywhere that is reporting rather than offering. Both are named, so a caller has to
   * choose rather than get one by accident.
   */
  readonly coins: number
  /** What the balance will be once the queue drains. Never the basis for a purchase. */
  readonly coinsIncludingPending: number
  readonly streak: number
  /**
   * The last day that counts, INCLUDING a lesson the server has not seen.
   *
   * Shipped alongside `streak` because the number on its own is not enough: the streak
   * screen feeds `currentStreak(state, now, timeZone)`, which re-derives whether a run is
   * still alive from this date and returns 0 when it is null. So handing that screen an
   * optimistic `current` and the server's stale date zeroed it straight back out, and
   * Profile said "1 day streak" while Streak said "No days yet" — the two screens
   * disagreeing, which is worse than both lagging.
   *
   * A date rather than a flag, because that is what every consumer of a streak already
   * takes, and because it stays right when the queued lesson is from yesterday.
   */
  readonly lastActiveDate: string | null
  /** The part of each figure that is still a prediction. Zero once everything has landed. */
  readonly pendingXp: number
  readonly pendingCoins: number
  /** How many finished lessons the server has not confirmed. Drives the "syncing" note. */
  readonly pendingLessons: number
  /** True when any figure above is higher than the server's own. */
  readonly isOptimistic: boolean
}

/**
 * Awards the server's numbers do not yet include.
 *
 * Module-private, unlike its opposite: nothing outside needs the LIST of what is still
 * in flight — `optimisticProgress` already reports the count and the sums — and an
 * export no screen can reach is what `pnpm reachability` exists to refuse.
 *
 * `progressFetchedAt` is when the authoritative figures were last read. An award
 * delivered before that read is already inside them; one delivered after it — or not
 * delivered at all — is not.
 */
function unsettledAwards(
  awards: readonly PredictedAward[],
  progressFetchedAt: number,
): readonly PredictedAward[] {
  return awards.filter((a) => a.deliveredAt === null || a.deliveredAt > progressFetchedAt)
}

/**
 * The server's figures plus what is still in flight.
 *
 * `progressFetchedAt` of 0 means the authoritative numbers have never arrived — a first
 * launch, or an offline start with an empty cache. Everything is unsettled then, which
 * is the correct reading: a user who has only ever been offline should see the work they
 * have done, on top of zero.
 */
export function optimisticProgress(input: {
  readonly authoritative: AuthoritativeProgress
  readonly awards: readonly PredictedAward[]
  readonly progressFetchedAt: number
  /** The user's local day, for deciding whether today is already counted in the streak. */
  readonly today: string
}): OptimisticProgress {
  const unsettled = unsettledAwards(input.awards, input.progressFetchedAt)

  const pendingXp = unsettled.reduce((sum, a) => sum + a.xp, 0)
  const pendingCoins = unsettled.reduce((sum, a) => sum + a.coins, 0)

  /**
   * The streak is a day count, not a sum — so it moves by at most one, and only when
   * today is not already counted.
   *
   * Derived rather than predicted: the server's rule is "a day with a completed lesson
   * extends the streak", `lastActiveDate` says which day it last counted, and an
   * unsettled award stamped with today says there is one it has not seen. Two lessons
   * today still add one day; a lesson today when the server already counted today adds
   * nothing.
   *
   * Deliberately does NOT try to work out whether a streak has lapsed. A gap between
   * `lastActiveDate` and today means the server may have broken the streak, reduced it,
   * or covered it with a freeze — three different outcomes this cannot tell apart, and
   * guessing would mean showing a number that then falls. Predicting only the increment
   * keeps the error one-directional and small: the worst case is a streak that is
   * briefly one too high for a user whose streak the server was about to reset anyway.
   */
  const countsToday = unsettled.some((a) => a.localDay === input.today)
  const alreadyCounted = input.authoritative.lastActiveDate === input.today
  const streak = input.authoritative.streak + (countsToday && !alreadyCounted ? 1 : 0)

  return {
    xpTotal: input.authoritative.xpTotal + pendingXp,
    // Authoritative on purpose — see the note on the field.
    coins: input.authoritative.coins,
    coinsIncludingPending: input.authoritative.coins + pendingCoins,
    streak,
    // Today wins when there is a lesson for it, because today is by definition the
    // latest date either side could name. Otherwise the server's, untouched — including
    // when the only queued lesson is from an earlier day, which the server will credit
    // to that day and not to this one.
    lastActiveDate: countsToday ? input.today : input.authoritative.lastActiveDate,
    pendingXp,
    pendingCoins,
    pendingLessons: unsettled.length,
    isOptimistic: unsettled.length > 0,
  }
}

/**
 * Awards that can be forgotten.
 *
 * The inverse of `unsettledAwards`, and separate from it because dropping a row is a
 * write and this package does not do writes — the caller prunes, this decides what is
 * prunable. Anything the server has both accepted and reported back is history.
 */
export function settledAwards(
  awards: readonly PredictedAward[],
  progressFetchedAt: number,
): readonly PredictedAward[] {
  return awards.filter((a) => a.deliveredAt !== null && a.deliveredAt <= progressFetchedAt)
}
