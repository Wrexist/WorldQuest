import { createThemeStyles } from '../theme.js'
﻿/** A paper surface. Only interactive cards have a physical bottom edge. */
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { depth, radius, space } from '../tokens.js'
import { squircle } from '../shape.js'

export type CardProps = {
  children: ReactNode
  level?: 1 | 2 | 3
  accessibilityLabel?: string
  flat?: boolean
  onPress?: () => void
  role?: 'button' | 'radio' | 'checkbox'
  'aria-checked'?: boolean
  'aria-disabled'?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function Card({ children, level = 1, accessibilityLabel, onPress, role,
  'aria-checked': checked, 'aria-disabled': disabled, style, testID }: CardProps) {
  const { styles } = useThemeValues()
  const shared = {
    accessible: accessibilityLabel !== undefined || onPress !== undefined,
    'aria-label': accessibilityLabel,
    testID,
  }
  const surface = [styles.base, level > 1 && styles.raised, style]
  if (onPress !== undefined) {
    return (
      <Pressable {...shared} onPress={onPress} disabled={disabled} role={role ?? 'button'}
        aria-checked={checked} aria-disabled={disabled}
        style={({ pressed }) => [surface, styles.interactive, pressed && styles.pressed]}>
        {children}
      </Pressable>
    )
  }
  return <View {...shared} style={surface}>{children}</View>
}



const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  base: {
    borderRadius: radius.xl, padding: space[4], ...squircle,
    borderWidth: 1, borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface, flexShrink: 0,
  },
  raised: { backgroundColor: colors.bg.surfaceRaised },
  interactive: { borderBottomWidth: depth.button },
  pressed: { transform: [{ translateY: depth.chip }], backgroundColor: colors.bg.surfacePressed },
})
  return { colors, styles }
})
