/**
 * The two flags that stage the quest ceremony, and the one place their keys live.
 *
 * ## Why these two changes are flagged and the rest of the redesign is not
 *
 * A flag earns its place when the change is (a) risky in a way only real users can
 * reveal and (b) reversible without shipping a binary. Most of the August 2026 redesign
 * is neither: moving Shop into the tab bar is a file-based routing decision and an
 * information-architecture choice, not something you would A/B, and a currency chip in a
 * header cannot fail in a way a kill switch would help with.
 *
 * These two can. Both insert a SCREEN into the core loop:
 *
 * · `QUEST_COVER` — Home's quest button now opens a cover page instead of the lesson.
 *   That is one extra tap between a user and the thing the whole product is for, and the
 *   only honest way to find out whether it costs completions is to ship it to a slice.
 * · `QUEST_CELEBRATION` — a screen after the lesson summary. Same shape of risk at the
 *   other end: it lands when somebody has just finished and might be about to leave.
 *
 * Two keys rather than one, because the diagnosis matters. Shipped as a single flag, a
 * drop in daily-quest completion would say "the ceremony hurt" and not which half.
 *
 * ## What "off" means
 *
 * Exactly the behaviour before this branch: Continue goes straight to the runner, and
 * the summary's exit goes home. Neither screen is deleted or unreachable — `/quest` and
 * `/quest-complete` still resolve if something links to them — because a flag gates a
 * PATH, never the existence of a route (`featureFlags.ts`).
 *
 * ## The default is closed, and that is the point
 *
 * `useFeatureFlag` returns false for a flag it has never fetched, so a first launch with
 * no network gets the old path. A rollout ladder that starts at 5 % and defaults to
 * "everyone" when it cannot reach the server is not a 5 % rollout.
 */

import { useFeatureFlag } from '../../lib/featureFlags.js'

/**
 * Keys, as the rows in `public.feature_flags` spell them.
 *
 * Named here rather than typed at each call site for the reason every id in this repo
 * is: a flag key is a string that exists in a database, so a typo is not a compile
 * error — it is a flag that reads false for ever and a feature nobody can turn on.
 */
export const QUEST_COVER = 'quest_cover_page'
export const QUEST_CELEBRATION = 'quest_completion_screen'

/** Whether the quest's cover page stands between Home and the lesson. */
export const useQuestCover = (): boolean => useFeatureFlag(QUEST_COVER)

/** Whether finishing the quest gets its own screen after the lesson summary. */
export const useQuestCelebration = (): boolean => useFeatureFlag(QUEST_CELEBRATION)
