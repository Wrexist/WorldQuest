/**
 * Localisation — init, detection, fallback, and the one typed `t`.
 *
 * This replaces the hand-written shim that carried Phase 1. The shim did the two
 * things that were expensive to retrofit (every string a key, ICU-shaped plurals) and
 * nothing else; it could not do Swedish plural rules, gendered forms, or a language
 * change without a restart. i18next can, and ICU is the reason the locale files did
 * not have to change to get here.
 *
 * The call shape is deliberately narrower than i18next's: one `t`, typed against the
 * generated key union, with the placeholders each key needs enforced at compile time.
 * A missing placeholder renders as literal `{time}` on screen — invisible to a test
 * that only asserts the key resolved, obvious to a user, and we shipped it once.
 *
 * Spec: docs/engineering/localization.md · docs/adr/0009-localization.md
 */

import i18next, { type i18n as I18nInstance } from 'i18next'
import { IcuFormat } from './icu.js'
import { pseudo } from './pseudo.js'
import { NAMESPACES, type Namespace, type TranslationKey, type TranslationParams } from './keys.js'

import enWelcome from '../locales/en/welcome.json' with { type: 'json' }
import svWelcome from '../locales/sv/welcome.json' with { type: 'json' }
import enSplash from '../locales/en/splash.json' with { type: 'json' }
import svSplash from '../locales/sv/splash.json' with { type: 'json' }
import enStreak from '../locales/en/streak.json' with { type: 'json' }
import svStreak from '../locales/sv/streak.json' with { type: 'json' }
import enTitles from '../locales/en/titles.json' with { type: 'json' }
import svTitles from '../locales/sv/titles.json' with { type: 'json' }
import enCollection from '../locales/en/collection.json' with { type: 'json' }
import svCollection from '../locales/sv/collection.json' with { type: 'json' }
import enOnboarding from '../locales/en/onboarding.json' with { type: 'json' }
import svOnboarding from '../locales/sv/onboarding.json' with { type: 'json' }
import enAchievements from '../locales/en/achievements.json' with { type: 'json' }
import enCommon from '../locales/en/common.json' with { type: 'json' }
import enCountry from '../locales/en/country.json' with { type: 'json' }
import enErrors from '../locales/en/errors.json' with { type: 'json' }
import enExplore from '../locales/en/explore.json' with { type: 'json' }
import enHome from '../locales/en/home.json' with { type: 'json' }
import enLesson from '../locales/en/lesson.json' with { type: 'json' }
import enNav from '../locales/en/nav.json' with { type: 'json' }
import enNotifications from '../locales/en/notifications.json' with { type: 'json' }
import enProfile from '../locales/en/profile.json' with { type: 'json' }
import enQuests from '../locales/en/quests.json' with { type: 'json' }
import enSettings from '../locales/en/settings.json' with { type: 'json' }
import svAchievements from '../locales/sv/achievements.json' with { type: 'json' }
import svCommon from '../locales/sv/common.json' with { type: 'json' }
import svCountry from '../locales/sv/country.json' with { type: 'json' }
import svErrors from '../locales/sv/errors.json' with { type: 'json' }
import svExplore from '../locales/sv/explore.json' with { type: 'json' }
import svHome from '../locales/sv/home.json' with { type: 'json' }
import svLesson from '../locales/sv/lesson.json' with { type: 'json' }
import svNav from '../locales/sv/nav.json' with { type: 'json' }
import svNotifications from '../locales/sv/notifications.json' with { type: 'json' }
import svProfile from '../locales/sv/profile.json' with { type: 'json' }
import svQuests from '../locales/sv/quests.json' with { type: 'json' }
import svSettings from '../locales/sv/settings.json' with { type: 'json' }

export * from './format.js'
export { NAMESPACES, type Namespace, type TranslationKey, type TranslationParams }

/**
 * Development-only warnings, without assuming which runtime we are in.
 *
 * This package runs in three: Metro (which defines `__DEV__` and inlines
 * `process.env.NODE_ENV`), Node (tests and scripts), and eventually a web bundler.
 * Reading `process` directly would force `@types/node` into the React Native app's
 * tsconfig, which puts `fs` and `child_process` in autocomplete for screen code —
 * a bad trade for one boolean.
 */
const isDev = (): boolean => {
  const runtime = globalThis as {
    __DEV__?: boolean
    process?: { env?: Record<string, string | undefined> }
  }
  if (typeof runtime.__DEV__ === 'boolean') return runtime.__DEV__
  return runtime.process?.env?.['NODE_ENV'] !== 'production'
}

/** Shipped in v1.0. Spanish, German, French and Portuguese follow in v2.0. */
export const SUPPORTED_LOCALES = ['en', 'sv'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const FALLBACK_LOCALE: Locale = 'en'

/** Not in `SUPPORTED_LOCALES` — a development tool, never a shipped language. */
export const PSEUDO_LOCALE = 'en-XA'

// ── resources ───────────────────────────────────────────────────────────────

/**
 * Core locales ship IN THE BINARY. A first launch on a plane must render words, and a
 * translation bundle is a few kilobytes — the download is not worth the failure mode.
 */
const RAW: Record<Locale, Record<Namespace, Record<string, string>>> = {
  en: {
    achievements: enAchievements,
    onboarding: enOnboarding,
    collection: enCollection,
    titles: enTitles,
    splash: enSplash,
    streak: enStreak,
    welcome: enWelcome,
    common: enCommon,
    country: enCountry,
    errors: enErrors,
    explore: enExplore,
    home: enHome,
    lesson: enLesson,
    nav: enNav,
    notifications: enNotifications,
    profile: enProfile,
    quests: enQuests,
    settings: enSettings,
  },
  sv: {
    achievements: svAchievements,
    onboarding: svOnboarding,
    collection: svCollection,
    titles: svTitles,
    splash: svSplash,
    streak: svStreak,
    welcome: svWelcome,
    common: svCommon,
    country: svCountry,
    errors: svErrors,
    explore: svExplore,
    home: svHome,
    lesson: svLesson,
    nav: svNav,
    notifications: svNotifications,
    profile: svProfile,
    quests: svQuests,
    settings: svSettings,
  },
}

/**
 * The locale files store the full `namespace:key`, because that is what a developer
 * greps for and what CI validates. i18next wants the namespace as a bundle boundary
 * and the remainder as the key, so strip the prefix on the way in.
 *
 * `__note` entries are translator context, not strings — they never reach the runtime.
 */
function toBundle(namespace: string, raw: Record<string, string>): Record<string, string> {
  const bundle: Record<string, string> = {}
  const prefix = `${namespace}:`
  for (const [key, value] of Object.entries(raw)) {
    if (key.endsWith('__note')) continue
    bundle[key.startsWith(prefix) ? key.slice(prefix.length) : key] = value
  }
  return bundle
}

const resources = Object.fromEntries(
  Object.entries(RAW).map(([locale, namespaces]) => [
    locale,
    Object.fromEntries(
      Object.entries(namespaces).map(([ns, raw]) => [ns, toBundle(ns, raw)]),
    ),
  ]),
)

// ── the instance ────────────────────────────────────────────────────────────

/**
 * Our own instance rather than the global one. Two libraries initialising the same
 * global i18next is a class of bug that only appears once a dependency also uses it,
 * and by then it is someone else's stack trace.
 */
export const i18n: I18nInstance = i18next.createInstance()

i18n
  .use(
    new IcuFormat({
      /**
       * A malformed ICU string must never fail silently. The default behaviour of
       * every library in this space is to render the raw pattern, which reaches the
       * user as `{count, plural, one {# day streak} ...}` and reaches the developer
       * as nothing at all.
       */
      onError: (error, key, value) => {
        if (isDev()) {
          console.error(`[i18n] ICU parse failed for "${key}": ${error.message}\n  ${value}`)
        }
        return value
      },
    }),
  )
  .init({
    lng: FALLBACK_LOCALE,
    fallbackLng: FALLBACK_LOCALE,
    // The pseudo-locale is listed so i18next does not reject it when a dev build
    // switches to it. It has no bundle until `enablePseudoLocale` builds one, and
    // `resolveLocale` never returns it, so no user can land here by accident.
    supportedLngs: [...SUPPORTED_LOCALES, PSEUDO_LOCALE],
    ns: NAMESPACES,
    defaultNS: 'common',
    resources,
    // Keys contain dots (`greeting.morning`) and the bundles are flat, so dot must NOT
    // be read as a path into a nested object. The namespace separator stays `:`.
    keySeparator: false,
    nsSeparator: ':',
    // Synchronous init. Screens call `t` during their first render; an async init means
    // the first frame renders raw keys and then flickers into real copy.
    initImmediate: false,
    interpolation: {
      // React already escapes. Double-escaping turns "Côte d'Ivoire" into mojibake.
      escapeValue: false,
    },
    returnNull: false,
  })

// ── the typed t ─────────────────────────────────────────────────────────────

/**
 * Params are required exactly when the English string has placeholders, and omitted
 * entirely when it does not — so `t('common:continue')` stays a one-argument call
 * while `t('home:level')` cannot compile without `{ level }`.
 */
export type TranslationArgs<K extends TranslationKey> =
  keyof TranslationParams[K] extends never ? [] : [params: TranslationParams[K]]

export function t<K extends TranslationKey>(key: K, ...args: TranslationArgs<K>): string {
  if (isDev() && !i18n.exists(key)) {
    // Only reachable if keys.ts is stale — regenerate with `pnpm i18n:types`.
    console.warn(`[i18n] missing key: ${key}`)
    return key
  }
  // Branch rather than pass `undefined`: i18next's second parameter is overloaded on
  // `string` (a default value) as well as an options object, so an explicit
  // `undefined` picks the wrong overload.
  const params = args[0] as Record<string, unknown> | undefined
  return params === undefined ? i18n.t(key) : i18n.t(key, params)
}

/**
 * `t` for keys that come from a content pack rather than from source.
 *
 * A question template names its own prompt (`lesson:prompt.capital_of`) and supplies
 * its own parameters, so neither can be checked against the generated union — the
 * compiler cannot see a JSON file that ships separately from the binary.
 *
 * That check does not disappear, it moves: `pnpm content:validate` fails a pack whose
 * template references a key the catalogue does not have. Use this ONLY where the key
 * genuinely originates in content. Everywhere else, `t` is the one to reach for, and
 * reaching for this instead silently opts out of the type safety.
 */
export function tContent(key: string, params?: Record<string, string | number>): string {
  if (!i18n.exists(key)) {
    if (isDev()) console.warn(`[i18n] content referenced a missing key: ${key}`)
    return key
  }
  return params === undefined ? i18n.t(key) : i18n.t(key, params)
}

// ── locale selection ────────────────────────────────────────────────────────

const isSupported = (value: string): value is Locale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(value)

/**
 * First supported locale among the candidates, falling back to English.
 *
 * Candidates are tried in order and each is also tried without its region, so a
 * `sv-FI` device gets Swedish rather than English (spec §7). The app passes, in
 * order: the user's saved choice, then the device's preferred languages.
 */
export function resolveLocale(candidates: readonly string[]): Locale {
  for (const candidate of candidates) {
    if (!candidate) continue
    if (isSupported(candidate)) return candidate
    const language = candidate.split(/[-_]/)[0]
    if (language && isSupported(language)) return language
  }
  return FALLBACK_LOCALE
}

/**
 * Applies immediately, without a restart (spec §7). Components re-render because they
 * subscribe through react-i18next; anything reading `t` outside React picks up the
 * new language on its next call.
 */
export async function setLocale(locale: Locale): Promise<void> {
  if (i18n.language === locale) return
  await i18n.changeLanguage(locale)
}

// ── pseudo-locale ───────────────────────────────────────────────────────────

/**
 * Adds `en-XA` and switches to it.
 *
 * German and Finnish run about 40% longer than English. Testing a layout only in
 * English means finding that out in a screenshot from a translator, months later,
 * after the layout has been copied into six other screens.
 *
 * The bundle is built in memory from the English one, so it can never be stale and
 * there is nothing to generate or commit. The accents also make untranslated strings
 * obvious: anything still rendering in plain ASCII never went through `t()`.
 *
 * A no-op in production. Not because shipping it would be catastrophic, but because
 * a language nobody speaks appearing in a picker is a support ticket.
 */
export async function enablePseudoLocale(): Promise<boolean> {
  if (!isDev()) return false

  for (const [namespace, bundle] of Object.entries(RAW.en)) {
    const stripped = toBundle(namespace, bundle)
    const pseudoBundle = Object.fromEntries(
      Object.entries(stripped).map(([key, value]) => [key, pseudo(value)]),
    )
    i18n.addResourceBundle(PSEUDO_LOCALE, namespace, pseudoBundle, true, true)
  }

  // Awaited: `changeLanguage` resolves the new language, and a caller that renders
  // immediately after a fire-and-forget call sees the old one.
  await i18n.changeLanguage(PSEUDO_LOCALE)
  return true
}

export const currentLocale = (): Locale =>
  isSupported(i18n.language) ? i18n.language : FALLBACK_LOCALE
