/**
 * The app's canvas, as a gradient rather than a flat fill.
 *
 * `colors.bg.canvasGradient` has been in `tokens.json` since the token file was
 * written and had **no readers at all** — every screen painted `colors.bg.canvas` flat.
 * Meanwhile every delivered illustration has atmosphere behind its subject: a starfield,
 * a wash of light, depth. The app they sat on was one flat navy, which is most of why
 * the art read as belonging to a different product.
 *
 * Mounted once, at the root, behind the router. Screens no longer paint their own
 * background — that is what made the token unreachable, since a flat fill on top of a
 * gradient is just a flat fill.
 *
 * ## Degrades to the flat colour, deliberately
 *
 * Same lazy load as `Card`: a missing `expo-linear-gradient` resolves to `null` and this
 * falls back to `colors.bg.canvas`, which is exactly what shipped before. The screenshot
 * harness and the component tests both run without the native module, and a static
 * import there would take down the two things that catch problems before a device does.
 */

import type { ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors } from '../tokens.js'

type GradientComponent = React.ComponentType<{
  colors: readonly string[]
  start?: { x: number; y: number }
  end?: { x: number; y: number }
  style?: StyleProp<ViewStyle>
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only'
  /** Declared because this one WRAPS the app, unlike `Card`'s use of the same type. */
  children?: ReactNode
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

export function ScreenBackground({ children }: { children: ReactNode }) {
  const Gradient = loadGradient()

  if (Gradient === null) {
    return <View style={styles.flat}>{children}</View>
  }

  return (
    // Top to bottom, not the cards' 135°. A canvas is the sky behind everything and
    // reads as light falling from above; a diagonal would fight the card gradients
    // sitting on it.
    <Gradient
      colors={colors.bg.canvasGradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.flex}
    >
      {children}
    </Gradient>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flat: { flex: 1, backgroundColor: colors.bg.canvas },
})
