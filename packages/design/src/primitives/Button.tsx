/**
 * Button — the primary interactive primitive.
 *
 * The accessible path is the easy path: `label` is required and doubles as the
 * accessibility label, so a Button without one is a TYPE ERROR rather than a review
 * comment. That is deliberate — a11y that depends on remembering gets forgotten.
 *
 * Spec: docs/design/design-system.md §11
 */

import { useCallback, useRef } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { colors, motion, radius, space } from '../tokens.js'
import { text } from '../typography.js'

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

const HEIGHTS: Record<ButtonSize, number> = { sm: 36, md: 48, lg: 56 }

const BACKGROUNDS: Record<ButtonVariant, string> = {
  primary: colors.action.primary,
  secondary: colors.action.secondary,
  tertiary: 'transparent',
  destructive: colors.action.destructive,
  ghost: 'transparent',
}

const PRESSED: Record<ButtonVariant, string> = {
  primary: colors.action.primaryPressed,
  secondary: colors.action.secondaryPressed,
  tertiary: colors.bg.surfacePressed,
  destructive: colors.action.destructive,
  ghost: colors.bg.surfacePressed,
}

const LABEL_COLORS: Record<ButtonVariant, string> = {
  primary: colors.text.onAccent,
  secondary: colors.text.onAccent,
  tertiary: colors.text.primary,
  destructive: colors.text.onAccent,
  ghost: colors.text.secondary,
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
  const scale = useRef(new Animated.Value(1)).current
  const isInert = disabled || loading

  const animateTo = useCallback(
    (to: number) => {
      AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
        if (reduced) return
        Animated.timing(scale, {
          toValue: to,
          duration: motion.instant.duration,
          useNativeDriver: true,
        }).start()
      })
    },
    [scale],
  )

  return (
    <Animated.View style={[{ transform: [{ scale }] }, fullWidth && styles.fullWidth, style]}>
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isInert, busy: loading }}
        // Reach the 44pt minimum target without growing the visual.
        hitSlop={Math.max(0, (44 - HEIGHTS[size]) / 2)}
        disabled={isInert}
        onPress={onPress}
        onPressIn={() => animateTo(0.96)}
        onPressOut={() => animateTo(1)}
        testID={testID}
        style={({ pressed }) => [
          styles.base,
          { height: HEIGHTS[size], backgroundColor: BACKGROUNDS[variant] },
          variant === 'tertiary' && styles.tertiaryBorder,
          pressed && !isInert && { backgroundColor: PRESSED[variant] },
          disabled && styles.disabled,
          variant === 'primary' && !isInert && styles.accentGlow,
        ]}
      >
        {/* The label stays mounted while loading so the button does not change width. */}
        <View style={styles.content}>
          {loading ? (
            <ActivityIndicator color={LABEL_COLORS[variant]} />
          ) : (
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: disabled ? colors.text.tertiary : LABEL_COLORS[variant] },
                size === 'sm' && styles.labelSm,
              ]}
            >
              {label}
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[5],
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  label: {
    ...text('bodyStrong'),
    textAlign: 'center',
  },
  // A whole step down, not just a smaller size — dropping fontSize alone leaves the
  // line height and letter spacing of the larger step behind.
  labelSm: text('caption', { weight: '600' }),
  tertiaryBorder: { borderWidth: 1, borderColor: colors.border.subtle },
  // elevation must be zeroed too — an iOS shadowOpacity of 0 does nothing on
  // Android, so a disabled button would keep floating there.
  disabled: { backgroundColor: colors.action.disabled, shadowOpacity: 0, elevation: 0 },
  accentGlow: {
    shadowColor: colors.action.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    // iOS shadows do not render on Android — always pair with elevation.
    elevation: 8,
  },
})
