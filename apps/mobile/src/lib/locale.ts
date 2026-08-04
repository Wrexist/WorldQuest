/**
 * Device-language detection.
 *
 * Separate from `i18n.tsx` because this is the one part that needs a native module.
 * Keeping `expo-localization` out of the import graph of every screen is what lets
 * the screenshot renderer and component tests mount real screens under plain Node.
 *
 * Only the root layout imports this.
 */

import { useEffect } from 'react'
import { getLocales } from 'expo-localization'
import { resolveLocale, setLocale, SUPPORTED_LOCALES, type Locale } from '@worldquest/i18n'
import { readJson } from './storage.js'

/**
 * The device's preferred languages, most-preferred first.
 *
 * `getLocales()` returns the OS's full ordered list, not just the top entry — so a
 * device set to [Finnish, Swedish, English] gets Swedish rather than English, which
 * is the whole point of asking the system instead of reading one locale string.
 */
export function deviceLocale(): Locale {
  return resolveLocale(getLocales().map((locale) => locale.languageTag))
}

/**
 * The language to start in: the user's explicit choice, or the device.
 *
 * Read straight from the preferences key rather than through `usePreferences`, which
 * lives in `features/settings` — a `lib` module importing a feature is a cycle, and
 * this is the same shape `lib/haptics.ts` uses for the same reason.
 *
 * `'system'` is stored as itself rather than resolved at write time, so a user who
 * picked "match my device" and then changes their phone's language is followed rather
 * than frozen at whatever the phone said the day they tapped it.
 */
export function startupLocale(): Locale {
  const choice = readJson<{ language?: string }>('preferences.v1')?.language
  return choice !== undefined && choice !== 'system' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(choice)
    ? (choice as Locale)
    : deviceLocale()
}

/**
 * Applies the startup language once, after mount.
 *
 * In an effect rather than at module load: `getLocales()` reaches into a native
 * module, and doing that during the import graph is how a bundler-ordering change
 * becomes a blank first frame. The catalogue is initialised synchronously with
 * English, so the first frame renders real copy and swaps within a frame if the
 * device wants something else.
 *
 * This applied `deviceLocale()` unconditionally until now. Settings has written a
 * `language` preference since it was built, and only Settings ever read it — so a user
 * who chose Swedish on an English phone got Swedish until they closed the app, and
 * English every time they opened it again, for ever. The stale comment that used to
 * sit here said the preference would take precedence "once that screen exists". It
 * exists.
 */
export function useDeviceLocale(): void {
  useEffect(() => {
    void setLocale(startupLocale())
  }, [])
}
