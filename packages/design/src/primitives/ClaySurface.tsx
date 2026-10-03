import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { createThemeStyles, type ThemeColors } from '../theme.js'
import { depth, elevation, radius as corners, space } from '../tokens.js'

export type ClayTone = 'ice' | 'navy' | 'sky' | 'gold' | 'lime'

/** Decorative material, never a layout container: text can grow beyond its rim.
 * The owner's clay references use a bounded top-left reflection, including on
 * controls. This deliberately supersedes the former flat-button-face rule. */
export function ClaySurface({ tone = 'ice', radius = corners.xl, transparent = false }: {
  tone?: ClayTone
  radius?: number
  /** Keep a caller's semantic fill while adding the same material lighting. */
  transparent?: boolean
}) {
  const { colors, styles } = useThemeValues()
  const material = colors.clay[tone]
  return (
    <View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.shell, { borderRadius: radius }]}>
      {!transparent && <LinearGradient colors={[material.top, material.bottom]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
      <LinearGradient colors={[colors.clay.gloss, colors.clay.clear]}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={[styles.reflection, { borderRadius: radius }]} />
      {/* Fabric and RN Web share this soft inset bevel. It is on the final
          decorative child so gradients never cover the rounded edge lighting. */}
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, boxShadow: [
        { inset: true, offsetX: depth.button, offsetY: depth.button, blurRadius: space[2], color: material.highlight },
        { inset: true, offsetX: -depth.button, offsetY: -space[1], blurRadius: space[2], color: material.shade },
      ] }]} />
    </View>
  )
}

/** Short neutral elevation shared by cards, capsules and navigation furniture. */
export const clayShadow = (colors: ThemeColors): ViewStyle => ({
  shadowColor: colors.clay.shadow,
  shadowOpacity: elevation.clay.opacity,
  shadowRadius: elevation.clay.radius,
  shadowOffset: { width: 0, height: elevation.clay.offset },
  elevation: elevation.clay.android,
})

const useThemeValues = createThemeStyles(colors => ({ colors, styles: StyleSheet.create({
  shell: { overflow: 'hidden' },
  reflection: { position: 'absolute', top: depth.card, start: depth.card, end: depth.card, height: '45%' },
}) }))
