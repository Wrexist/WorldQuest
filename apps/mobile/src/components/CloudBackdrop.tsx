import { Animated, Image, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { illustration, space, useTheme } from '@worldquest/design'
import { useSceneDrift } from '../hooks/useSceneDrift.js'
import dayClouds from '../../assets/art/clay-clouds/backdrop.webp'
// Night-blue copy baked by scripts/build-clay-clouds.cjs. White clouds faded onto navy
// read as grey smoke under Atlas, so dark mode gets its own art, not a lower opacity.
import nightClouds from '../../assets/art/clay-clouds/backdrop-dark.webp'

/** A quiet sky behind the character, never a hit target or an accessibility stop. */
export function CloudBackdrop({ style, animated = true }: { style?: StyleProp<ViewStyle>; animated?: boolean }) {
  const { mode } = useTheme()
  const drift = useSceneDrift(0.6, animated)
  const clouds = mode === 'dark' ? nightClouds : dayClouds
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
