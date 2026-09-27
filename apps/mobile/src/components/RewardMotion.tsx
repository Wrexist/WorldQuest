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
    if (reduced || !active || AppState.currentState === 'background' || AppState.currentState === 'inactive') return
    value.setValue(0)
    // One readable gesture: prepare, lift, settle. Each phase eases to a rest;
    // the old linear multi-bounce timeline changed velocity abruptly at every key.
    // Native transforms only, no layout work or timer-driven frames.
    const phase = (toValue: number, duration: number, easing: (value: number) => number) =>
      Animated.timing(value, { toValue, duration, easing, useNativeDriver: true, isInteraction: false })
    const animation = Animated.sequence([
      phase(.15, motion.quick.duration, Easing.inOut(Easing.cubic)),
      phase(.72, motion.base.duration, Easing.out(Easing.cubic)),
      phase(1, motion.quick.duration, Easing.inOut(Easing.cubic)),
    ])
    animation.start()
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { animation.stop(); value.setValue(1) }
    })
    return () => { animation.stop(); subscription.remove() }
  }, [kind, active, reduced, value])
  return <Animated.View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    testID="reward-motion" style={{ transform: [
      { translateY: value.interpolate({ inputRange: [0, .15, .72, 1], outputRange: kind === 'companion' ? [0, 2, -8, 0] : [4, 5, -2, 0] }) },
      { scale: value.interpolate({ inputRange: [0, .15, .72, 1], outputRange: kind === 'confetti' ? [.65, .62, 1.04, 1] : [1, .94, 1.06, 1] }) },
      { rotate: value.interpolate({ inputRange: [0, .15, .72, 1], outputRange: kind === 'flame' ? ['0deg', '-4deg', '3deg', '0deg'] : ['0deg', '0deg', '0deg', '0deg'] }) },
    ] }}>{children}</Animated.View>
}
