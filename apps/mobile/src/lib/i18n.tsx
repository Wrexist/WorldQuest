/**
 * The app's binding to `@worldquest/i18n`.
 *
 * This file used to BE the i18n implementation — a hand-written ICU-ish parser that
 * carried Phase 1. It did the parts that are expensive to retrofit (every string a
 * key, ICU-shaped plurals in the locale files) and nothing else. It could not do
 * Swedish plural rules, and it could not change language without a restart.
 *
 * Deliberately free of native modules. Screens import from here, and so do the
 * screenshot harness and component tests — none of which have an Expo runtime to
 * call into. Device-language detection lives next door in `locale.ts`, which only
 * the root layout imports.
 */

import { useTranslation } from 'react-i18next'
import { i18n, t } from '@worldquest/i18n'

// One typed `t` for the whole app. Re-exported rather than wrapped so that a call
// site's key and params are checked against the generated key union.
export { t, tContent, currentLocale, setLocale } from '@worldquest/i18n'
// Locale-aware formatting and collation. Re-exported so a screen imports from one
// place — and so `collator` is the obvious thing to reach for instead of `.sort()`.
export {
  collator,
  formatCompact,
  formatDate,
  formatDuration,
  formatList,
  formatNumber,
  formatPercent,
  formatRelative,
} from '@worldquest/i18n'
export type { Locale, TranslationKey } from '@worldquest/i18n'

/**
 * Subscribes a component to language changes.
 *
 * Returns the app's typed `t`, not react-i18next's untyped one — the subscription is
 * the only thing being borrowed, and `t` is a stable module-level reference, so this
 * never defeats memoisation.
 *
 * The instance is passed explicitly rather than read from a React context. That means
 * no provider is required for a component to render correct copy, which is what lets
 * a screen be mounted in a test or in the screenshot renderer without any setup at
 * all — and a screen that is hard to mount is a screen nobody writes a test for.
 */
export function useT(): typeof t {
  useTranslation(undefined, { i18n })
  return t
}
