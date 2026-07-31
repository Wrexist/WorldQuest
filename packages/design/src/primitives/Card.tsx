/**
 * Card — the content surface. Elevation on a dark canvas is surface lightness plus
 * glow, never a black drop shadow. Spec: docs/design/design-system.md §4
 */
import type { ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, radius, space } from '../tokens.js'

export type CardProps = {
  children: ReactNode
  level?: 1 | 2 | 3
  /** Groups the card into ONE screen-reader element instead of seven. */
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function Card({ children, level = 1, accessibilityLabel, style, testID }: CardProps) {
  return (
    <View
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[styles.base, LEVELS[level], style]}
    >
      {children}
    </View>
  )
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
})
