/**
 * Button — the primary interactive primitive.
 *
 * The accessible path is the easy path: `label` is required and doubles as the
 * accessibility label, so a Button without one is a TYPE ERROR rather than a review
 * comment. That is deliberate — a11y that depends on remembering gets forgotten.
 *
 * Solid variants are drawn as a face on an edge and sink when pressed; see
 * `press3d.tsx` for the mechanic and why it is built the way it is.
 *
 * Spec: docs/design/design-system.md §11
 */

import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { colors, depth, radius, space } from '../tokens.js'
import { squircle } from '../shape.js'
import { text } from '../typography.js'
import { press3d, useFacePress } from './press3d.js'

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export type ButtonProps = {
  /** Visible text AND the default accessibility label. Required. */
  label: string
  onPress: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  loading?: boolean
  fullWidth?: boolean
  /** Only when the visible label is not descriptive enough on its own. */
  accessibilityLabel?: string
  accessibilityHint?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * Face heights. The socket adds the edge on top of these, so the tap target is taller.
 *
 * **`sm` is 40 so the socket lands on exactly 44** — the accessibility floor — because
 * `depth.button` is 4 and the tap target is face + edge. At 36 it measured 40 and the
 * design-shots harness caught it on the shop's six Buy buttons at all three viewports.
 * A 40 pt control looks completely fine in a screenshot and misses under a thumb, which
 * is the entire reason that check measures rather than looks.
 *
 * Anything added here must clear 44 the same way. `sm` is the smallest size this
 * component offers, so this row is the floor for every button in the app.
 */
const HEIGHTS: Record<ButtonSize, number> = { sm: 40, md: 48, lg: 54 }

type Skin = {
  face: string
  edge: string
  label: string
  outlined?: boolean
  /** A soft bloom behind the button. Primary only — see the note at the render. */
  glow?: string
}

const SKINS: Record<ButtonVariant, Skin> = {
  primary: {
    face: colors.action.primary,
    edge: colors.action.primaryEdge,
    label: colors.text.onAccent,
    glow: colors.action.primaryGlow,
  },
  secondary: {
    face: colors.action.secondary,
    edge: colors.action.secondaryEdge,
    label: colors.text.onAccent,
  },
  destructive: {
    face: colors.action.destructive,
    edge: colors.action.destructiveEdge,
    label: colors.text.onAccent,
  },
  // Outlined: the "face" is the canvas showing through, and the edge doubles as the
  // ring. Duolingo's secondary control, and the reason it still reads as pressable
  // when it has no fill.
  tertiary: {
    face: colors.bg.surface,
    edge: colors.action.tertiaryEdge,
    label: colors.text.primary,
    outlined: true,
  },
  // Genuinely flat. For "skip", "not now", "log out" — the actions we must offer
  // without inviting.
  ghost: { face: 'transparent', edge: 'transparent', label: colors.text.secondary },
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  fullWidth = true,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const isInert = disabled || loading
  const flat = variant === 'ghost'
  const edgeDepth = flat ? 0 : depth.button
  const { translateY, onPressIn, onPressOut } = useFacePress(edgeDepth, isInert)

  const skin = SKINS[variant]
  const faceHeight = HEIGHTS[size]
  const socketHeight = faceHeight + edgeDepth

  const faceColor = isInert && !flat ? colors.action.disabled : skin.face
  const edgeColor = isInert && !flat ? colors.action.disabledEdge : skin.edge
  const labelColor = disabled ? colors.text.tertiary : skin.label

  return (
    <Pressable
      accessible
      role="button"
      aria-label={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      aria-disabled={isInert}
      aria-busy={loading}
      // Reach the 44pt minimum target without growing the visual.
      hitSlop={Math.max(0, (44 - socketHeight) / 2)}
      disabled={isInert}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      testID={testID}
      // `minHeight`, never `height`. At the 200 % text setting an uppercase label is
      // twice as wide as the box that was drawn for it in English, and a fixed height
      // turns that into a clipped label rather than a taller button. The a11y spec's
      // rule is the blunt version: never fix a height to an English string.
      style={[press3d.socket, { minHeight: socketHeight }, fullWidth && styles.fullWidth, style]}
    >
      {/* The glow under the one button that carries the screen.
          `action.primaryGlow` was a third token with no readers, alongside
          `bg.canvasGradient` and `motion.stagger`. It is worth wiring because it is the
          house style stated in `asset-prompts.md` — "soft matte surfaces with gentle
          subsurface glow" — and every delivered illustration has it while the interface
          under them had none. A flat green rectangle beside a mascot lit from within
          reads as two products.

          Only the primary, and only when it is live. A glow under every button is not a
          glow, it is a haze; and a glow under a disabled one promises a tap that does
          nothing. */}
      {!flat && (
        <View
          style={[press3d.edge, styles.edge, { top: edgeDepth, backgroundColor: edgeColor }]}
        />
      )}

      <Animated.View
        style={[
          press3d.face,
          styles.face,
          {
            minHeight: faceHeight,
            backgroundColor: faceColor,
            transform: [{ translateY }],
          },
          // The bloom under the one button that carries the screen.
          //
          // `action.primaryGlow` was a token with no readers, alongside
          // `bg.canvasGradient` and `motion.stagger`. It is worth wiring because it is
          // the house style stated in asset-prompts.md — "soft matte surfaces with
          // gentle subsurface glow" — and every delivered illustration has it while the
          // interface under them had none.
          //
          // A REAL shadow, not a tinted rectangle behind the button. That was tried
          // first and rendered as a hard-edged third slab in the 3D stack: a flat shape
          // at low opacity has an edge, and an edge is the one thing a glow does not
          // have. Same mistake as trying to fake confetti with a solid band.
          //
          // Paired with `elevation`, because `tokens.test.ts` requires it and the rule
          // is right: an iOS-only shadow is a component that looks flat to half our
          // users. Android cannot colour an elevation, so it gets a neutral raise
          // rather than a green bloom — which is not a downgrade so much as the
          // platform's own idiom for the same idea, a primary action sitting above the
          // surface.
          //
          // TURNED DOWN in the iOS pass, not turned off. At 0.55 over `space[3]` this
          // was a visible green halo on a navy screen — read back from a device it is
          // the second-loudest non-native object on the onboarding slides, after the
          // uppercase label (docs/design/ios-native-audit.md, N11). Removing it outright
          // would have put `action.primaryGlow` back in the state this comment was
          // written to get it out of: a token nothing reads. At 0.22 over `space[2]` it
          // is an ambient lift rather than a bloom — the primary still sits above the
          // canvas, and you have to look for the colour to find it.
          skin.glow !== undefined && !isInert && {
            shadowColor: skin.glow,
            shadowOpacity: 0.22,
            shadowRadius: space[2],
            shadowOffset: { width: 0, height: space[1] },
            elevation: space[1],
          },
          // The outlined variant draws the edge colour as a ring too, so the shape is
          // closed on all four sides rather than just underneath.
          skin.outlined === true && !isInert && { borderWidth: 2, borderColor: edgeColor },
        ]}
      >
        {/* The label stays mounted while loading so the button does not change width. */}
        {loading ? (
          <ActivityIndicator color={labelColor} />
        ) : (
          <Text
            // Two lines, so a long label at a large text size wraps instead of being
            // cut. Three would mean the button has swallowed a sentence, which is a
            // copy problem rather than a layout one.
            numberOfLines={2}
            style={[
              styles.label,
              size === 'sm' && styles.labelSm,
              flat && styles.labelGhost,
              { color: labelColor },
            ]}
          >
            {label}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  fullWidth: { alignSelf: 'stretch' },
  edge: { borderRadius: radius.lg, ...squircle },
  face: {
    borderRadius: radius.lg,
    ...squircle,
    paddingVertical: space[2],
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space[2],
    paddingHorizontal: space[5],
  },
  // The `button` step: 17/800, sentence case, no tracking — iOS's own button label.
  // It used to be uppercase with +0.6 tracking, which is the reference product's shape
  // and is the loudest non-native thing an iOS user meets in this app. See the note on
  // the step itself in tokens.json.
  label: { ...text('button'), textAlign: 'center' },
  // A whole step down, not just a smaller size — dropping fontSize alone leaves the
  // line height and tracking of the larger step behind.
  labelSm: text('overline'),
  /**
   * The ghost variant reads as an offer, not as a second command.
   *
   * `ghost` is for "skip", "not now", "log out" — the actions we must present without
   * inviting — and it was set in the same 17/800 as the primary beside it. On the first
   * onboarding slide that put SKIP at exactly the weight of NEXT, so the screen asked
   * two equally loud questions (docs/design/ios-native-audit.md, O9). A whole step down,
   * for the same reason `labelSm` is a step rather than a smaller size.
   */
  labelGhost: text('bodyStrong'),
})
