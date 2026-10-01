import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Animated, AppState } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { useReducedMotion } from '@worldquest/design'
import { ATLAS_SEQUENCE, type AtlasGlobeMood } from '../lib/atlasGlobe.generated.js'

const LAST = ATLAS_SEQUENCE.frames - 1
const FILM_MS = (ATLAS_SEQUENCE.frames / ATLAS_SEQUENCE.fps) * 1000

/**
 * How long Atlas rests between performances. He plays his mood once when he appears,
 * then again every so often while he is on screen — enough to feel alive, never so
 * often that a lesson summary becomes a cartoon you have to wait for. Sleepy dozes
 * continuously, because nodding off IS the resting state.
 */
const REST_MS: Record<AtlasGlobeMood, number> = {
  welcome: 7000, celebrate: 9000, thinking: 8000, resting: 6000, encouraging: 8000,
  laughing: 8000, surprised: 10000, proud: 9000, sleepy: 600, wink: 9000,
}

/**
 * One owner for playback of the rendered film. Stepped, not tweened: each frame is a
 * Blender render, so the value moves in whole frames at the film's own 18 fps.
 *
 * Stops at rest (frame 0, which is also the last frame's pose) when the app backgrounds,
 * the screen blurs, the character is too small to read, or Reduce Motion is on — where
 * the caller draws the still instead.
 */
export function useMascotMotion(mood: AtlasGlobeMood, visibleSize: number, decodedSheets: Readonly<Record<string, boolean>>) {
  const reduced = useReducedMotion()
  const navigation = useContext(NavigationContext)
  const frame = useRef(new Animated.Value(0)).current
  const [booping, setBooping] = useState(false)
  const playing = booping ? 'laughing' : mood
  const largeEnough = visibleSize >= 48
  // A cold image decode must not swallow the performance before anyone can see it.
  const decoded = decodedSheets[playing] === true

  useEffect(() => {
    let alive = true
    let film: Animated.CompositeAnimation | undefined
    let rest: ReturnType<typeof setTimeout> | undefined
    const stop = () => { film?.stop(); if (rest) clearTimeout(rest); frame.setValue(0) }
    const play = () => {
      if (!alive || reduced || !largeEnough || !decoded) return
      if (AppState.currentState !== 'active' || navigation?.isFocused() === false) return
      frame.setValue(0)
      // Stepped: whole frames only, or the sheet would slide between cells.
      film = Animated.timing(frame, { toValue: LAST, duration: FILM_MS, easing: value => Math.floor(value * LAST) / LAST, useNativeDriver: true, isInteraction: false })
      film.start(({ finished }) => {
        if (!alive || !finished) return
        frame.setValue(0)
        if (booping) { setBooping(false); return }
        rest = setTimeout(play, REST_MS[playing])
      })
    }
    play()
    const state = AppState.addEventListener('change', value => { if (value === 'active') play(); else stop() })
    const focus = navigation?.addListener('focus', play)
    const blur = navigation?.addListener('blur', stop)
    return () => { alive = false; stop(); state.remove(); focus?.(); blur?.() }
  }, [playing, booping, reduced, largeEnough, decoded, navigation, frame])

  /** Tap: he laughs, whatever he was doing, then goes back to it. */
  const boopNow = useCallback(() => setBooping(true), [])
  // Under Reduce Motion the laughing still is shown for a moment instead of the film.
  useEffect(() => {
    if (!booping || !reduced) return
    const timer = setTimeout(() => setBooping(false), 2000)
    return () => clearTimeout(timer)
  }, [booping, reduced])

  return { frame, playing, booping, boopNow, still: reduced || !largeEnough }
}
