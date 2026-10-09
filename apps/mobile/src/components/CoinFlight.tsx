/**
 * Coins that fly into the top bar's counter when the balance goes up.
 *
 * A reward should arrive somewhere, not just change a number: Duolingo's coins and gems
 * arc into the counter they join, and the counter jumps as they land (feel audit
 * 2026-10-06, gap 2). Here six coins rise from below the bar into the coin counter, one
 * after another; when the last one lands the counter pops and the coin sound plays.
 *
 * ## Only where it can be seen, even on a Home built afresh
 *
 * A lesson's coins are credited while its summary is still covering Home, and coming
 * back from a lesson REBUILDS Home: the bar that saw the old balance is gone, and the new
 * one has nothing to compare against. So the counter pop from #34 never played after a
 * lesson at all (traced in the web build, 2026-10-09). `useArrivals` keeps the balance
 * the bar last showed outside any one bar, and counts a rise only once a bar is on
 * screen to show it; the flight then waits a beat more (`motion.base`) for the screen
 * that was on top to finish leaving.
 *
 * ## Cheap, and never in the way
 *
 * One `Animated.Value` drives every coin through `interpolate` on the native driver, as
 * `ConfettiBurst` does; positions come from the coin's index, never from `Math.random`.
 * Decorative and untouchable. Under Reduce Motion nothing flies: the counter simply
 * shows the new number, which is all the information there is.
 */

import { useContext, useEffect, useRef, useState } from 'react'
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { motion, space, useReducedMotion } from '@worldquest/design'
import { HeaderJewel } from './HeaderJewel.js'

const COINS = 6
/** Each coin leaves this much of the flight after the one before it. */
const STAGGER = 0.08
/** And travels for the rest. */
const TRAVEL = 1 - STAGGER * (COINS - 1)

/**
 * Interpolation stops from (input, output) pairs, dropping a pair whose input repeats
 * the one before it: the first coin starts at 0 and the last ends at 1, and a
 * zero-width segment is not something to hand the native driver.
 */
function stops(pairs: ReadonlyArray<readonly [number, number]>) {
  const kept = pairs.filter(([input], i) => i === 0 || input > pairs[i - 1]![0])
  return { inputRange: kept.map(([input]) => input), outputRange: kept.map(([, output]) => output) }
}

/**
 * What each counter last showed on screen, by name. Module state on purpose: it has to
 * outlive the bar that showed it (see the header). Empty at launch, so opening the app
 * is never "a rise".
 */
const lastShown = new Map<string, number>()

/** Tests only: forget what every counter last showed. */
export function forgetShownCounters(): void {
  lastShown.clear()
}

/**
 * How many times `value` has gone up since a counter named `name` last showed it, counted
 * only while this screen is in view: a rise made with another screen on top waits for
 * this one to be shown. Every bar showing the same counter shares one memory, so a rise
 * is celebrated once, by whichever bar is seen first.
 */
export function useArrivals(name: string, value: number | undefined): number {
  const navigation = useContext(NavigationContext)
  const [arrivals, setArrivals] = useState(0)
  useEffect(() => {
    if (value === undefined) return
    const settle = () => {
      const before = lastShown.get(name)
      lastShown.set(name, value)
      if (before !== undefined && value > before) setArrivals(count => count + 1)
    }
    if (navigation === undefined || navigation.isFocused()) {
      settle()
      return
    }
    return navigation.addListener('focus', settle)
  }, [name, value, navigation])
  return arrivals
}

/**
 * Plays once per change of `trigger` (never on mount), then calls `onLanded`. Under
 * Reduce Motion, or in the background, it lands at once without flying.
 */
export function CoinFlight({ trigger, onLanded }: { trigger: number; onLanded: () => void }) {
  const reduced = useReducedMotion()
  const progress = useRef(new Animated.Value(1)).current
  const [flying, setFlying] = useState(false)
  const last = useRef(trigger)
  // Read at landing time: the caller's handler may change between start and landing.
  const landed = useRef(onLanded)
  landed.current = onLanded

  useEffect(() => {
    if (Object.is(last.current, trigger)) return
    last.current = trigger
    if (reduced || AppState.currentState !== 'active') {
      landed.current()
      return
    }
    progress.setValue(0)
    setFlying(true)
    const animation = Animated.timing(progress, {
      toValue: 1,
      // Long enough for Home to finish bringing the current step into view: a first cut
      // started with the scroll, and the coins flew over a landscape still sliding by.
      delay: motion.expressive.duration + motion.base.duration,
      duration: motion.celebrate.duration,
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    })
    animation.start(({ finished }) => {
      setFlying(false)
      if (finished) landed.current()
    })
    return () => animation.stop()
  }, [trigger, reduced, progress])

  if (!flying) return null
  return (
    <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={styles.stage} testID="coin-flight">
      {Array.from({ length: COINS }, (_, i) => {
        const start = i * STAGGER
        const end = start + TRAVEL
        // From below and to the start side of the counter, fanned so no two coins share a
        // line: the bar sits at the top, so below is where a reward comes from. From around
        // the middle of the screen: the first cut started a hand's width under the bar, and
        // six small coins over the unit's landscape were easy to miss.
        const dx = -(space[8] + (i % 3) * space[8])
        const dy = space[9] * 3 + (i % 2) * space[8]
        // Fast up, then easing in: most of the climb in the first half of each coin's trip.
        const at = (fraction: number) => start + TRAVEL * fraction
        return (
          <Animated.View key={i} style={[styles.coin, {
            opacity: progress.interpolate(stops([[0, 0], [start, 0], [at(0.1), 1], [at(0.85), 1], [end, 0], [1, 0]])),
            transform: [
              { translateX: progress.interpolate(stops([[0, dx], [start, dx], [at(0.5), dx * 0.3], [end, 0], [1, 0]])) },
              { translateY: progress.interpolate(stops([[0, dy], [start, dy], [at(0.5), dy * 0.2], [end, 0], [1, 0]])) },
              { scale: progress.interpolate(stops([[0, 1.4], [start, 1.4], [end, 0.7], [1, 0.7]])) },
            ],
          }]}>
            <HeaderJewel name="coins" size={space[6]} />
          </Animated.View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  // Sized to the counter's coin, so a coin at rest sits exactly on it.
  stage: { position: 'absolute', start: space[1], top: space[1], width: space[6], height: space[6] },
  coin: { position: 'absolute', start: 0, top: 0 },
})
