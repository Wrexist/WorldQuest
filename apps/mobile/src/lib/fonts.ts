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
 * Loads the fonts and hides the splash once they are in.
 *
 * Returns whether the app may render. Callers render nothing until it is true — the
 * splash is still covering the screen at that point, so there is nothing to see
 * anyway, and rendering early is what causes the metric jump.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(FONTS)
  const ready = loaded || error !== null

  useEffect(() => {
    // Note `error` counts as ready. A font that fails to decode is a bad day, but a
    // splash screen that never goes away is a broken app — the system font is an
    // ugly fallback, not a reason to strand the user on a logo.
    if (ready) void SplashScreen.hideAsync()
  }, [ready])

  return ready
}
