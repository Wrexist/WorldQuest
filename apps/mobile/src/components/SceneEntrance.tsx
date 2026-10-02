import { useContext, useEffect, useRef } from 'react'
import { Animated, AppState, Easing, type ViewProps } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { motion, space, useReducedMotion } from '@worldquest/design'

/** A short arrival; replayKey follows content identity without remounting children. */
export function SceneEntrance({ children, delay = 0, replayKey, style, testID = 'scene-entrance', ...props }: ViewProps & {
  delay?: number
  replayKey?: string | number
}) {
  const reduced = useReducedMotion()
  const navigation = useContext(NavigationContext)
  const progress = useRef(new Animated.Value(1)).current
  const previous = useRef<typeof replayKey | null>(null)

  useEffect(() => {
    const changed = previous.current !== replayKey
    previous.current = replayKey
    let animation: Animated.CompositeAnimation | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const settle = () => {
      if (timer !== undefined) clearTimeout(timer)
      animation?.stop()
      progress.setValue(1)
    }
    const enter = () => {
      settle()
      if (reduced || navigation?.isFocused() === false || AppState.currentState === 'background' || AppState.currentState === 'inactive') return
      progress.setValue(0)
      const start = () => {
        animation = Animated.timing(progress, {
          toValue: 1,
          duration: replayKey === undefined ? motion.expressive.duration : motion.quick.duration,
          easing: Easing.out(Easing.back(1.15)),
          useNativeDriver: true,
          isInteraction: false,
        })
        animation.start()
      }
      if (delay > 0) timer = setTimeout(start, Math.min(delay, motion.expressive.duration))
      else start()
    }
    if (replayKey === undefined || changed) enter()
    const focus = replayKey === undefined ? navigation?.addListener('focus', enter) : undefined
    const blur = navigation?.addListener('blur', settle)
    const state = AppState.addEventListener('change', value => { if (value !== 'active') settle() })
    return () => { settle(); focus?.(); blur?.(); state.remove() }
  }, [delay, navigation, progress, reduced, replayKey])

  return <Animated.View {...props} testID={testID} style={[style, { transform: [
    { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [space[2], 0] }) },
    { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [.98, 1] }) },
  ] }]}>{children}</Animated.View>
}
