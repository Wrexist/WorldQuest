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

/** Face heights. The socket adds the edge on top of these, so the tap target is taller. */
const HEIGHTS: Record<ButtonSize, number> = { sm: 36, md: 48, lg: 54 }

type Skin = { face: string; edge: string; label: string; outlined?: boolean }

const SKINS: Record<ButtonVariant, Skin> = {
  primary: {
    face: colors.action.primary,
    edge: colors.action.primaryEdge,
    label: colors.text.onAccent,
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
            style={[styles.label, size === 'sm' && styles.labelSm, { color: labelColor }]}
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
  edge: { borderRadius: radius.lg },
  face: {
    borderRadius: radius.lg,
    paddingVertical: space[2],
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space[2],
    paddingHorizontal: space[5],
  },
  // The `button` step is uppercase with open tracking — the shape of a label you are
  // meant to hit rather than read.
  label: { ...text('button'), textAlign: 'center' },
  // A whole step down, not just a smaller size — dropping fontSize alone leaves the
  // line height and tracking of the larger step behind.
  labelSm: text('overline'),
})
