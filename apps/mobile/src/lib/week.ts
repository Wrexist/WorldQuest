/**
 * Which day a week starts on, for the user: Sunday in the United States, Monday in
 * Sweden, and so on.
 *
 * Read from the phone once at startup, by `useDeviceLocale` in `lib/locale.ts`, which is
 * the one module allowed to reach `expo-localization`. It is kept here as plain data so
 * a screen that draws a calendar never imports a native module and still mounts under
 * Node. That is the rule `locale.ts` exists to keep.
 *
 * Numbered as `expo-localization` numbers it: 1 is Sunday and 7 is Saturday. It is
 * Monday until the phone says otherwise. That is ISO 8601's week and Sweden's, and a
 * browser without `Intl.Locale#weekInfo` answers nothing at all.
 */

let first = 2

/** The first day of the user's week, 1 (Sunday) to 7 (Saturday). */
export function firstWeekday(): number {
  return first
}

/** Ignores anything that is not a day, so an unanswered question keeps the default. */
export function setFirstWeekday(day: number | null | undefined): void {
  if (typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 7) first = day
}
