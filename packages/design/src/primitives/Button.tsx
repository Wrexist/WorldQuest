import { createThemeStyles } from '../theme.js'
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
import { depth, radius, space } from '../tokens.js'
import { squircle } from '../shape.js'
import { text } from '../typography.js'
import { press3d, useFacePress } from './press3d.js'
import { ClaySurface, clayShadow, type ClayTone } from './ClaySurface.js'

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'ghost' | 'discovery' | 'adventure'
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

/** Face heights; the socket always reserves at least 44pt for touch input,
 * including flat buttons and themes with a shallow raised edge. */
const HEIGHTS: Record<ButtonSize, number> = { sm: 40, md: 48, lg: 54 }

type Skin = {
  face: string
  edge: string
  label: string
  outlined?: boolean
  /** A soft bloom behind the button. Primary only — see the note at the render. */
  tone?: ClayTone
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
  const { colors, SKINS, lift } = useThemeValues()
  const isInert = disabled || loading
  const flat = variant === 'ghost'
  const edgeDepth = flat ? 0 : depth.button
  const { translateY, onPressIn, onPressOut } = useFacePress(edgeDepth, isInert)

  const skin = SKINS[variant]
  const faceHeight = HEIGHTS[size]
  const socketHeight = Math.max(44, faceHeight + edgeDepth)

  const faceColor = isInert && !flat ? colors.action.disabled : skin.face
  const edgeColor = isInert && !flat ? colors.action.disabledEdge : skin.edge
  const labelColor = isInert ? colors.text.tertiary : skin.label

  return (
    <Pressable
      accessible
      role="button"
      aria-label={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      aria-disabled={isInert}
      aria-busy={loading}
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
          !flat && !isInert && lift,
          // The outlined variant draws the edge colour as a ring too, so the shape is
          // closed on all four sides rather than just underneath.
          skin.outlined === true && !isInert && { borderWidth: 2, borderColor: edgeColor },
        ]}
      >
        {!flat && !isInert && variant !== 'destructive' && <ClaySurface tone={skin.tone ?? 'ice'} radius={radius.full} transparent={skin.tone === undefined} />}
        {/* The label stays mounted while loading so the button does not change width. */}
        {loading ? (
          <ActivityIndicator color={labelColor} />
        ) : (
          <Text
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
  edge: { borderRadius: radius.full, ...squircle },
  face: {
    borderRadius: radius.full,
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
  label: { ...text('button', { weight: '800' }), textAlign: 'center', flexShrink: 1, minWidth: 0 },
  /**
   * A whole step down, not just a smaller size — dropping fontSize alone leaves the
   * line height of the larger step behind.
   *
   * It was `text('overline')`, which is 12/800 UPPERCASE with a point of tracking, and
   * that carried the case along with the size: the Shop shipped a column of buttons
   * reading BUY / BUY / BUY / WEAR beside a `button` step that had just had its
   * uppercase removed for being the loudest non-native thing in the app
   * (docs/design/ios-native-audit.md, N11). Half the fix is not a fix — a small button
   * is still a button, and iOS has never uppercased one at any size.
   *
   * `overline` keeps its casing and earns it: it is the grouped-list section header,
   * which is exactly how iOS sets those. Borrowing that step for a label the user taps
   * borrowed a decision that was made about something else.
   *
   * So: `caption` at the button weight — 13/800, no tracking, sentence case. The same
   * shape as the primary label, one rung down the scale.
   */
  labelSm: text('caption', { weight: '800' }),
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

const useThemeValues = createThemeStyles((colors) => {
  const SKINS: Record<ButtonVariant, Skin> = {
  discovery: {
    face: colors.course.face,
    edge: colors.course.bannerEdge,
    label: colors.course.ink,
    tone: 'lime',
  },
  primary: {
    face: colors.action.primaryFace,
    edge: colors.action.primaryEdge,
    label: colors.text.onPrimary,
    tone: 'lime',
  },
  secondary: {
    face: colors.action.secondaryFace,
    edge: colors.action.secondaryEdge,
    label: colors.clay.sky.ink,
    tone: 'sky',
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
    tone: 'ice',
  },
  // Genuinely flat. For "skip", "not now", "log out" — the actions we must offer
  // without inviting.
  ghost: { face: 'transparent', edge: 'transparent', label: colors.text.secondary },
  adventure: { face: colors.leagueAdventure.button, edge: colors.leagueAdventure.buttonEdge, label: colors.leagueAdventure.buttonText, tone: 'navy' },
}
  return { colors, SKINS, lift: clayShadow(colors) }
})
