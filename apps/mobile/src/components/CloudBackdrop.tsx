import { Animated, Image, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { illustration, space, useDrift, useTheme } from '@worldquest/design'
import clouds from '../../assets/art/clay-clouds/backdrop.webp'

/** A quiet sky behind the character, never a hit target or an accessibility stop. */
export function CloudBackdrop({ style }: { style?: StyleProp<ViewStyle> }) {
  const { mode } = useTheme()
  const drift = useDrift(0.6)
  return <Animated.View testID="cloud-backdrop" pointerEvents="none" aria-hidden
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.clouds, { opacity: illustration.cloudOpacity[mode], transform: [
      { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -space[1]] }) },
    ] }, style]}>
    <Image source={typeof clouds === 'string' ? { uri: clouds } : clouds} alt="" resizeMode="contain"
      style={styles.image} />
  </Animated.View>
}

const styles = StyleSheet.create({
  clouds: { position: 'absolute', start: 0, end: 0, bottom: 0, height: '100%', maxHeight: space[9] * 3 },
  // Preserve the artwork's proportions when enlarged copy makes the hero taller.
  image: { position: 'absolute', bottom: 0, width: '100%', height: 'auto', aspectRatio: 3 },
})
