/**
 * Atlas at rest: he breathes and he blinks, and that is all he does unprompted.
 *
 * A character who never moves reads as a sticker. The two smallest motions there are, a
 * slow breath and a blink every few seconds, are what make him read as alive (mascot
 * research, 2026-10-09: "keep idle subtle" — anything bigger is a character asking for
 * attention). They are his only idle motion. The breathing and sheet-stepping idle went
 * in #31 for a reported iPhone stutter, so this one is built to cost nothing:
 *
 * - **One native timing, looped, for both.** A single value runs 0 → 1 over the whole
 *   blink cycle on the native driver; the lids and the breath are each an `interpolate`
 *   of it. The JS thread does no work at all between mount and blur — no timers, no
 *   sequence callbacks — and there is one animation per Atlas, not two.
 * - **Lids: the opacity of an image that is already there.** The blink frame is the
 *   complete pose with closed eyes (`ATLAS_CLAY_BLINK`), laid over the open pose; a blink
 *   is that frame's opacity snapping to 1 and back. Nothing is decoded, laid out or swapped.
 * - **Breath: a transform.** A rise and fall of under two percent, composited on the GPU.
 *
 * Everything stops, at rest with his eyes open, on blur, in the background and under
 * Reduce Motion, and the caller only asks for it where he is big enough to see.
 */

import { useContext, useEffect, useRef } from 'react'
import { Animated, AppState, Easing, Platform } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { motion, useReducedMotion } from '@worldquest/design'

const { duration: BLINK, restMs: RESTS } = motion.blink
const CYCLE = RESTS.reduce((sum, rest) => sum + rest + BLINK, 0)
/** Whole breaths per cycle, so the loop seam falls between two of them. */
const BREATHS = Math.max(1, Math.round(CYCLE / motion.breathe.duration))
/** Points per breath on its curve: enough that a straight line between them never shows. */
const BREATH_STEPS = 12

/**
 * The idle over one cycle, as `interpolate` stops.
 *
 * `lids`: open through each rest, then shut for the blink and open again. Each edge is a
 * snap — a hundredth of the blink, under one frame — because the frames are two whole
 * pictures: faded into each other they show open eyes through closed ones, a ghost. A
 * hair wide rather than zero-length, so every interpolation segment has a width.
 *
 * `breath`: 0 (out) → 1 (in) → 0, `BREATHS` times, on a cosine, so it eases at both
 * ends the way a chest does. Native interpolation has no easing curves, so the curve is
 * sampled into the stops.
 */
export const IDLE = (() => {
  const snap = BLINK / 100
  const lids = { inputRange: [0], outputRange: [0] }
  let at = 0
  for (const rest of RESTS) {
    at += rest
    lids.inputRange.push(at / CYCLE, (at + snap) / CYCLE, (at + BLINK - snap) / CYCLE, (at + BLINK) / CYCLE)
    lids.outputRange.push(0, 1, 1, 0)
    at += BLINK
  }
  const breath = { inputRange: [0], outputRange: [0] }
  for (let step = 1; step <= BREATHS * BREATH_STEPS; step++) {
    breath.inputRange.push(step / (BREATHS * BREATH_STEPS))
    breath.outputRange.push((1 - Math.cos((2 * Math.PI * step) / BREATH_STEPS)) / 2)
  }
  return { lids, breath, cycle: CYCLE, breaths: BREATHS }
})()

/**
 * The idle values: `lids` (0 open, 1 shut: the blink frame's opacity) and `breath`
 * (0 out, 1 in). Both rest at 0 whenever the idle is off.
 */
export function useMascotIdle(enabled: boolean) {
  const reduced = useReducedMotion()
  const navigation = useContext(NavigationContext)
  const cycle = useRef(new Animated.Value(0)).current
  const values = useRef({ lids: cycle.interpolate(IDLE.lids), breath: cycle.interpolate(IDLE.breath) }).current

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
      // The native driver wherever there is one. The web has none, and react-native-web's
      // `Animated.loop` still takes `useNativeDriver: true` at its word, hands the timing a
      // native loop, and the JS timing it falls back to plays once: the web build (design
      // shots, e2e, reviews) showed him breathing for one cycle and then never again.
      loop = Animated.loop(Animated.timing(cycle, {
        toValue: 1, duration: CYCLE, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web', isInteraction: false,
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

  return values
}
