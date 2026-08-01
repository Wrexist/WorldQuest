/**
 * Card — the content surface.
 *
 * Elevation on a dark canvas is surface lightness plus glow, never a black drop
 * shadow. Spec: docs/design/design-system.md §4
 *
 * ## Why a gradient
 *
 * The mockup's cards are gradients, and the difference is not decoration: a flat fill
 * on a dark canvas at these lightness levels reads as a rectangle, while a 135°
 * gradient gives the surface a direction and makes the card look lit from the top
 * left — which is what makes the stack of cards read as depth rather than as a list.
 *
 * The gradient is two token values, never two hex literals. `gradient.card` themes
 * with everything else, so a high-contrast or seasonal palette changes it too.
 *
 * ## The fallback matters
 *
 * `expo-linear-gradient` needs a native module. Where there isn't one — the
 * screenshot renderer, a component test, a bare web build — this falls back to the
 * flat surface colour rather than crashing. A card is the most-used component in the
 * app; it must render under every renderer that can render anything at all.
 */
import type { ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, gradient, radius, space } from '../tokens.js'

export type CardProps = {
  children: ReactNode
  level?: 1 | 2 | 3
  /** Groups the card into ONE screen-reader element instead of seven. */
  accessibilityLabel?: string
  /** Flat fill instead of a gradient — for a card sitting on another card. */
  flat?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

/** `from`/`to` as the array expo-linear-gradient wants. */
const stops = (level: 1 | 2 | 3): readonly [string, string] =>
  level === 1
    ? [gradient.card.from, gradient.card.to]
    : [gradient.cardRaised.from, gradient.cardRaised.to]

/**
 * 135° in design terms is top-left → bottom-right, which is what the token records.
 * expo-linear-gradient takes unit-square coordinates instead of an angle.
 */
const START = { x: 0, y: 0 }
const END = { x: 1, y: 1 }

export function Card({
  children,
  level = 1,
  accessibilityLabel,
  flat = false,
  style,
  testID,
}: CardProps) {
  const Gradient = loadGradient()

  const content = (
    <View
      accessible={accessibilityLabel !== undefined}
      aria-label={accessibilityLabel}
      testID={testID}
      style={[styles.base, LEVELS[level], flat || Gradient === null ? null : styles.transparent, style]}
    >
      {children}
    </View>
  )

  if (flat || Gradient === null) return content

  // The gradient sits BEHIND the card rather than wrapping it, so the card keeps
  // owning its own padding, radius and accessibility grouping. Wrapping would put a
  // second element between the screen reader and the label.
  return (
    <View style={[styles.wrap, LEVELS[level], style]}>
      <Gradient colors={stops(level)} start={START} end={END} style={StyleSheet.absoluteFill} />
      {content}
    </View>
  )
}

type GradientComponent = React.ComponentType<{
  colors: readonly string[]
  start?: { x: number; y: number }
  end?: { x: number; y: number }
  style?: StyleProp<ViewStyle>
}>

let cached: GradientComponent | null | undefined

/**
 * Resolved once, lazily, and never allowed to throw.
 *
 * A static import would take down every renderer without the native module — which
 * includes the screenshot harness and the component tests, i.e. the two places that
 * exist to catch problems before a device does.
 */
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

const LEVELS = StyleSheet.create({
  1: {
    backgroundColor: colors.bg.surface,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  2: {
    backgroundColor: colors.bg.surfaceRaised,
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  3: {
    backgroundColor: colors.bg.surfaceRaised,
    borderWidth: 1, borderColor: colors.border.subtle,
    shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 }, elevation: 12,
  },
})

const styles = StyleSheet.create({
  base: { borderRadius: radius.lg, padding: space[4] },
  // The wrapper carries the fill and the clip; the inner view must not paint over it.
  wrap: { borderRadius: radius.lg, overflow: 'hidden' },
  transparent: { backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 },
})
