/**
 * The `Intl` this app needs, on the engine that does not have it.
 *
 * ## The bug this exists to fix
 *
 * Every plural string in the product rendered to real users as its own ICU source:
 *
 *     {count, plural, one {# land att upptäcka} other {# länder att upptäcka}}
 *
 * on the Explore tiles, the lesson summary headline, all three daily-goal options in
 * Settings, and the pending-sync line. Not a translation bug and not a Swedish one —
 * `intl-messageformat` needs `Intl.PluralRules` to pick a branch, **Hermes does not
 * implement it**, the constructor throws `Intl.PluralRules is not available in this
 * environment`, and `icu.ts`'s error handler does the only safe thing left and returns
 * the raw pattern. The `console.error` beside it went to a log nobody reads on a phone.
 *
 * Hermes has `Intl.Collator`, `Intl.DateTimeFormat`, `Intl.NumberFormat` and
 * `Intl.getCanonicalLocales`, which is why numbers and dates were fine and only plurals
 * were not. `PluralRules` is the one member of that family it has never shipped.
 *
 * ## Why nothing in this repo caught it
 *
 * Worth writing down, because the gap is structural rather than an oversight.
 *
 * Every check that renders a string runs somewhere with a complete `Intl`: the unit
 * tests in Node, the component tests in jsdom, `design:shots` and `e2e` in Chromium.
 * All of them format plurals correctly and always will. The only engine in the pipeline
 * that lacks `PluralRules` is the one the app actually ships on, and the only build that
 * reaches it is the one that goes to TestFlight. So the app was verified by four
 * harnesses that agreed, and wrong on every device.
 *
 * `i18n.test.ts` now runs the plural suite a second time with `Intl.PluralRules`
 * deleted, which is the closest a Node process can get to standing where Hermes stands.
 *
 * ## `polyfill-force`, deliberately — the conditional one reintroduces the bug
 *
 * The obvious spelling is `@formatjs/intl-pluralrules/polyfill`, which no-ops when the
 * engine already has a working implementation. It was written that way first and it is
 * wrong here, for the same reason the original defect existed: it would leave Node,
 * jsdom and Chromium formatting plurals through their own native `Intl` while the
 * device formats them through FormatJS. Two implementations, and the one under test is
 * never the one that ships.
 *
 * `polyfill-force` installs everywhere, so the plural branch a test picks is chosen by
 * exactly the code that will choose it on a phone. The cost is a rule table the engine
 * may already have; the benefit is that this class of bug — "correct in four harnesses,
 * wrong on every device" — cannot recur through this door.
 *
 * Only `en` and `sv` locale data is imported. The files are per-locale and the app
 * ships two languages; importing the full set would be roughly a hundred rule tables
 * for the ninety-eight languages we do not have.
 *
 * ## `PluralRules` alone, and why the two obvious companions are not here
 *
 * FormatJS's React Native guide recommends `@formatjs/intl-getcanonicallocales` and
 * `@formatjs/intl-locale` alongside this. Both were imported first and both came back
 * out: together they added **0.30 MB to the Hermes bundle**, measured — a third of a
 * megabyte of startup parse for a two-language app, which is real seconds of cold start
 * on the mid-tier Android the budget in `bundle-native.cjs` is written for.
 *
 * They are not needed. Hermes ships `Intl.getCanonicalLocales`, which is the only one of
 * the two this polyfill calls in its non-IIFE build. `Intl.Locale` appears once, in
 * `intl-localematcher`'s paradigm-locale path, which `new Intl.PluralRules('sv')` does
 * not reach.
 *
 * Verified rather than reasoned: in a Node process with BOTH `Intl.Locale` and
 * `Intl.PluralRules` deleted before the import — which is exactly what Hermes offers —
 * `en` and `sv` both still select the right branch and `intl-messageformat` formats
 * through them. Deleting a global before the import works here where it did not for the
 * test in `i18n.test.ts`, and for the same reason: what matters is the state of the
 * engine at the moment the polyfill decides, and only an import that never happens can
 * be simulated after the fact.
 *
 * If a third language ever needs a script or region subtag that `lookup` cannot resolve,
 * the two packages come back — and the budget note in `bundle-native.cjs` is where that
 * 0.30 MB should be argued for.
 *
 * This module has to be evaluated before `i18next.init` builds its first formatter.
 * `index.ts` imports it on its first line for that reason.
 */

import '@formatjs/intl-pluralrules/polyfill-force.js'
import '@formatjs/intl-pluralrules/locale-data/en.js'
import '@formatjs/intl-pluralrules/locale-data/sv.js'

/**
 * Whether a usable `Intl.PluralRules` is present.
 *
 * Exported so `index.ts` can say something loud in development if this file is ever
 * reordered out of effect. A silent fallback to raw ICU is exactly the failure that
 * shipped.
 */
export function hasPluralRules(): boolean {
  try {
    return new Intl.PluralRules('sv').select(2) === 'other'
  } catch {
    return false
  }
}

/**
 * Whether the implementation in play is FormatJS's rather than the engine's.
 *
 * FormatJS stamps `polyfilled` on what it installs. The test asserts this is `true`, and
 * that assertion is the point of `polyfill-force`: it is how a Node process proves it is
 * running the same plural implementation the phone will run. If it ever reads `false`,
 * the import above went back to the conditional spelling and the tests have quietly
 * stopped covering the device.
 */
export function pluralRulesArePolyfilled(): boolean {
  return (Intl.PluralRules as unknown as { polyfilled?: boolean }).polyfilled === true
}
