import { createThemeStyles } from '../theme.js'
/**
 * Skeleton — loading placeholders that match the final layout.
 *
 * Never a spinner on primary content. A spinner tells the user to wait; a skeleton
 * tells them what is coming, and prevents the layout shift that makes an app feel
 * cheap. Honours reduced motion by simply not pulsing.
 */
import { useEffect, useRef } from 'react'
import { Animated, AppState, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { motion, radius } from '../tokens.js'
import { squircle } from '../shape.js'
import { useReducedMotion } from '../motion.js'

export type SkeletonProps = {
  width?: number | `${number}%`
  height?: number
  borderRadius?: number
  style?: StyleProp<ViewStyle>
  /** Not for a11y — a skeleton is hidden from it. For a test asserting which state rendered. */
  testID?: string
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = radius.sm,
  style,
  testID,
}: SkeletonProps) {
  const styles = useThemeValues()
  const opacity = useRef(new Animated.Value(0.4)).current
  const reduced = useReducedMotion()

  useEffect(() => {
    opacity.setValue(0.4)
    if (reduced) return
    let loop: Animated.CompositeAnimation | undefined
    const stop = () => { loop?.stop(); loop = undefined; opacity.setValue(0.4) }
    const start = () => {
      stop()
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.8, duration: motion.shimmer.duration, useNativeDriver: true, isInteraction: false }),
          Animated.timing(opacity, { toValue: 0.4, duration: motion.shimmer.duration, useNativeDriver: true, isInteraction: false }),
        ]),
      )
      loop.start()
    }
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') start()
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') start()
      else stop()
    })
    return () => { stop(); subscription?.remove?.() }
  }, [opacity, reduced])

  return (
    <Animated.View
      testID={testID}
      // A skeleton is decorative — the screen announces its own loading state.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // The curve is applied here rather than at each call site because the radius
      // arrives as a prop: callers pass `radius.lg` for a card's placeholder and `36`
      // for the avatar's, and only the first of those wants a squircle. A shape whose
      // radius is half its height is a circle, and there is no straight edge for a
      // continuous curve to ramp into — see shape.ts.
      style={[
        styles.base,
        { width, height, borderRadius, opacity },
        borderRadius * 2 < height && squircle,
        style,
      ]}
    />
  )
}



const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  base: { backgroundColor: colors.bg.surfaceRaised },
})
  return styles
})
