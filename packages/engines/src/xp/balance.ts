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
    /** Re-answering an already-mastered fact the same day. */
    repeatMasteredSameDay: 2,
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
    achievementByTier: { bronze: 10, silver: 25, gold: 50, platinum: 100, legendary: 200 },
    leaguePodium: { 1: 300, 2: 200, 3: 100 },
  },

  /** Prices. Target: a meaningful cosmetic is 4–7 days of saving. */
  prices: {
    heartRefill: 250,
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
    regenMinutes: 45,
    /** Child accounts regenerate twice as fast. */
    childRegenMinutes: 22,
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

/** Inverse of xpForLevel. */
export function levelForXp(totalXp: number): number {
  let level = 1
  while (xpForLevel(level + 1) <= totalXp) level++
  return level
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

/** Current hearts, computed from the last update rather than stored ticking. */
export function heartsNow(
  stored: number,
  lastUpdatedAt: number,
  now: number,
  isChild: boolean,
): number {
  if (stored >= BALANCE.hearts.max) return BALANCE.hearts.max
  const minutes = isChild
    ? BALANCE.hearts.childRegenMinutes
    : BALANCE.hearts.regenMinutes
  const regenerated = Math.floor((now - lastUpdatedAt) / (minutes * 60_000))
  return Math.min(BALANCE.hearts.max, stored + Math.max(0, regenerated))
}
