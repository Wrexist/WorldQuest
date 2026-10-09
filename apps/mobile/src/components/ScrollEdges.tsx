/**
 * Soft edges for a scrolling screen: content blurs and fades as it reaches the top and
 * the bottom, instead of being cut off by a hard line.
 *
 * iOS 26 does this under every system bar (the "scroll edge effect"), and the owner asked
 * for it here (2026-10-09). The app's bars are its own clay, not UIKit's, so the effect
 * is drawn rather than inherited: a strip at each edge of the scroll view, strongest at
 * the edge and gone a few points in.
 *
 * ## Nothing is blurred at rest
 *
 * Each strip is exactly as tall as the screen's own padding at that edge (16 pt at the
 * top, 24 at the bottom on the tabs), so at the top of the page, and at the end, it lies
 * over empty canvas. Only content that is scrolled INTO an edge softens.
 *
 * ## By platform
 *
 * - **iOS:** a real blur (`expo-blur`), masked by a gradient so it ramps in, with a wash of
 *   the canvas colour on top so the content also fades into the edge.
 * - **Android and web:** the fade alone. Android's blur is experimental and costly
 *   (`experimentalBlurMethod`), and react-native-web has no mask; a fade reads the same
 *   at a glance and costs nothing.
 * - **Reduce Transparency (iOS):** the fade alone, as the setting asks.
 *
 * ## Lighter while moving
 *
 * A heavy blur over text in motion is mush, and it is GPU work every frame. So the blur
 * drops to `illustration.edgeBlur.moving` while the content scrolls and settles back to
 * `rest` once it stops (a design-engineering tip the owner sent alongside the request).
 * Two state changes per gesture, from the scroll view's begin and end events; nothing per
 * frame. `useScrollEdges` supplies those handlers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native'
import { BlurView } from 'expo-blur'
import MaskedView from '@react-native-masked-view/masked-view'
import { LinearGradient } from 'expo-linear-gradient'
import { illustration, motion, space, useTheme } from '@worldquest/design'

/** The tabs' content padding at each edge, which is what each strip may cover at rest. */
const TOP = space[4]
const BOTTOM = space[6]

type Handlers = {
  onScrollBeginDrag: () => void
  onScrollEndDrag: () => void
  onMomentumScrollBegin: () => void
  onMomentumScrollEnd: () => void
}

/**
 * Whether the content is moving, and the scroll view handlers that say so. A drag that
 * ends without a fling never sends `onMomentumScrollEnd`, so "stopped" waits a beat
 * (`motion.quick`) after the drag ends, and a fling that follows cancels the wait.
 */
export function useScrollEdges(): { moving: boolean; handlers: Handlers } {
  const [moving, setMoving] = useState(false)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancel = useCallback(() => {
    if (settle.current !== undefined) clearTimeout(settle.current)
    settle.current = undefined
  }, [])
  useEffect(() => cancel, [cancel])
  const handlers = useMemo<Handlers>(() => ({
    onScrollBeginDrag: () => { cancel(); setMoving(true) },
    onScrollEndDrag: () => { cancel(); settle.current = setTimeout(() => setMoving(false), motion.quick.duration) },
    onMomentumScrollBegin: cancel,
    onMomentumScrollEnd: () => { cancel(); setMoving(false) },
  }), [cancel])
  return { moving, handlers }
}

/** iOS's Reduce Transparency, live. Always false elsewhere. */
function useReduceTransparency(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    // Guarded as well as gated: react-native-web has no such query.
    if (Platform.OS !== 'ios' || typeof AccessibilityInfo.isReduceTransparencyEnabled !== 'function') return
    let alive = true
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => { if (alive) setReduce(value) }).catch(() => {})
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce)
    return () => { alive = false; subscription?.remove?.() }
  }, [])
  return reduce
}

/**
 * The two strips, absolutely positioned over a scroll view. Put it beside the scroll view
 * inside a container that is the scroll view's size; it never takes a touch.
 */
export function ScrollEdges({ moving = false, top = true, bottom = true }: { moving?: boolean; top?: boolean; bottom?: boolean }) {
  const reduce = useReduceTransparency()
  const blur = Platform.OS === 'ios' && !reduce
  return (
    <>
      {top && <Edge side="top" blur={blur} moving={moving} />}
      {bottom && <Edge side="bottom" blur={blur} moving={moving} />}
    </>
  )
}

function Edge({ side, blur, moving }: { side: 'top' | 'bottom'; blur: boolean; moving: boolean }) {
  const { colors, mode } = useTheme()
  const canvas = colors.bg.canvas
  // Opaque at the screen's edge, clear inward. A canvas colour with no alpha is the
  // canvas, transparent: the gradient never passes through grey on its way out.
  const toEdge = side === 'top' ? [canvas, `${canvas}00`] as const : [`${canvas}00`, canvas] as const
  const place = [styles.edge, side === 'top' ? { top: 0, height: TOP } : { bottom: 0, height: BOTTOM }]
  return (
    <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={place} testID={`scroll-edge-${side}`}>
      {blur ? (
        <MaskedView style={StyleSheet.absoluteFill} maskElement={<LinearGradient colors={toEdge} style={StyleSheet.absoluteFill} />}>
          <BlurView intensity={moving ? illustration.edgeBlur.moving : illustration.edgeBlur.rest}
            tint={mode === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: canvas, opacity: illustration.edgeBlur.fade }]} />
        </MaskedView>
      ) : <LinearGradient colors={toEdge} style={StyleSheet.absoluteFill} />}
    </View>
  )
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', start: 0, end: 0 },
})
