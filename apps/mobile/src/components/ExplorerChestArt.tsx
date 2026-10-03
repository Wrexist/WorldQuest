import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, AppState, Easing, Image, StyleSheet, View } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { motion, space, useReducedMotion } from '@worldquest/design'
import { EXPLORER_CHEST, EXPLORER_CHEST_SEQUENCE } from '../lib/explorerChest.generated.js'

const LAST = EXPLORER_CHEST_SEQUENCE.frames - 1
const FRAMES = Array.from({ length: EXPLORER_CHEST_SEQUENCE.frames }, (_, index) => index)
const hidden = { 'aria-hidden': true, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
const source = (asset: number | string) => typeof asset === 'string' ? { uri: asset } : asset
type Phase = 'closed' | 'waiting' | 'opening' | 'opened'

/** Decorative path/list art needs one image, with no animation values or subscriptions. */
export function ExplorerChestStill({ size, opened = false }: { size: number; opened?: boolean }) {
  return <View {...hidden} pointerEvents="none" testID="explorer-chest-art" style={{ width: size, height: size }}>
    <Image testID={opened ? 'explorer-chest-opened' : 'explorer-chest-still'} source={source(opened ? EXPLORER_CHEST.opened : EXPLORER_CHEST.closed)}
      alt="" {...hidden} resizeMode="contain" style={{ width: size, height: size }} />
  </View>
}

export type ExplorerChestArtProps = {
  size: number
  opened?: boolean
  /** Only celebration screens opt in. A restored reward normally shows its final pose. */
  revealOnMount?: boolean
  /** Visual completion only; claiming/awarding stays with the caller's existing action. */
  onReveal?: (() => void) | undefined
  /** A fresh, visible reveal. Not called for a restored receipt or a hidden screen. */
  onCelebrate?: (() => void) | undefined
  /** Increasing this number gives the closed or opened chest a playful nudge. */
  nudge?: number
  testID?: string
}

/** Shared Blender film and high-resolution stills. The art never changes a reward. */
export function ExplorerChestArt({ size, opened = false, revealOnMount = false, onReveal, onCelebrate, nudge = 0, testID = 'explorer-chest-art' }: ExplorerChestArtProps) {
  const reduced = useReducedMotion()
  const navigation = useContext(NavigationContext)
  const frame = useRef(new Animated.Value(opened && !revealOnMount ? LAST : 0)).current
  // iOS interpolates native timing samples after easing. Floor in the native graph
  // so fractional samples cannot slide the crop between neighboring sheet cells.
  const wholeFrame = useMemo(() => Animated.subtract(frame, Animated.modulo(frame, 1)), [frame])
  const bounce = useRef(new Animated.Value(1)).current
  const [phase, setPhase] = useState<Phase>(opened ? revealOnMount ? 'waiting' : 'opened' : 'closed')
  const [decoded, setDecoded] = useState(false)
  const [failed, setFailed] = useState(false)
  const previousOpened = useRef(opened)
  const pending = useRef(opened && revealOnMount)
  const notified = useRef(false)
  const previousNudge = useRef(nudge)
  const callbacks = useRef({ onReveal, onCelebrate })
  callbacks.current = { onReveal, onCelebrate }

  useEffect(() => {
    const newlyOpened = opened && !previousOpened.current
    previousOpened.current = opened
    if (!opened) {
      pending.current = false
      notified.current = false
      frame.setValue(0)
      setPhase('closed')
      return
    }
    if (newlyOpened) pending.current = true
    let alive = true
    let animation: Animated.CompositeAnimation | undefined
    let decodeTimer: ReturnType<typeof setTimeout> | undefined
    const visible = () => navigation?.isFocused() !== false && AppState.currentState !== 'background' && AppState.currentState !== 'inactive'
    const finish = (celebrate: boolean) => {
      if (!alive) return
      if (decodeTimer !== undefined) clearTimeout(decodeTimer)
      animation?.stop()
      frame.setValue(LAST)
      setPhase('opened')
      if (notified.current) return
      notified.current = true
      const fresh = pending.current
      pending.current = false
      callbacks.current.onReveal?.()
      if (fresh && celebrate && visible()) callbacks.current.onCelebrate?.()
    }

    // Install these even while decoding: a hidden screen must not leave a receipt waiting.
    const blur = navigation?.addListener('blur', () => finish(false))
    const state = AppState.addEventListener('change', value => { if (value !== 'active') finish(false) })
    if (!pending.current || reduced || failed || !visible()) finish(visible())
    else if (!decoded) {
      setPhase('waiting')
      // The final still and receipt remain usable even if a web image request never settles.
      decodeTimer = setTimeout(() => finish(visible()), motion.celebrate.duration * 3)
    } else {
      setPhase('opening')
      frame.setValue(0)
      animation = Animated.timing(frame, {
        toValue: LAST,
        duration: LAST / EXPLORER_CHEST_SEQUENCE.fps * 1000,
        easing: value => Math.floor(value * LAST) / LAST,
        useNativeDriver: true,
        isInteraction: false,
      })
      animation.start(({ finished }) => { if (finished) finish(true) })
    }
    return () => {
      alive = false
      animation?.stop()
      if (decodeTimer !== undefined) clearTimeout(decodeTimer)
      blur?.()
      state.remove()
    }
  }, [decoded, failed, frame, navigation, opened, reduced])

  useEffect(() => {
    const increased = nudge > previousNudge.current
    previousNudge.current = nudge
    let animation: Animated.CompositeAnimation | undefined
    const settle = () => { animation?.stop(); bounce.setValue(1) }
    settle()
    if (increased && !reduced && navigation?.isFocused() !== false && AppState.currentState !== 'background' && AppState.currentState !== 'inactive') {
      bounce.setValue(0)
      animation = Animated.timing(bounce, {
        toValue: 1, duration: motion.celebrate.duration, easing: Easing.linear,
        useNativeDriver: true, isInteraction: false,
      })
      animation.start()
    }
    const blur = navigation?.addListener('blur', settle)
    const state = AppState.addEventListener('change', value => { if (value !== 'active') settle() })
    return () => { settle(); blur?.(); state.remove() }
  }, [bounce, navigation, nudge, reduced])

  const playing = phase === 'opening'
  const loadingFilm = phase === 'waiting' || playing
  return <View {...hidden} pointerEvents="none" testID={testID} style={{ width: size, height: size }}>
    <Animated.View testID="explorer-chest-motion" style={{ width: size, height: size, transform: [
      { translateY: bounce.interpolate({ inputRange: [0, .2, .4, .6, 1], outputRange: [0, -Math.min(space[2], size / 16), 0, -Math.min(space[1], size / 32), 0] }) },
      { rotate: bounce.interpolate({ inputRange: [0, .15, .3, .45, .65, 1], outputRange: ['0deg', '-8deg', '7deg', '-4deg', '2deg', '0deg'] }) },
    ] }}>
      {/* Predecode both stills so the film can land without an empty frame. */}
      <Image testID="explorer-chest-still" source={source(EXPLORER_CHEST.closed)} alt="" {...hidden} resizeMode="contain"
        style={[styles.still, { width: size, height: size, opacity: !playing && phase !== 'opened' ? 1 : 0 }]} />
      <Image testID="explorer-chest-opened" source={source(EXPLORER_CHEST.opened)} alt="" {...hidden} resizeMode="contain"
        style={[styles.still, { width: size, height: size, opacity: phase === 'opened' ? 1 : 0 }]} />
      {loadingFilm && <View style={{ width: size, height: size, overflow: 'hidden', direction: 'ltr' }}>
        <Animated.Image testID="explorer-chest-film" source={source(EXPLORER_CHEST.sheet)} alt="" {...hidden} resizeMode="stretch"
          onLoad={() => setDecoded(true)} onError={() => setFailed(true)}
          style={{ width: size * EXPLORER_CHEST_SEQUENCE.columns, height: size * EXPLORER_CHEST_SEQUENCE.rows, opacity: playing ? 1 : 0,
            transform: [
              { translateX: wholeFrame.interpolate({ inputRange: FRAMES, outputRange: FRAMES.map(index => -(index % EXPLORER_CHEST_SEQUENCE.columns) * size) }) },
              { translateY: wholeFrame.interpolate({ inputRange: FRAMES, outputRange: FRAMES.map(index => -Math.floor(index / EXPLORER_CHEST_SEQUENCE.columns) * size) }) },
            ],
          }} />
      </View>}
    </Animated.View>
  </View>
}

const styles = StyleSheet.create({ still: { position: 'absolute' } })
