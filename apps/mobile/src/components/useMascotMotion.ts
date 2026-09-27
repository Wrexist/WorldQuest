import { useContext, useEffect, useRef } from 'react'
import { Animated, AppState, Easing } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { motion, useReducedMotion } from '@worldquest/design'
import type { MascotMood } from './mascotPerformance.js'

/** One owner for playback. Focus resumes quiet eye movement, never replays an earned celebration. */
export function useMascotMotion(mood: MascotMood, visibleSize: number) {
  const reduced = useReducedMotion()
  const navigation = useContext(NavigationContext)
  const clock = useRef(new Animated.Value(1)).current
  const blink = useRef(new Animated.Value(1)).current
  const lastPlayed = useRef<MascotMood | null>(null)
  const largeEnough = visibleSize >= 64
  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined
    let active = true
    const settle = () => { animation?.stop(); clock.setValue(1); blink.setValue(1) }
    const play = () => {
      settle()
      if (!active || reduced || !largeEnough || AppState.currentState !== 'active' || navigation?.isFocused() === false) return
      const timing = (value: Animated.Value, toValue: number, duration: number, easing = Easing.inOut(Easing.cubic)) => Animated.timing(value, { toValue, duration, easing, useNativeDriver: true, isInteraction: false })
      const beat = motion.celebrate.duration
      const firstPerformance = lastPlayed.current !== mood
      lastPlayed.current = mood
      if (firstPerformance) clock.setValue(0)
      animation = Animated.parallel([
        // Linear clock + smooth authored curves: no global easing that bunches up keyframes.
        ...(firstPerformance ? [timing(clock, 1, beat * (mood === 'thinking' ? 4.6 : 3.8), Easing.linear)] : []),
        Animated.sequence([
          Animated.delay(beat * 4.2), timing(blink, .04, beat * .16, Easing.in(Easing.quad)), timing(blink, 1, beat * .3, Easing.out(Easing.cubic)),
          Animated.delay(beat * 7.3), timing(blink, .04, beat * .16, Easing.in(Easing.quad)), timing(blink, 1, beat * .3, Easing.out(Easing.cubic)),
        ]),
      ])
      animation.start()
    }
    play()
    const state = AppState.addEventListener('change', value => { if (value === 'active') play(); else settle() })
    const focus = navigation?.addListener('focus', play)
    const blur = navigation?.addListener('blur', settle)
    return () => { active = false; settle(); state.remove(); focus?.(); blur?.() }
  }, [mood, reduced, navigation, largeEnough, clock, blink])
  return { clock, blink }
}
