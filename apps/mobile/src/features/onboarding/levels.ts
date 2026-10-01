/**
 * Self-assessed starting level, and the authored difficulty band each one asks for.
 *
 * `Fact.difficulty` is a 1-5 prior about how hard a thing is to know in general — see
 * `docs/systems/question-difficulty.md`. Filtering on it is exactly what somebody
 * choosing "just starting" is asking for, and the bands overlap on purpose: a hard edge
 * at 3 would make the middle option a different app from the easy one rather than a
 * wider version of it.
 *
 * The band is where free practice STARTS: `useDifficultyRamp` raises its ceiling as the
 * learner practises (see `difficultyRamp` in the engines), and FSRS infers a per-learner
 * difficulty from real answers within a session or two, which is better than any
 * self-report — what `onboarding:level.body` promises out loud.
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
import { START_LEVELS, type StartLevel } from '@worldquest/engines'

/**
 * Since September 2026 the bands live in the engines (`START_LEVELS`), beside the
 * `difficultyRamp` that widens them as a learner practises: the starting band is where a
 * learner begins, no longer where they stay. Re-exported under the old names so the
 * onboarding and settings code that reads them did not have to move.
 */
export const LEVELS = START_LEVELS

export type LevelChoice = StartLevel
