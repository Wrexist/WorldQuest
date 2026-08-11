/**
 * Self-assessed starting level, and the authored difficulty band each one asks for.
 *
 * `Fact.difficulty` is a 1-5 prior about how hard a thing is to know in general — see
 * `docs/systems/question-difficulty.md`. Filtering on it is exactly what somebody
 * choosing "just starting" is asking for, and the bands overlap on purpose: a hard edge
 * at 3 would make the middle option a different app from the easy one rather than a
 * wider version of it.
 *
 * The band applies to the FIRST lessons only. FSRS infers a per-learner difficulty from
 * real answers within a session or two and that number is better than any self-report,
 * which is what `onboarding:level.body` promises out loud.
 *
 * ## Why this is not in `OnboardingScreen.tsx`
 *
 * It was, and `app/lesson.tsx` imported it from there — which put the string
 * `OnboardingScreen` in a route file, and `scripts/five-states.ts` decides which routes
 * mount a screen by matching that screen's NAME against the route's source. The lesson
 * route therefore counted as mounting onboarding, and onboarding's `empty` state was
 * satisfied by the lesson route's `questions.length === 0`. A gate passing for a reason
 * that has nothing to do with what it checks is worse than a gate that fails.
 *
 * The general shape is worth keeping in mind: anything a route needs from a feature
 * belongs beside the screen, not inside it.
 */
export const LEVELS = {
  new: { min: 1, max: 3 },
  some: { min: 1, max: 4 },
  confident: { min: 3, max: 5 },
} as const

export type LevelChoice = keyof typeof LEVELS
