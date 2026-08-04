/**
 * Every number, date and list the user sees goes through here.
 *
 * `Intl` or nothing. Manual formatting is how "125,800,000" reaches a Swedish user
 * who expects "125 800 000", and how a sorted list of countries puts Åland before
 * Zimbabwe — å, ä and ö sort AFTER z in Swedish, and a raw `.sort()` does not know
 * that. These are not edge cases; they are the majority of the world.
 *
 * Spec: docs/engineering/localization.md §3.5, §8
 */

export type Locale = 'en' | 'sv'

/** 125800000 → "125,800,000" (en) · "125 800 000" (sv) */
export const formatNumber = (
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string => new Intl.NumberFormat(locale, options).format(value)

/**
 * Compact form for stat chips, where a five-digit XP total would break the layout.
 * 12850 → "12.9K" (en) · "12,9 tn" (sv)
 */
export const formatCompact = (value: number, locale: Locale): string =>
  new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)

/** 0.842 → "84%" — accuracy, mastery, league percentile. */
export const formatPercent = (fraction: number, locale: Locale): string =>
  new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(fraction)

export const formatDate = (
  date: Date | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string => new Intl.DateTimeFormat(locale, options).format(date)

/** ['Japan','Korea','China'] → "Japan, Korea and China" · "Japan, Korea och Kina" */
export const formatList = (items: readonly string[], locale: Locale): string =>
  new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items)

/** -3, 'day' → "3 days ago" · "för 3 dagar sedan" */
export const formatRelative = (
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale: Locale,
): string => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit)

/**
 * The comparator for any user-visible list of names.
 *
 * Never `[...names].sort()`. In Swedish that puts Ängelholm between Andorra and
 * Argentina, which looks like a bug to every Swedish speaker and like nothing at all
 * to everyone else.
 */
export const collator = (locale: Locale): Intl.Collator =>
  new Intl.Collator(locale, { sensitivity: 'base', numeric: true })

/** hh:mm:ss for countdowns. Not `Intl` — this is a duration, not a time of day. */
export function formatDuration(ms: number, locale: Locale): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const parts = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
  // Tabular numerals are applied by the component; zero-padding is applied here so
  // the string width does not jitter as the countdown ticks.
  return parts
    .map((n) => new Intl.NumberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false }).format(n))
    .join(':')
}
