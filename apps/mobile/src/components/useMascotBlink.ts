/**
 * Atlas blinks: the one idle motion he has.
 *
 * A character who never blinks reads as a sticker; a blink every few seconds is the
 * cheapest thing that makes him read as alive (mascot research, 2026-10-09: "keep idle
 * subtle"). It is the only idle loop on him. The breathing and sheet-stepping idle went
 * in #31 for a reported iPhone stutter, so this one is built to cost nothing:
 *
 * - **One native timing, looped.** A single value runs 0 → 1 over the whole cycle on the
 *   native driver and the lids are an `interpolate` of it, so the JS thread does no work
 *   at all between mount and blur — no timers, no sequence callbacks.
 * - **Opacity of an image that is already there.** The blink frame is the complete pose
 *   with closed eyes (`ATLAS_CLAY_BLINK`), laid over the open pose; a blink is that
 *   frame's opacity snapping to 1 and back. Nothing is decoded, laid out or swapped.
 *
 * It stops, with his eyes open, on blur, in the background and under Reduce Motion, and
 * the caller only asks for it where he is big enough to see it blink.
 */

import { useContext, useEffect, useRef } from 'react'
import { Animated, AppState, Easing } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { motion, useReducedMotion } from '@worldquest/design'

const { duration: BLINK, restMs: RESTS } = motion.blink
const CYCLE = RESTS.reduce((sum, rest) => sum + rest + BLINK, 0)

/**
 * The lids over one cycle, as `interpolate` stops: open through each rest, then shut for
 * the blink and open again. Each edge is a snap — a 1/100 of the blink, under one frame —
 * because the frames are two whole pictures: faded into each other they show open eyes
 * through closed ones, a ghost. A hair wide rather than zero-length, so every
 * interpolation segment has a width.
 */
export const LIDS = (() => {
  const snap = BLINK / 100
  const inputRange = [0]
  const outputRange = [0]
  let at = 0
  for (const rest of RESTS) {
    at += rest
    inputRange.push(at / CYCLE, (at + snap) / CYCLE, (at + BLINK - snap) / CYCLE, (at + BLINK) / CYCLE)
    outputRange.push(0, 1, 1, 0)
    at += BLINK
  }
  return { inputRange, outputRange, cycle: CYCLE }
})()

/** 0 = eyes open, 1 = closed: the blink frame's opacity. */
export function useMascotBlink(enabled: boolean) {
  const reduced = useReducedMotion()
  const navigation = useContext(NavigationContext)
  const cycle = useRef(new Animated.Value(0)).current
  const lids = useRef(cycle.interpolate({ inputRange: LIDS.inputRange, outputRange: LIDS.outputRange })).current

  useEffect(() => {
    cycle.setValue(0)
    if (!enabled || reduced) return
    let active = AppState.currentState === 'active'
    let focused = navigation?.isFocused() !== false
    let loop: Animated.CompositeAnimation | undefined
    const stop = () => { loop?.stop(); loop = undefined; cycle.setValue(0) }
    const play = () => {
      stop()
      if (!active || !focused) return
      loop = Animated.loop(Animated.timing(cycle, {
        toValue: 1, duration: CYCLE, easing: Easing.linear, useNativeDriver: true, isInteraction: false,
      }))
      loop.start()
    }
    play()
    const state = AppState.addEventListener('change', value => { active = value === 'active'; play() })
    const focus = navigation?.addListener('focus', () => { focused = true; play() })
    const blur = navigation?.addListener('blur', () => { focused = false; play() })
    // `?.` twice: react-native-web can hand back nothing to unsubscribe (see motion.test).
    return () => { stop(); state?.remove?.(); focus?.(); blur?.() }
  }, [enabled, reduced, navigation, cycle])

  return lids
}
