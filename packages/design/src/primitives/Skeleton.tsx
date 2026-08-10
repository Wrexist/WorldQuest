/**
 * Skeleton — loading placeholders that match the final layout.
 *
 * Never a spinner on primary content. A spinner tells the user to wait; a skeleton
 * tells them what is coming, and prevents the layout shift that makes an app feel
 * cheap. Honours reduced motion by simply not pulsing.
 */
import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { colors, motion, radius } from '../tokens.js'
import { squircle } from '../shape.js'

export type SkeletonProps = {
  width?: number | `${number}%`
  height?: number
  borderRadius?: number
  style?: StyleProp<ViewStyle>
}

export function Skeleton({ width = '100%', height = 16, borderRadius = radius.sm, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) return
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.8, duration: motion.shimmer.duration, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.4, duration: motion.shimmer.duration, useNativeDriver: true }),
        ]),
      )
      loop.start()
    })
    return () => loop?.stop()
  }, [opacity])

  return (
    <Animated.View
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

const styles = StyleSheet.create({
  base: { backgroundColor: colors.bg.surfaceRaised },
})
