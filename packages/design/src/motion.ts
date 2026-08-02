/**
 * Motion — one place that knows how things move, and when they must not.
 *
 * ## Reduced motion is not a nice-to-have
 *
 * For a user with vestibular sensitivity, a spring that overshoots is nausea, not
 * delight. The OS setting is the user telling us that directly, and it is not
 * advisory. Every animation in this app goes through `useMotion`, which returns
 * durations of zero when the setting is on — so the END STATE still applies and the
 * journey to it does not.
 *
 * That is the important detail: reduced motion means *less movement*, not *no
 * feedback*. A card that never appears because we skipped its animation is a bug, and
 * it is the usual way this gets implemented wrong.
 *
 * ## Why a hook rather than a constant
 *
 * `AccessibilityInfo.isReduceMotionEnabled()` is async and the user can change it
 * while the app is open. Reading it once at module load gives a stale answer to
 * exactly the user who cares most.
 *
 * Spec: docs/design/design-system.md §8 · docs/design/accessibility.md
 */

import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing } from 'react-native'
import { motion } from './tokens.js'

export type MotionStep = keyof typeof motion

/**
 * Whether the user has asked for less movement.
 *
 * Subscribes rather than polling: the setting can change while the app is open, and a
 * user who turns it on mid-session has told us they need it NOW.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    let alive = true
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduced(value)
    })

    // react-native-web returns `undefined` here rather than a subscription — it does
    // not implement this event. Calling `.remove()` on that threw on every unmount of
    // every component that reads reduced motion, which is a crash in a design-system
    // hook that only appears when a screen using it goes away. The first screen to use
    // it was the splash, and it took the app down on the transition out of boot.
    //
    // Optional-chained rather than platform-branched: the contract we depend on is
    // "there may or may not be something to unsubscribe", and that is true of any
    // renderer we have not met yet.
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value: boolean) => setReduced(value),
    ) as { remove?: () => void } | undefined

    return () => {
      alive = false
      subscription?.remove?.()
    }
  }, [])

  return reduced
}

export type Timing = {
  readonly duration: number
  readonly easing: (value: number) => number
  readonly useNativeDriver: true
}

const EASINGS: Record<string, (value: number) => number> = {
  easeOut: Easing.out(Easing.cubic),
  easeInOut: Easing.inOut(Easing.cubic),
  linear: Easing.linear,
  spring: Easing.out(Easing.back(1.4)),
  lottie: Easing.out(Easing.cubic),
}

/**
 * A timing config for a motion token, honouring the reduced-motion setting.
 *
 * Duration collapses to zero rather than the animation being skipped, so the value
 * still lands on its target — the state change happens, it just happens instantly.
 */
export function useTiming(step: MotionStep): Timing {
  const reduced = useReducedMotion()
  const token = motion[step] as { duration: number; easing: string }

  return {
    duration: reduced ? 0 : token.duration,
    easing: EASINGS[token.easing] ?? Easing.out(Easing.cubic),
    useNativeDriver: true,
  }
}

/**
 * A value that animates to a target whenever the target changes.
 *
 * The workhorse: progress bars, opacity fades, scale on press. Returns an
 * `Animated.Value` that is safe to hand straight to a style.
 */
export function useAnimatedTo(target: number, step: MotionStep = 'base'): Animated.Value {
  const timing = useTiming(step)
  const value = useRef(new Animated.Value(target)).current

  useEffect(() => {
    // A zero-duration timing still fires its callback and still sets the value, which
    // is exactly what reduced motion should do.
    Animated.timing(value, { toValue: target, ...timing }).start()
  }, [target, timing, value])

  return value
}

/**
 * The celebration scale — a quick pop, then settle.
 *
 * Never blocks input. A user who wants to start the next question during the
 * animation must be able to, because the tenth celebration is not delightful and the
 * hundredth is an obstacle.
 */
export function useCelebration(trigger: unknown): Animated.Value {
  const reduced = useReducedMotion()
  const scale = useRef(new Animated.Value(1)).current
  const first = useRef(true)

  useEffect(() => {
    // Not on mount — only on a real change. Otherwise every screen pops on arrival.
    if (first.current) {
      first.current = false
      return
    }
    if (reduced) return

    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.08,
        duration: motion.quick.duration,
        easing: EASINGS['easeOut']!,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        damping: motion.expressive.damping ?? 0.7,
        stiffness: motion.expressive.stiffness ?? 180,
        useNativeDriver: true,
      }),
    ]).start()
  }, [trigger, reduced, scale])

  return scale
}
