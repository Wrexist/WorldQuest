/**
 * The economy balance table — the single source of truth for every reward number.
 *
 * The mobile app AND the `submit-lesson` edge function import this same module, so
 * the client's optimistic prediction and the server's authoritative award cannot
 * drift. A literal reward value anywhere else is a CI failure.
 *
 * Changing any number here requires running `/wq-balance-check` and putting the
 * before/after simulation in the PR. Economy bugs are discovered by users, loudly,
 * and are near-impossible to walk back once people have balances.
 *
 * Spec:     docs/systems/xp-economy.md
 * Decision: docs/adr/0011-xp-and-coins-split.md
 */

export const BALANCE = {
  /**
   * XP is a permanent progression score. It is never spent, and no entry in
   * `xp_ledger` is ever negative. Levels and leagues depend on that invariant.
   */
  xp: {
    correctAnswer: 10,
    /** Rewards coming back to an overdue review rather than grinding fresh items. */
    overdueReviewBonus: 2,
    perfectLesson: 15,
    lessonComplete: 5,
    /**
     * Per completed quest slot. Specified in quests-and-liveops.md §1 ("five
     * challenges, 10 XP each") but previously absent from this table, so the quest
     * engine had nothing to read. Five slots × 10 + the 50 bonus = 100 XP a day at
     * full completion, which the simulation below is re-run against.
     */
    dailyQuestTask: 10,
    /** The bonus for completing all five. */
    dailyQuest: 50,
    dailyChallenge: 30,
    speedBonus: 2,
    speedBonusMaxPerLesson: 5,
    firstLessonOfDay: 10,
    /**
     * The only XP source that cannot be farmed by volume: it requires a fact to
     * survive across weeks. This is what makes XP track learning, not activity.
     */
    factMastered: 20,
    collectionComplete: 100,
    /** Paid only when the invitee completes 5 lessons across 3 days (anti-multi-account). */
    friendActivated: 100,
    streakMilestones: { 7: 50, 30: 200, 100: 500, 365: 1000 },
    /**
     * NOT PAID BY ANYTHING TODAY, and this note is here because the number reads as if
     * it were.
     *
     * An achievement unlocks, `queueUnlocks` holds it, and the lesson summary shows the
     * medal — but no XP and no coins move, because nothing evaluates achievements
     * server-side. `docs/systems/achievements.md §5` specifies exactly that ("in the same
     * edge function that grades a lesson"), and it does not exist: the client evaluates
     * from server-derived events and the client may not write a balance (ADR 0006).
     *
     * The honest options are to build the server evaluator or to delete these numbers,
     * and the first is the right one — an achievement is the only long-horizon reward in
     * the economy. It is a real piece of work: the server holds no achievement state, so
     * it means a progress table, the catalogue vendored into the bundle, and the
     * achievements screen reading the server's map rather than the device's. Half of it —
     * a client-claimed award endpoint — would be worse than nothing, because it would let
     * the client decide what it is paid.
     *
     * `engines:simulate` does not model this income, so the economy it validates is the
     * one that ships. That is why the gap is a stated debt rather than a live defect.
     */
    achievementByTier: { bronze: 25, silver: 50, gold: 100, platinum: 250, legendary: 500 },

    /**
     * Past this, XP earns at 25 % and we say so plainly. Anti-grind, on-brand.
     *
     * 3000 ≈ 60 minutes of play. Simulation showed 1500 throttling a 30-minute
     * user on 84 of 90 days — that is not a grinder, that is a committed learner,
     * and taxing them daily punishes exactly the behaviour we want.
     */
    dailySoftCap: 3000,
    softCapMultiplier: 0.25,
    /**
     * Re-answering an already-known fact that was NOT due.
     *
     * Renamed from `repeatMasteredSameDay`, because the name said "same day" and the
     * code meant "ever" — and a fact returning on schedule after three months was
     * therefore paid 2 XP instead of 10. That is the economy charging a premium for the
     * one behaviour a spaced-repetition product exists to produce. The penalty now
     * applies only when the scheduler did not ask for the review, which is the case it
     * was always described as covering.
     */
    repeatKnownNotDue: 2,
    /** Below this many items, no completion bonus. */
    minItemsForCompletionBonus: 5,
  },

  /**
   * Coins are the sink currency. Roughly a third of XP volume, so prices stay
   * legible to a ten-year-old.
   */
  coins: {
    correctAnswer: 5,
    perfectLesson: 10,
    dailyQuest: 25,
    dailyChallenge: 15,
    collectionComplete: 150,
    streakMilestones: { 7: 50, 30: 200, 100: 500 },
    /** Unpaid, for the reason written out beside `xp.achievementByTier` above. */
    achievementByTier: { bronze: 10, silver: 25, gold: 50, platinum: 100, legendary: 200 },
    leaguePodium: { 1: 300, 2: 200, 3: 100 },
  },

  /** Prices. Target: a meaningful cosmetic is 4–7 days of saving. */
  prices: {
    /**
     * Finishing the lesson you are already in, after running out of hearts.
     *
     * Named `heartRefill` until now, which described the mechanic this product does not
     * have: hearts reset per lesson, so there is no pool to refill and nothing a refill
     * would persist. `OutOfHearts` has always spent it on exactly one thing — carrying
     * on from the next question — and the name now says so.
     */
    continueLesson: 250,
    streakFreeze: 400,
    streakRepair: 600,
    avatarItem: { min: 300, max: 2000 },
    pet: { min: 1500, max: 5000 },
    mapSkin: 2000,
    theme: 1500,
    titleUnlock: 1000,
    celebration: 800,
    /** Gifting costs 10 % more than buying — cheapest virality we have. */
    giftSurchargePct: 10,
  },

  /**
   * Hearts create stakes without blocking learning. Practice and Review are always
   * free at zero hearts, forever — that is the line we do not cross, and the reason
   * Premium sells convenience rather than access.
   */
  hearts: {
    max: 5,
    /*
     * There is no regeneration clock, and there must not be one.
     *
     * `regenMinutes: 45` and `childRegenMinutes: 22` lived here beside
     * `resetPerLesson: true`, which are two designs for the same mechanic and only one
     * of them can be true. If hearts reset at the start of every lesson then a
     * regeneration rate describes nothing — there is no state to regenerate — and
     * `heartsNow()`, `wallets.hearts` and `wallets.hearts_updated_at` were all machinery
     * for a system this product had already decided against.
     *
     * The per-lesson design is the one with the argument behind it (see `resetPerLesson`
     * below), so the other one is gone rather than left as a second answer for the next
     * reader to find and believe.
     */
    /** A correct answer on a previously-failed review gives one back. */
    restoreOnRedemption: 1,
    /**
     * A run of correct answers inside a lesson restores a heart (capped at max).
     *
     * Without this, 5 hearts against a 15-item lesson at realistic accuracy ends
     * ~60 % of lessons early — the simulation measured it. That is the death
     * spiral that makes hearts the most-hated mechanic in this category. Earning
     * a heart back rewards recovery and keeps the stakes without the punishment.
     */
    restoreEveryCorrectStreak: 5,
    /**
     * New items never cost a heart. Only review items — things the user has seen
     * before — can.
     *
     * You cannot lose a life for not knowing something you have never been taught.
     * Beyond being unfair, the simulation showed the alternative punishes exactly
     * the wrong people: heart loss scales with error rate, so a struggling
     * ten-year-old at 75 % accuracy was blocked on 59 % of lessons while a
     * completionist at 92 % was blocked on 9 %. A mechanic that penalises the
     * users who most need to keep going is a mechanic aimed backwards.
     */
    newItemsCostHearts: false,
    /**
     * Hearts reset at the start of every lesson, not once a day.
     *
     * Carried across a session they compound: a casual learner doing three short
     * lessons back to back was blocked on 42 % of them, because five hearts cannot
     * survive three lessons at beginner accuracy. That is a day-long lockout in
     * everything but name, which is the mechanic our own principles forbid.
     *
     * Per-lesson keeps the stakes exactly where they belong — be careful *in this
     * lesson* — and guarantees the next lesson always starts fresh. The coin sink
     * moves from "refill hearts" to "continue this lesson now"; Premium still buys
     * never being interrupted.
     */
    resetPerLesson: true,
    premiumUnlimited: true,
    /** Off entirely in Relaxed Mode and Classroom Mode. */
    disabledInRelaxedMode: true,
  },

  /**
   * xpForLevel(n) = round(base · n^exponent) — cumulative XP to reach level n.
   * Uncapped, with a Title every 10 levels.
   *
   * Exponent 1.9 is chosen so that a ~300 XP/day user reaches L10 in about two
   * weeks, L38 in about five months, and L100 in about three years. A shallower
   * curve (1.55) puts level 100 inside the first year and leaves nothing to chase;
   * a steeper one (2.2) makes the first ten levels feel like work. Verified by
   * `pnpm engines:simulate`.
   */
  levels: {
    base: 50,
    exponent: 1.9,
  },

  /** Anti-cheat thresholds shared by client and server. */
  integrity: {
    minCredibleAnswerMs: 400,
    maxLessonSubmitsPerHour: 60,
    referralLessonsRequired: 5,
    referralDaysRequired: 3,
  },
} as const

export type Balance = typeof BALANCE

/** Cumulative XP required to reach a level. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  return Math.round(BALANCE.levels.base * Math.pow(level, BALANCE.levels.exponent))
}

/**
 * Inverse of xpForLevel.
 *
 * Analytic rather than a loop. `while (xpForLevel(level + 1) <= totalXp) level++` is
 * O(level) with a `Math.pow` per step, and it is called on every render that shows a
 * level — Home, Profile, the shop, the summary. It is fine at level 43 and it is a
 * spin at the top of the curve, which is uncapped by design.
 *
 * `xpForLevel` rounds, so the closed form can land one either side of the boundary.
 * The correction below fixes that in at most two steps, and `level.test.ts` asserts the
 * two agree across the whole range rather than trusting the algebra.
 */
export function levelForXp(totalXp: number): number {
  if (!Number.isFinite(totalXp) || totalXp < xpForLevel(2)) return 1

  const { base, exponent } = BALANCE.levels
  let level = Math.floor(Math.pow(totalXp / base, 1 / exponent))

  // Rounding in `xpForLevel` can put the estimate on the wrong side by one.
  //
  // Both loops step by one and both are guarded against the same thing: past roughly
  // 2^53, adding one to a double is a no-op, so `level + 1 === level` and the condition
  // can never change. The corrections then spin forever rather than converging. It takes
  // an absurd input to get there — `Number.MAX_VALUE` lands the estimate near 1.6e161 —
  // and "absurd input" is not the same as "cannot happen" when the consequence is a hung
  // render on every screen that shows a level. The estimate is already correct at that
  // magnitude; there is simply nothing left to correct by.
  while (level > 1 && xpForLevel(level) > totalXp) {
    const previous = level - 1
    if (previous === level) break
    level = previous
  }
  while (xpForLevel(level + 1) <= totalXp) {
    const next = level + 1
    if (next === level) break
    level = next
  }

  return Math.max(1, level)
}

/** Titles are the cheapest status reward that exists, and they're chased for months. */
export const TITLES: ReadonlyArray<{ level: number; key: string }> = [
  { level: 1, key: 'titles:wanderer' },
  { level: 10, key: 'titles:scout' },
  { level: 20, key: 'titles:navigator' },
  { level: 30, key: 'titles:cartographer' },
  { level: 40, key: 'titles:pathfinder' },
  { level: 50, key: 'titles:voyager' },
  { level: 60, key: 'titles:circumnavigator' },
  { level: 70, key: 'titles:trailblazer' },
  { level: 80, key: 'titles:globetrotter' },
  { level: 90, key: 'titles:worldkeeper' },
  { level: 100, key: 'titles:atlas' },
]

