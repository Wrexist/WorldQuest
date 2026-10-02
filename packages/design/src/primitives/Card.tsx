import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'
import { createThemeStyles } from '../theme.js'
import { depth, radius, space } from '../tokens.js'
import { squircle } from '../shape.js'
import { ClaySurface, clayShadow, type ClayTone } from './ClaySurface.js'

export type CardProps = {
  children: ReactNode
  level?: 1 | 2 | 3
  tone?: ClayTone
  accessibilityLabel?: string
  flat?: boolean
  onPress?: () => void
  role?: 'button' | 'radio' | 'checkbox'
  'aria-checked'?: boolean
  'aria-disabled'?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

/** Milky sculpted surface with intrinsic content height and a bounded reflection. */
export function Card({ children, level = 1, tone, flat = false, accessibilityLabel, onPress, role,
  'aria-checked': checked, 'aria-disabled': disabled, style, testID }: CardProps) {
  const { styles } = useThemeValues()
  const custom = StyleSheet.flatten(style)
  const shared = {
    accessible: accessibilityLabel !== undefined || onPress !== undefined,
    'aria-label': accessibilityLabel,
    testID,
  }
  const surface = [styles.base, !flat && styles.lift, level > 1 && styles.raised, style]
  // Existing semantic card fills (feedback, continent fields) keep their meaning.
  // A named material is explicit; otherwise only its reflection sits over that fill.
  const material = <ClaySurface tone={tone ?? (level > 1 ? 'sky' : 'ice')} radius={typeof custom?.borderRadius === 'number' ? custom.borderRadius : radius.xl}
    transparent={tone === undefined && custom?.backgroundColor !== undefined} />
  if (onPress !== undefined) {
    return (
      <Pressable {...shared} onPress={onPress} disabled={disabled} role={role ?? 'button'}
        aria-checked={checked} aria-disabled={disabled}
        style={({ pressed }) => [surface, styles.interactive, pressed && styles.pressed]}>
        {material}
        {children}
      </Pressable>
    )
  }
  return <View {...shared} style={surface}>{material}{children}</View>
}

const useThemeValues = createThemeStyles(colors => ({ styles: StyleSheet.create({
  base: {
    borderRadius: radius.xl, padding: space[4], ...squircle,
    borderWidth: depth.card, borderColor: colors.clay.clear,
    backgroundColor: colors.bg.surface, flexShrink: 0,
  },
  lift: clayShadow(colors),
  raised: { backgroundColor: colors.bg.surfaceRaised },
  interactive: { borderBottomWidth: depth.button },
  pressed: { transform: [{ translateY: depth.chip }], opacity: 0.88 },
}) }))
