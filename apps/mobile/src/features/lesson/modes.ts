/**
 * Lesson modes — the knobs that change how a lesson runs, not what it contains.
 *
 * Its own module so the Quests screen can describe the speed round without importing
 * from the lesson SCREEN. A screen importing another screen is a dependency that
 * quietly turns two features into one, and it is the sort of edge nobody removes later.
 */

/**
 * Seconds per question in the speed round.
 *
 * Ten, not five. Five is a reflex test; ten is enough to read a four-option question
 * and still feel the clock — the difference between a mode that teaches under pressure
 * and one that only rewards people who already knew the answer.
 */
export const SPEED_SECONDS = 10
