import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Animated, AppState, Easing } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { motion, useReducedMotion } from '@worldquest/design'
import type { MascotMood } from './mascotPerformance.js'

/**
 * One owner for playback. Focus resumes the quiet idle life, never replays an earned
 * celebration; backgrounding, blurring or Reduce Motion stops everything at rest.
 *
 * Three clocks: `clock` plays the mood's entrance once, `idle` loops the small life
 * afterwards (a wink, a glance, a hop), and `boop` plays a laugh when someone taps him.
 */
export function useMascotMotion(mood: MascotMood, visibleSize: number) {
  const reduced = useReducedMotion()
  const navigation = useContext(NavigationContext)
  const clock = useRef(new Animated.Value(1)).current
  const idle = useRef(new Animated.Value(0)).current
  const boop = useRef(new Animated.Value(1)).current
  const blink = useRef(new Animated.Value(1)).current
  const lastPlayed = useRef<MascotMood | null>(null)
  const boopAnimation = useRef<Animated.CompositeAnimation | null>(null)
  const [booping, setBooping] = useState(false)
  const largeEnough = visibleSize >= 64
  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined
    let active = true
    const settle = () => { animation?.stop(); clock.setValue(1); idle.setValue(0); blink.setValue(1) }
    const play = () => {
      settle()
      if (!active || reduced || !largeEnough || AppState.currentState !== 'active' || navigation?.isFocused() === false) return
      const timing = (value: Animated.Value, toValue: number, duration: number, easing = Easing.inOut(Easing.cubic)) => Animated.timing(value, { toValue, duration, easing, useNativeDriver: true, isInteraction: false })
      const beat = motion.celebrate.duration
      const firstPerformance = lastPlayed.current !== mood
      lastPlayed.current = mood
      if (firstPerformance) clock.setValue(0)
      const entrance = beat * (mood === 'thinking' ? 4.6 : mood === 'sleepy' ? 5.2 : 3.8)
      animation = Animated.parallel([
        // Linear clock + smooth authored curves: no global easing that bunches up keyframes.
        ...(firstPerformance ? [timing(clock, 1, entrance, Easing.linear)] : []),
        // The idle life starts once the entrance is over, and repeats slowly. Its track
        // is at rest at both ends, so each lap joins the next without a pop.
        Animated.sequence([
          Animated.delay(firstPerformance ? entrance + beat : beat * 2),
          Animated.loop(Animated.sequence([
            timing(idle, 1, beat * (mood === 'sleepy' ? 6 : 9), Easing.linear),
            Animated.timing(idle, { toValue: 0, duration: 0, useNativeDriver: true, isInteraction: false }),
            Animated.delay(beat * 2),
          ])),
        ]),
        Animated.loop(Animated.sequence([
          Animated.delay(beat * 4.2), timing(blink, .04, beat * .16, Easing.in(Easing.quad)), timing(blink, 1, beat * .3, Easing.out(Easing.cubic)),
          Animated.delay(beat * 7.3), timing(blink, .04, beat * .16, Easing.in(Easing.quad)), timing(blink, 1, beat * .3, Easing.out(Easing.cubic)),
        ])),
      ])
      animation.start()
    }
    play()
    const state = AppState.addEventListener('change', value => { if (value === 'active') play(); else settle() })
    const focus = navigation?.addListener('focus', play)
    const blur = navigation?.addListener('blur', settle)
    return () => { active = false; settle(); state.remove(); focus?.(); blur?.() }
  }, [mood, reduced, navigation, largeEnough, clock, idle, blink])

  /** Tap: a laugh, whatever he was doing. Under Reduce Motion the laughing face, held still. */
  const boopNow = useCallback(() => {
    boopAnimation.current?.stop()
    setBooping(true)
    const beat = motion.celebrate.duration
    if (reduced) {
      const timer = setTimeout(() => setBooping(false), beat * 2)
      boopAnimation.current = { start: () => {}, stop: () => clearTimeout(timer), reset: () => {} }
      return
    }
    boop.setValue(0)
    boopAnimation.current = Animated.timing(boop, { toValue: 1, duration: beat * 2.4, easing: Easing.linear, useNativeDriver: true, isInteraction: false })
    boopAnimation.current.start(({ finished }) => { if (finished) setBooping(false) })
  }, [reduced, boop])
  useEffect(() => () => boopAnimation.current?.stop(), [])

  return { clock, idle, boop, blink, booping, boopNow }
}
