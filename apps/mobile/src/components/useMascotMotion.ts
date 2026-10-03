import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Animated, AppState, Easing } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { motion, useReducedMotion } from '@worldquest/design'
import { ATLAS_CLAY, type AtlasClayMood } from '../lib/atlasClay.generated.js'

/** A brief whole-character greeting, then rest. No sheet traversal or idle timers. */
export function useMascotMotion(mood: AtlasClayMood, visibleSize: number, decodedArt: ReadonlySet<unknown>) {
  const reduced = useReducedMotion()
  const navigation = useContext(NavigationContext)
  const gesture = useRef(new Animated.Value(0)).current
  const [boop, setBoop] = useState<number | null>(null)
  const nextBoop = useRef(0)
  const previousBoop = useRef<number | null>(null)
  const playing = boop !== null ? 'laughing' : mood
  const decoded = decodedArt.has(ATLAS_CLAY[playing])

  useEffect(() => {
    const settlingBoop = previousBoop.current !== null && boop === null
    previousBoop.current = boop
    let alive = true
    let active = AppState.currentState === 'active'
    let focused = navigation?.isFocused() !== false
    let animation: Animated.CompositeAnimation | undefined
    const stop = () => { animation?.stop(); animation = undefined; gesture.setValue(0) }
    const play = () => {
      stop()
      if (!alive || !active || !focused || reduced || visibleSize < 48 || !decoded) return
      animation = Animated.timing(gesture, {
        toValue: 1, duration: motion.celebrate.duration,
        easing: Easing.inOut(Easing.ease), useNativeDriver: true, isInteraction: false,
      })
      animation.start()
    }
    // Returning from a laugh is a rest pose, not a second greeting.
    if (!settlingBoop) play()
    const state = AppState.addEventListener('change', value => {
      active = value === 'active'
      if (active) play()
      else { stop(); setBoop(null) }
    })
    const focus = navigation?.addListener('focus', () => { focused = true; play() })
    const blur = navigation?.addListener('blur', () => { focused = false; stop(); setBoop(null) })
    return () => { alive = false; stop(); state?.remove?.(); focus?.(); blur?.() }
  }, [playing, boop, reduced, visibleSize, decoded, navigation, gesture])

  const boopNow = useCallback(() => {
    if (AppState.currentState !== 'active' || navigation?.isFocused() === false) return
    setBoop(++nextBoop.current)
  }, [navigation])
  // A reduced-motion boop changes expression without moving. No repeating timer.
  useEffect(() => {
    // A slow first decode must not spend the entire laugh before its artwork appears.
    if (boop === null || !decoded) return
    const timer = setTimeout(() => setBoop(current => current === boop ? null : current), motion.celebrate.duration * 2)
    return () => clearTimeout(timer)
  }, [boop, decoded])
  return { gesture, playing, boopNow, reduced }
}
