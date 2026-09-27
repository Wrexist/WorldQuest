/** Bounded reward reveal. Content is visible even before effects run or motion is disabled. */
import { useEffect, useRef, type ReactNode } from 'react'
import { Animated, AppState, Easing } from 'react-native'
import { motion, useReducedMotion } from '@worldquest/design'

export function RewardMotion({ children, kind = 'pop', active = true }: {
  children: ReactNode
  kind?: 'pop' | 'confetti' | 'flame' | 'companion'
  active?: boolean
}) {
  const reduced = useReducedMotion()
  const value = useRef(new Animated.Value(1)).current
  useEffect(() => {
    value.setValue(1)
    if (reduced || !active) return
    value.setValue(0)
    const animation = Animated.timing(value, { toValue: 1, duration: motion.celebrate.duration * (kind === 'companion' ? 2 : 1),
      easing: Easing.linear, useNativeDriver: true })
    animation.start()
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { animation.stop(); value.setValue(1) }
    })
    return () => { animation.stop(); subscription.remove() }
  }, [kind, active, reduced, value])
  return <Animated.View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    testID="reward-motion" style={{ transform: [
      { translateY: value.interpolate({ inputRange: [0, .18, .32, .48, .65, .82, 1], outputRange: kind === 'companion' ? [0, -10, 0, -6, 0, -2, 0] : [8, 2, -3, 0, -1, 0, 0] }) },
      { scale: value.interpolate({ inputRange: [0, .55, .8, 1], outputRange: kind === 'confetti' ? [.45, 1.04, 1.01, 1] : [.8, 1.12, .98, 1] }) },
      { rotate: value.interpolate({ inputRange: [0, .3, .6, .8, 1], outputRange: kind === 'flame' ? ['-9deg', '8deg', '-5deg', '3deg', '0deg'] : ['0deg', '0deg', '0deg', '0deg', '0deg'] }) },
    ] }}>{children}</Animated.View>
}
