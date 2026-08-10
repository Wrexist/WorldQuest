/**
 * What day it is, for the user.
 *
 * One function, in `lib` rather than in a feature, because four places now need to agree
 * on where a day ends: the activity log that draws Profile's week chart, the daily goal
 * that decides today's target, the optimistic award that decides whether work done
 * offline counts towards today's streak, and the lesson runner that stamps a completion.
 *
 * It lived in `features/profile/useWeekActivity.ts` and the other three imported it from
 * there, which put the definition of "today" inside the feature that happens to draw a
 * chart of it. That is the wrong owner: the streak is not a property of the profile
 * screen, and the next thing to need a day key would have imported it from there too.
 */

/**
 * `YYYY-MM-DD` in the user's OWN day, not in UTC.
 *
 * It was `at.toISOString().slice(0, 10)`, and `toISOString` converts to UTC first — so
 * for everyone west of Greenwich the log's day boundary sat in the middle of their
 * afternoon. In California a lesson finished at 5pm was recorded against tomorrow: the
 * daily-goal line on Home reset while the user was still using the app, and Profile's
 * week chart put Monday evening's work on Tuesday's bar. `useWeekActivity` made it
 * visible by mixing the two — it walks back seven days with `setDate`, which is local,
 * and then formatted each one through this, which was not.
 *
 * Built from the local getters rather than `toLocaleDateString`, which needs a locale
 * whose calendar is Gregorian and whose digits are ASCII to produce this shape at all.
 *
 * Existing logs are not migrated. The values are the same shape and this is an activity
 * chart rather than a ledger, so the worst case is one historical bar sitting a day off
 * for a user who has already been counted wrong all along.
 */
export const localDay = (at: Date): string =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
