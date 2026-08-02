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
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, gradient, radius, space } from '../tokens.js'

export type CardProps = {
  children: ReactNode
  level?: 1 | 2 | 3
  /**
   * Groups the card into ONE screen-reader element instead of seven, and names it.
   *
   * Spelled `accessibilityLabel`, NOT `aria-label`. TypeScript does not type-check
   * hyphenated JSX attributes against a component's props, so `aria-label` on a Card
   * compiles, does nothing, and leaves a pressable card with no accessible name —
   * silently. It cost a round of failing tests to find once already.
   */
  accessibilityLabel?: string
  /** Flat fill instead of a gradient — for a card sitting on another card. */
  flat?: boolean
  /**
   * Makes the whole card the target — goal pickers, collection tiles, list rows.
   *
   * Supplying this REQUIRES `accessibilityLabel` and a `role`, by the type below.
   * A pressable with no name is a button a screen reader announces as "button", and
   * the design rule here is that the accessible path is the easy path: this should be
   * a type error, not a review comment.
   */
  onPress?: () => void
  /** `radio` for one-of-many, `checkbox` for many-of-many, `button` for an action. */
  role?: 'button' | 'radio' | 'checkbox'
  /** Selection state. ARIA, not `accessibilityState` — react-native-web drops the latter. */
  'aria-checked'?: boolean
  'aria-disabled'?: boolean
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
  onPress,
  role,
  'aria-checked': checked,
  'aria-disabled': disabled,
  style,
  testID,
}: CardProps) {
  const Gradient = loadGradient()

  const interactive = onPress !== undefined
  const wrapped = !flat && Gradient !== null

  /**
   * A card is exactly ONE box, gradient or not.
   *
   * This started as a wrapper around an inner view, and both versions of that were
   * wrong. Applying the caller's `style` to both doubled every margin and compounded
   * every percentage — a `width: '31%'` tile became 31 % of 31 %. Applying it only to
   * the wrapper fixed that and left a subtler one: `padding`, `alignItems`,
   * `justifyContent` and `gap` are instructions about the card's CHILDREN, and the
   * children lived in the inner view. A tile asking for `padding: space[2]` got 8 px
   * on the wrapper plus the inner view's default 16 — 24 px a side — and its
   * `alignItems: 'center'` governed one full-width box instead of the two labels it
   * was written for. On a 111 px tile that left 63 px for text, and "Stockholm" broke
   * mid-word.
   *
   * The tell was that the two branches disagreed: without the gradient module —
   * component tests, the screenshot renderer, the design preview — there was only ever
   * one box and the caller's style behaved correctly. So every test passed and only
   * the real bundle was wrong. `pnpm e2e` is what saw it.
   *
   * So the gradient is now an absolutely-positioned child rather than a parent. One
   * box means the caller's style can only mean one thing, and it means the same thing
   * on both paths.
   */
  const shared = {
    accessible: accessibilityLabel !== undefined || interactive,
    'aria-label': accessibilityLabel,
    testID,
    // `clip` only when there is a gradient to clip: `overflow: 'hidden'` on every card
    // would silently crop anything a caller deliberately hangs over the edge.
    style: [styles.base, LEVELS[level], wrapped ? styles.clip : null, style],
  }

  const backdrop = wrapped ? (
    <Gradient
      colors={stops(level)}
      start={START}
      end={END}
      style={StyleSheet.absoluteFill}
      // Paints under the children by document order; must never eat their touches.
      pointerEvents="none"
    />
  ) : null

  // A pressable card is a Pressable, not a View with a touch handler. That is what
  // gives it the focus ring, the keyboard activation and the pressed state for free —
  // all three of which have to be hand-built, and are therefore forgotten, otherwise.
  //
  // The two branches are written out rather than spread from one object so that
  // `role=` and `aria-checked=` are real JSX attributes. `tokens.test.ts` greps for
  // exactly that, and a guard that an object literal can walk past is not a guard.
  return interactive ? (
    <Pressable
      {...shared}
      onPress={onPress}
      role={role ?? 'button'}
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      // 44pt is the floor for a touch target (accessibility.md §4). A card is normally
      // far bigger than that; this is for the compact ones — chips, year pickers.
      hitSlop={4}
    >
      {backdrop}
      {children}
    </Pressable>
  ) : (
    <View {...shared}>
      {backdrop}
      {children}
    </View>
  )
}

type GradientComponent = React.ComponentType<{
  colors: readonly string[]
  start?: { x: number; y: number }
  end?: { x: number; y: number }
  style?: StyleProp<ViewStyle>
  /**
   * Forwarded to the View underneath. Declared here because this structural type is
   * what we type-check against — expo-linear-gradient's own props are never seen, by
   * design, so that a missing native module is a `null` and not an import failure.
   */
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only'
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
  // Keeps the gradient inside the corner radius. Nothing else needs it.
  clip: { overflow: 'hidden' },
})
