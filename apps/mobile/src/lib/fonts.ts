/**
 * Font loading.
 *
 * Custom fonts are not available until they have been loaded, and React Native does
 * not wait — it renders the system font and swaps when they arrive. That flash of
 * unstyled text is worse here than on the web, because Baloo 2 and the system font
 * have very different metrics: the whole layout jumps.
 *
 * So the splash screen stays up until the fonts are in. It is a few hundred
 * milliseconds on a cold start and zero afterwards, and it is the difference between
 * "the app opened" and "the app glitched".
 *
 * The list is derived from the design tokens rather than written out here. A weight
 * added to `tokens.json` and not loaded renders in the system font — a different
 * face entirely on Android, and close enough to miss on iOS.
 */

import { useEffect } from 'react'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { FONT_FAMILIES } from '@worldquest/design'
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter'
import { Baloo2_600SemiBold, Baloo2_700Bold } from '@expo-google-fonts/baloo-2'

/**
 * Family name → font file.
 *
 * The keys are exactly the strings `text()` puts into `fontFamily`, which is why
 * `FONT_FAMILIES` can check them: a typo on either side is a font that silently
 * never applies.
 */
const FONTS: Record<string, number> = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Baloo2_600SemiBold,
  Baloo2_700Bold,
}

// Fails loudly at import rather than rendering a screen in the wrong face. This is
// the same assertion `packages/design/src/tokens.test.ts` makes from the other side.
for (const family of FONT_FAMILIES) {
  if (!(family in FONTS)) {
    throw new Error(
      `[fonts] ${family} is in the design tokens but is not loaded. Add it to FONTS.`,
    )
  }
}

// Before any component mounts, so the native splash does not disappear underneath us
// while React is still deciding what to render.
void SplashScreen.preventAutoHideAsync()

/**
 * Loads the fonts, and hands the wait over to our own splash as soon as React can paint.
 *
 * Returns whether the app may render. Callers render the splash until it is true;
 * rendering the app early is what causes the metric jump.
 *
 * ## Why the native splash hides here and not when the fonts land
 *
 * It used to hide on `ready`, which is the obvious place and is wrong. The native
 * splash covered exactly the window the fonts take, and our splash rendered only after
 * that window closed — so it was never on screen for a single frame, on any platform.
 * A screen with a slow state, a failed state and a retry button, none of which could
 * ever be reached.
 *
 * The native splash is a static image. It cannot say "this is taking a while", it
 * cannot offer a retry, and it cannot tell a user whether the app is working or
 * wedged. That is the entire reason to have a React one. So the native splash's job
 * ends the moment React can draw, and everything after that belongs to a screen that
 * can speak.
 *
 * The cost is real and accepted: our splash paints in the fallback face, because the
 * fonts are precisely what it is waiting for. One screen in the wrong font for a few
 * hundred milliseconds is a far smaller problem than a boot that cannot explain itself.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(FONTS)
  const ready = loaded || error !== null

  useEffect(() => {
    // Once, on mount — not on `ready`. See above.
    void SplashScreen.hideAsync()
  }, [])

  // `error` counts as ready. A font that fails to decode is a bad day, but a splash
  // that never goes away is a broken app — the system font is an ugly fallback, not a
  // reason to strand the user on a logo.
  return ready
}
