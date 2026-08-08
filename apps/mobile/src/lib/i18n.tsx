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
import { enablePseudoLocale, i18n, t } from '@worldquest/i18n'

/**
 * The pseudo-locale, reachable from a page the harness did not compile.
 *
 * The Definition of Done asks for "pseudo-locale screenshots clean". Everything needed
 * to produce them existed — `enablePseudoLocale()` builds `en-XA` in memory from the
 * English bundle — and none of it was reachable: the screenshot harness drives the
 * EXPORTED bundle, so `isDev()` is false, so the function returned false and said
 * nothing. It had no caller outside its own unit test.
 *
 * Attaching it here is what closes that, because a Playwright script can only touch the
 * window. Safe to attach unconditionally: the function still refuses in production
 * unless `__WQ_PSEUDO__` is separately set to true, and `en-XA` is not in
 * `SUPPORTED_LOCALES` or in the Settings picker either way. Attaching a function that
 * refuses is not an escape hatch; leaving a Definition of Done box permanently
 * unverifiable is worse.
 */
;(globalThis as { __wqEnablePseudoLocale?: () => Promise<boolean> }).__wqEnablePseudoLocale =
  enablePseudoLocale

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
