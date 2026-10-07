/**
 * Confetti that actually moves: a burst out of the centre that falls and fades, once.
 *
 * The perfect-lesson summary showed `celebration/burst` — a still image of confetti — and
 * a still image is the one thing confetti never is. Duolingo's big moments throw pieces
 * out of the character and let them fall (feel audit 2026-10-06, gap 5).
 *
 * ## Layered on the still, never instead of it
 *
 * The still stays underneath as the settled frame. Under Reduce Motion this renders
 * nothing and the still is the whole celebration — "less movement, not less feedback".
 * The screenshot harness renders without effects, where the pieces sit at their end
 * state (faded out), so stills and screenshots show exactly what they showed before.
 *
 * ## Cheap
 *
 * One `Animated.Value` drives every piece through `interpolate`, on the native driver:
 * no state, no re-renders, nothing on the JS thread while it plays. Positions are
 * derived from the piece index rather than `Math.random`, so every burst is the same
 * burst and a test or a screenshot can never catch a different one.
 */

import { useEffect, useRef } from 'react'
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native'
import { motion, radius, space, useReducedMotion, useTheme } from '@worldquest/design'

const PIECES = 28
/** Golden angle: spreads any number of pieces evenly round the circle with no clumps. */
const GOLDEN = 2.399963
/** The burst plays out, then the pieces drift down and fade: two celebrate beats. */
const DURATION = motion.celebrate.duration * 2

export function ConfettiBurst({ size }: { size: number }) {
  const { colors } = useTheme()
  const reduced = useReducedMotion()
  // Seeded at the END, for the reason `useCountUp` seeds at its target: an effect-free
  // render (the screenshot harness) must show the settled state, which is no pieces.
  const progress = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (reduced || AppState.currentState !== 'active') return
    progress.setValue(0)
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    })
    animation.start()
    return () => animation.stop()
  }, [reduced, progress])

  if (reduced) return null

  const palette = [colors.reward.xp, colors.action.primary, colors.action.secondary, colors.status.streak, colors.reward.gem]
  const reach = size / 2
  const fall = size * 0.6

  return (
    <View style={[styles.stage, { width: size, height: size }]} pointerEvents="none" aria-hidden
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="confetti-burst">
      {Array.from({ length: PIECES }, (_, i) => {
        const angle = i * GOLDEN
        // Three rings of distance, so the burst has depth rather than one hard edge.
        const distance = reach * (0.55 + 0.2 * (i % 3))
        const dx = Math.cos(angle) * distance
        const dy = Math.sin(angle) * distance
        const spin = (i % 2 === 0 ? 1 : -1) * (180 + 60 * (i % 4))
        // Out fast in the first third, then gravity: the drop grows with the square of time.
        const translateX = progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, dx, dx * 1.15] })
        const translateY = progress.interpolate({
          inputRange: [0, 0.3, 0.55, 0.8, 1],
          outputRange: [0, dy, dy + fall * 0.15, dy + fall * 0.55, dy + fall],
        })
        const opacity = progress.interpolate({ inputRange: [0, 0.05, 0.7, 1], outputRange: [0, 1, 1, 0] })
        const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${spin}deg`] })
        const long = i % 3 !== 0
        return (
          <Animated.View
            key={i}
            style={[
              styles.piece,
              {
                width: long ? space[2] : space[2] - space[1] / 2,
                height: long ? space[1] : space[2] - space[1] / 2,
                borderRadius: long ? radius.sm : radius.full,
                backgroundColor: palette[i % palette.length],
                opacity,
                transform: [{ translateX }, { translateY }, { rotate }],
              },
            ]}
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  stage: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  piece: { position: 'absolute' },
})
