/**
 * How hard a learner's next lesson may be: the level they chose at onboarding, widened as
 * they learn — by what they have practised AND by the XP they have earned.
 *
 * ## Three dials
 *
 * - **The band** — which authored `Fact.difficulty` values (1–5) a lesson may introduce.
 *   The starting level sets it; each stage of experience raises its ceiling by one, so
 *   "just starting" meets Chad's capital eventually rather than never.
 * - **`introduceFrom`** — where NEW facts start. Unseen facts are offered easiest-first, which
 *   is right on day one and wrong on day sixty: a learner who has earned thousands of XP and
 *   has never met "Which ocean does Peru touch?" should not be fed Andorra's flag again
 *   first. The easier facts are offered after the harder ones, never dropped, so nothing
 *   starves and a gap in what somebody knows is still filled.
 * - **`maxModifier`** — the hardest way of asking to prefer (`Template.difficultyModifier`,
 *   0–2). "What is the capital of Kenya?" comes before "Nairobi is the capital of which
 *   country?", and calling codes asked backwards come last. An ORDERING in
 *   `itemsForFact`, never a filter: a fact whose only presentation is harder is still
 *   asked, just after the easier ones (the parity rule that function documents).
 *
 * ## Only the ceiling moves
 *
 * The floor stays where the level put it. The band also filters due reviews
 * (`focusFilter` applies to every candidate), and raising the floor would quietly stop
 * the easy facts a learner has already met from ever coming back — the opposite of
 * spaced repetition.
 *
 * ## Experience, not time
 *
 * Stages count facts actually practised and XP actually earned, never days: a learner who
 * plays once a week climbs at their own pace, and nobody is pushed harder for having
 * installed the app a month ago. Whichever of the two is further along sets the stage —
 * XP because it is what the learner sees and what the league counts, facts practised
 * because a learner who answers a hundred questions about the same forty countries has
 * earned a lot of XP and learned forty countries. Accuracy nudges by one stage either way — a learner answering nearly
 * everything right is ready sooner, one who is struggling gets a stage of breathing room
 * — and never more, so one bad lesson cannot undo a month. Kind by construction: the
 * ramp only ever changes what is offered next, never what was earned.
 *
 * Pure: no clock, no randomness, no storage. The host counts, this decides.
 */

import type { MemoryState } from './types.js'

/** The three answers to "how well do you know the world?" and the band each starts at. */
export const START_LEVELS = {
  new: { min: 1, max: 3 },
  some: { min: 1, max: 4 },
  confident: { min: 3, max: 5 },
} as const

export type StartLevel = keyof typeof START_LEVELS

/** What the ramp reads about a learner. */
export type Experience = {
  /** Facts practised at least once and not suspended. */
  readonly practised: number
  /** Share of all reviews answered right, 0–1; null before the first review. */
  readonly accuracy: number | null
  /**
   * Total XP earned, from the account. Optional because a host that cannot read it (a legacy
   * build, a first launch with no cache) must still get a ramp, and the ramp it gets is the
   * one facts practised alone would give.
   */
  readonly xp?: number
}

/** Facts practised at which each stage begins. Stage 0 is everyone's first lessons. */
const RAMP_STAGES = [0, 15, 40, 80, 140, 220] as const

/**
 * Total XP at which each stage begins.
 *
 * Read against `docs/systems/xp-economy.md`: a lesson is worth roughly 30–60 XP, and a
 * learner at about 300 XP a day meets stage 1 on the first day, stage 2 in three, stage 3
 * in a week, stage 4 in two and stage 5 in a month. Authored, like every threshold here,
 * and the first thing to tune against `review_log` once it has users.
 */
const XP_STAGES = [0, 300, 900, 2_000, 4_500, 9_000] as const

/** The ceiling of the band and the hardest presentation to prefer, per level per stage. */
const PLAN: Record<
  StartLevel,
  { readonly max: readonly number[]; readonly modifier: readonly number[]; readonly introduce: readonly number[] }
> = {
  new: { max: [3, 3, 4, 4, 5, 5], modifier: [0, 1, 1, 2, 2, 2], introduce: [1, 1, 1, 2, 2, 3] },
  some: { max: [4, 4, 5, 5, 5, 5], modifier: [1, 1, 2, 2, 2, 2], introduce: [1, 1, 2, 2, 3, 3] },
  confident: { max: [5, 5, 5, 5, 5, 5], modifier: [1, 2, 2, 2, 2, 2], introduce: [3, 3, 3, 4, 4, 4] },
}

/** Accuracy at or above which the learner moves a stage early, and at or below which one late. */
const RAMP_AHEAD = 0.9
const RAMP_BEHIND = 0.6
/** Accuracy is not read before this many reviews: three lucky answers are not a trend. */
const RAMP_MIN_REVIEWS = 20

export type Ramp = {
  readonly stage: number
  readonly band: { readonly min: number; readonly max: number }
  readonly maxModifier: number
  /** Prefer introducing NEW facts of at least this authored difficulty; always inside the band. */
  readonly introduceFrom: number
}

/** Summarise memory for the ramp. Suspended facts (leeches) are not experience. */
export function experienceFrom(memory: readonly MemoryState[]): Experience & { readonly reviews: number } {
  let practised = 0
  let reviews = 0
  let lapses = 0
  for (const m of memory) {
    if (m.suspended || m.reps <= 0) continue
    practised += 1
    reviews += m.reps
    lapses += Math.min(m.lapses, m.reps)
  }
  return { practised, reviews, accuracy: reviews === 0 ? null : 1 - lapses / reviews }
}

export function difficultyRamp(level: StartLevel, experience: Experience & { readonly reviews?: number }): Ramp {
  const plan = PLAN[level]
  const practised = Math.max(0, Number.isFinite(experience.practised) ? experience.practised : 0)
  const xp = Math.max(0, Number.isFinite(experience.xp) ? experience.xp! : 0)
  let stage = 0
  for (const [i, threshold] of RAMP_STAGES.entries()) if (practised >= threshold) stage = i
  for (const [i, threshold] of XP_STAGES.entries()) if (xp >= threshold) stage = Math.max(stage, i)

  const trusted = experience.accuracy !== null && (experience.reviews ?? RAMP_MIN_REVIEWS) >= RAMP_MIN_REVIEWS
  if (trusted && experience.accuracy! >= RAMP_AHEAD) stage += 1
  if (trusted && experience.accuracy! <= RAMP_BEHIND) stage -= 1
  stage = Math.max(0, Math.min(RAMP_STAGES.length - 1, stage))

  const { min } = START_LEVELS[level]
  const max = Math.max(min, plan.max[stage]!)
  return {
    stage,
    band: { min, max },
    maxModifier: plan.modifier[stage]!,
    introduceFrom: Math.min(max, Math.max(min, plan.introduce[stage]!)),
  }
}
