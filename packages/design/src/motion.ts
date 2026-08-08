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

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
 * A number that counts up to its target — the XP tally on the summary screen.
 *
 * Returns a plain `number` rather than an `Animated.Value` because the thing being
 * animated here is TEXT CONTENT, and `Animated.Value` can only drive a style. That is
 * the whole reason this hook exists next to `useAnimatedTo` instead of being one of
 * its callers.
 *
 * ## Two details that are easy to get wrong
 *
 * `useNativeDriver: false` is load-bearing. A native-driven value lives on the UI
 * thread and its JS listener never fires — the animation would run perfectly and the
 * number on screen would stay at zero. Reading the value in JS is the entire point, so
 * this one animates in JS.
 *
 * The final value is set from the completion callback as well as from the listener.
 * Listeners are throttled and the last frame is not guaranteed, so without it a
 * "+40 XP" reliably lands on 39.
 *
 * Under reduced motion the target applies immediately — the number is still correct,
 * it just does not travel. And the caller must hide the ticking text from screen
 * readers: a reader announcing "1, 2, 3, …, 40" is worse than useless.
 */
export function useCountUp(target: number, step: MotionStep = 'celebrate'): number {
  const reduced = useReducedMotion()
  const animated = useRef(new Animated.Value(target)).current
  // Seeded with the TARGET, not zero. Anything that renders without running effects
  // sees the true figure: the screenshot harness is a `renderToStaticMarkup` pass, and
  // seeded at zero it published a summary reading "+0 XP" under the headline
  // "Flawless." A component's effect-free render has to be correct, not just early.
  const [value, setValue] = useState(target)

  useIsomorphicLayoutEffect(() => {
    if (reduced) {
      setValue(target)
      return
    }

    const id = animated.addListener(({ value: frame }) => setValue(Math.round(frame)))
    animated.setValue(0)
    setValue(0)
    const token = motion[step] as { duration: number; easing: string }
    Animated.timing(animated, {
      toValue: target,
      duration: token.duration,
      easing: EASINGS[token.easing] ?? Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => setValue(target))

    return () => animated.removeListener(id)
  }, [target, reduced, step, animated])

  return value
}

/**
 * `useLayoutEffect` on a client, `useEffect` where there is no DOM.
 *
 * The count-up above has to reset its seed to zero BEFORE the first paint, or the
 * final figure flashes for a frame and the tally looks like a glitch. That is what
 * `useLayoutEffect` is for — but React warns when it runs during a server render, and
 * this package is rendered server-side by `pnpm screenshot`. The standard isomorphic
 * swap keeps both paths honest without a platform branch inside the hook.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

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

/**
 * The entrance for one item in a list, offset by its position.
 *
 * ## Why this exists
 *
 * `motion.stagger` — `{ stepMs: 40, maxItems: 6 }` — has been in `tokens.json` since the
 * token file was written and had **no readers at all**. It is the third token found in
 * that state, after `bg.canvasGradient` and the pressed/glow accents, and they share a
 * cause: a value can be designed, named, reviewed and committed without one line of code
 * ever asking for it, and nothing in the build says so.
 *
 * What it buys is the difference between a grid that is simply *there* on arrival and one
 * that arrives. Seven continent tiles appearing in the same frame reads as a page load;
 * the same seven arriving 40 ms apart reads as the app dealing you a hand. It is the
 * cheapest motion in the product and the one users never consciously notice.
 *
 * ## `maxItems` is the whole design of it
 *
 * The cascade stops after six. A 65-item collection grid at 40 ms a row would take two
 * and a half seconds to finish arriving, and the user would be looking at row forty
 * wondering why the app is slow — a stagger that runs long stops being polish and starts
 * being latency. Six is the most anyone perceives as one gesture; everything after it
 * lands with the sixth.
 *
 * ## Reduced motion
 *
 * Returns 1 immediately — the item is THERE, it just did not travel. A stagger that
 * skipped the animation by leaving opacity at 0 would hide most of a list from exactly
 * the user who asked for less movement, which is the usual way this gets implemented
 * wrong (see the note at the top of this file).
 */
export function useStagger(index: number, step: MotionStep = 'base'): Animated.Value {
  const reduced = useReducedMotion()
  const timing = useTiming(step)
  const value = useRef(new Animated.Value(reduced ? 1 : 0)).current

  useEffect(() => {
    if (reduced) {
      value.setValue(1)
      return
    }
    const animation = Animated.timing(value, {
      toValue: 1,
      delay: Math.min(index, motion.stagger.maxItems) * motion.stagger.stepMs,
      duration: timing.duration,
      easing: timing.easing,
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
    // `timing` is rebuilt each render; its two fields are what actually matter.
  }, [index, reduced, value, timing.duration, timing.easing])

  return value
}

/**
 * `useStagger`'s value as a ready-made style: fade up into place.
 *
 * A translation of eight points, not twenty. The item should look like it settled, not
 * like it flew in from off-screen — and on a grid, a long travel makes neighbouring
 * tiles cross each other, which is the tell of an effect applied without looking at it.
 */
export function staggerStyle(value: Animated.Value) {
  return {
    opacity: value,
    transform: [
      {
        translateY: value.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
      },
    ],
  }
}
