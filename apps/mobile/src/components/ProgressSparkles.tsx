import { createThemeStyles } from '@worldquest/design'
import { useEffect, useRef } from 'react'
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native'
import { motion, space, useReducedMotion } from '@worldquest/design'
import { Icon } from './Icon.js'

/** Cosmetic feedback for newly earned progress. Never replays an old reward on mount. */
export function ProgressSparkles({ earned }: { earned: number }) {
  const { colors } = useThemeValues()
  const reduced = useReducedMotion()
  const previous = useRef(earned)
  const progress = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const increased = earned > previous.current
    previous.current = earned
    progress.setValue(1)
    if (!increased || reduced) return
    progress.setValue(0)
    const animation = Animated.timing(progress, {
      toValue: 1, duration: motion.celebrate.duration,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    })
    animation.start()
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { animation.stop(); progress.setValue(1) }
    })
    return () => { animation.stop(); subscription.remove() }
  }, [earned, reduced, progress])
  return <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.field}>
    {Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2
      return <Animated.View key={i} style={[styles.spark, {
        opacity: progress.interpolate({ inputRange: [0, .12, .65, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * space[8]] }) },
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * space[8]] }) },
          { scale: progress.interpolate({ inputRange: [0, .25, 1], outputRange: [.4, 1, .5] }) },
        ],
      }]}><Icon name="star" size={space[4]} color={colors.reward.xp} /></Animated.View>
    })}
  </View>
}
const styles = StyleSheet.create({
  field: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  spark: { position: 'absolute', width: space[4], height: space[4] },
})

const useThemeValues = createThemeStyles((colors) => {

  return { colors }
})
