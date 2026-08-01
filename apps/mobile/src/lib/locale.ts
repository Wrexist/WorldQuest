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
import { resolveLocale, setLocale, type Locale } from '@worldquest/i18n'

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
 * Applies the device language once, after mount.
 *
 * In an effect rather than at module load: `getLocales()` reaches into a native
 * module, and doing that during the import graph is how a bundler-ordering change
 * becomes a blank first frame. The catalogue is initialised synchronously with
 * English, so the first frame renders real copy and swaps within a frame if the
 * device wants something else.
 */
export function useDeviceLocale(): void {
  useEffect(() => {
    // A saved preference from Settings takes precedence once that screen exists
    // (docs/plan/asset-independent-work.md, B1). Until then, the device decides.
    void setLocale(deviceLocale())
  }, [])
}
