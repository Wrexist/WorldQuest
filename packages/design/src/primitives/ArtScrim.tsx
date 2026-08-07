/**
 * The layer that makes text over artwork readable.
 *
 * ## Why this is a primitive and not four lines in a screen
 *
 * `pnpm design:contrast` checks token PAIRS — a foreground colour against a background
 * colour. It cannot check text over a picture, because a picture has no single colour,
 * and that blind spot is not theoretical. Measured off the rendered Explore tiles,
 * against a 4.5:1 floor:
 *
 *   · the status caption — **1.5:1** over Oceania, **1.6:1** over Africa, 2.0:1 over Asia;
 *   · the progress caption above it — 2.9:1 over Oceania, 3.2:1 over Africa, 3.4:1 over Asia.
 *
 * Every one of those failed, and every one of them passed the gate. With this scrim and
 * the caption moved off `text.tertiary`, the same six measure 4.6–8.0:1.
 *
 * A flat wash was there already and was not enough: raising it far enough for the
 * brightest sky would have flattened all seven to the navy they were before the art
 * existed, which is the change that made the screen worth looking at.
 *
 * ## Weighted downward, because that is where the small text is
 *
 * A card over artwork puts its heading at the top and its small print at the bottom, and
 * those two have different floors — 3:1 for large text, 4.5:1 for body and caption. So
 * the scrim is a gradient: light at the top, where a bold heading can hold its own and
 * the sky is the thing worth seeing, and heavy at the bottom, where a 13pt caption
 * cannot. The picture survives where it is doing work and gives way where it is not.
 *
 * ## Degrades to a flat wash
 *
 * Same lazy load as `Card` and `ScreenBackground`: without `expo-linear-gradient` this
 * falls back to a flat fill at the heavy end's opacity. Less pretty, never less legible —
 * the fallback is the safe direction, which is the only acceptable one for a contrast fix.
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors } from '../tokens.js'

type GradientComponent = React.ComponentType<{
  colors: readonly string[]
  locations?: readonly number[]
  start?: { x: number; y: number }
  end?: { x: number; y: number }
  style?: StyleProp<ViewStyle>
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only'
}>

let cached: GradientComponent | null | undefined

function loadGradient(): GradientComponent | null {
  if (cached !== undefined) return cached
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-linear-gradient') as { LinearGradient?: GradientComponent }
    cached = mod.LinearGradient ?? null
  } catch {
    cached = null
  }
  return cached
}

/**
 * Alpha, as the two hex digits React Native reads off the end of a colour.
 *
 * The canvas colour is the token; these are how much of it. Written here rather than in
 * `tokens.json` because they are not a colour anyone should reach for — they are this
 * component's own ramp, and the numbers that make the measurement pass.
 */
// 62 %. Was 55 — the flat wash's value — until the region banner put a 13pt caption near
// the TOP of a short panel, where the ramp has barely started. Over Oceania's turquoise
// that measured 4.45:1 against a 4.5 floor: a 1 % miss is still a miss, and the fix
// belongs to the primitive rather than to the one screen that happened to find it.
const TOP = '9E'
const MIDDLE = 'BF' // 75 %
const BOTTOM = 'E6' // 90 %

export function ArtScrim({ style }: { style?: StyleProp<ViewStyle> }) {
  const Gradient = loadGradient()
  const canvas = colors.bg.canvas

  if (Gradient === null) {
    return <View pointerEvents="none" style={[styles.fill, { backgroundColor: `${canvas}${BOTTOM}` }, style]} />
  }

  return (
    <Gradient
      pointerEvents="none"
      colors={[`${canvas}${TOP}`, `${canvas}${MIDDLE}`, `${canvas}${BOTTOM}`]}
      // Weighted late: the top half stays light and the bottom third does the work.
      locations={[0, 0.55, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[styles.fill, style]}
    />
  )
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
})
