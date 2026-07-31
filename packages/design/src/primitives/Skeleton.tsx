/**
 * Skeleton — loading placeholders that match the final layout.
 *
 * Never a spinner on primary content. A spinner tells the user to wait; a skeleton
 * tells them what is coming, and prevents the layout shift that makes an app feel
 * cheap. Honours reduced motion by simply not pulsing.
 */
import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { colors, radius } from '../tokens.js'

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
          Animated.timing(opacity, { toValue: 0.8, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
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
      style={[styles.base, { width, height, borderRadius, opacity }, style]}
    />
  )
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.bg.surfaceRaised },
})
