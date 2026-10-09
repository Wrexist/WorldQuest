/**
 * Soft edges for a scrolling screen: content blurs and dissolves into the canvas as it
 * reaches the top and the bottom, instead of being cut off by a hard line.
 *
 * iOS 26 does this under every system bar (the "scroll edge effect"), and the owner asked
 * for it here (2026-10-09). The app's bars are its own clay, not UIKit's, so the effect is
 * drawn rather than inherited: a strip at each edge of the scroll view.
 *
 * ## Clean, not banded (owner review of the first cut, 2026-10-09)
 *
 * The first cut was a 16 and a 24 point LINEAR fade. Too short to hide the line where the
 * scroll view clips, and a linear ramp has a visible start, so the edge showed twice.
 * Now:
 *
 * - **Taller** (`TOP`, `BOTTOM`), so the content dissolves over a distance the eye reads
 *   as a transition rather than a stripe.
 * - **Eased.** The alpha follows a smoothstep through `STOPS` stops, so there is no
 *   corner where the ramp begins or ends.
 * - **Only where there is something to soften.** The top edge shows once the page has
 *   scrolled and the bottom edge hides at the end, each fading in and out over
 *   `motion.quick`. At the top of a page the bar and first card are never blurred; at the
 *   end, the last card is not.
 *
 * ## By platform
 *
 * - **iOS:** a real blur (`expo-blur`), masked by the eased ramp, with a wash of the
 *   canvas colour so the content also dissolves.
 * - **Android and web:** the eased fade alone. Android's blur is experimental and costly
 *   (`experimentalBlurMethod`), and react-native-web has no mask.
 * - **Reduce Transparency (iOS):** the fade alone. **Reduce Motion:** the edges appear and
 *   go without the fade.
 *
 * ## Cheap
 *
 * The blur drops to `illustration.edgeBlur.moving` while the content scrolls and settles
 * back to `rest` once it stops (a tip the owner sent with the request): a heavy blur over
 * moving text is mush, and GPU work every frame. Every state here changes only when it
 * flips (moving, scrolled away from the top, at the end), never per frame; the scroll
 * handler compares and returns.
 */

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AccessibilityInfo, Animated, Easing, Platform, ScrollView, StyleSheet, View,
  type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps,
} from 'react-native'
import { BlurView } from 'expo-blur'
import MaskedView from '@react-native-masked-view/masked-view'
import { LinearGradient } from 'expo-linear-gradient'
import { illustration, motion, space, useReducedMotion, useTheme } from '@worldquest/design'

/** How far each edge reaches into the scroll view. */
const TOP = space[7]
const BOTTOM = space[8]
/** Points on the eased ramp. Eight is where a smoothstep stops showing facets. */
const STOPS = 8
/** Within this many points of the top or the end counts as being there. */
const NEAR = space[1]

export type ScrollEdgeState = {
  /** The content is being dragged or flung. */
  moving: boolean
  /** The page has scrolled away from its top: there is content under the top edge. */
  scrolled: boolean
  /** The page is at its end (or never overflowed): nothing under the bottom edge. */
  atEnd: boolean
}

type Handlers = {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  onLayout: (event: LayoutChangeEvent) => void
  onContentSizeChange: (width: number, height: number) => void
  onScrollBeginDrag: () => void
  onScrollEndDrag: () => void
  onMomentumScrollBegin: () => void
  onMomentumScrollEnd: () => void
  scrollEventThrottle: number
}

/**
 * The edges' state and the scroll view props that keep it. A drag that ends without a
 * fling never sends `onMomentumScrollEnd`, so "stopped" waits a beat (`motion.quick`)
 * after the drag ends, and a fling that follows cancels the wait.
 */
export function useScrollEdges(): ScrollEdgeState & { handlers: Handlers } {
  const [state, setState] = useState<ScrollEdgeState>({ moving: false, scrolled: false, atEnd: true })
  const geometry = useRef({ offset: 0, viewport: 0, content: 0 })
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Set only on a flip, so a scroll event that changes nothing renders nothing.
  const update = useCallback((next: Partial<ScrollEdgeState>) => {
    setState(previous => {
      const merged = { ...previous, ...next }
      return merged.moving === previous.moving && merged.scrolled === previous.scrolled && merged.atEnd === previous.atEnd
        ? previous : merged
    })
  }, [])
  const measure = useCallback(() => {
    const { offset, viewport, content } = geometry.current
    update({ scrolled: offset > NEAR, atEnd: viewport === 0 || offset + viewport >= content - NEAR })
  }, [update])
  const cancel = useCallback(() => {
    if (settle.current !== undefined) clearTimeout(settle.current)
    settle.current = undefined
  }, [])
  useEffect(() => cancel, [cancel])

  const handlers = useMemo<Handlers>(() => ({
    onScroll: event => { geometry.current.offset = event.nativeEvent.contentOffset.y; measure() },
    onLayout: event => { geometry.current.viewport = event.nativeEvent.layout.height; measure() },
    onContentSizeChange: (_width, height) => { geometry.current.content = height; measure() },
    onScrollBeginDrag: () => { cancel(); update({ moving: true }) },
    onScrollEndDrag: () => { cancel(); settle.current = setTimeout(() => update({ moving: false }), motion.quick.duration) },
    onMomentumScrollBegin: cancel,
    onMomentumScrollEnd: () => { cancel(); update({ moving: false }) },
    scrollEventThrottle: 16,
  }), [cancel, measure, update])

  return { ...state, handlers }
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
 * The two edges, absolutely positioned over a scroll view. Put it beside the scroll view
 * inside a container that is the scroll view's size; it never takes a touch.
 */
export function ScrollEdges({ state, top = true, bottom = true, canvas }: {
  state: ScrollEdgeState; top?: boolean; bottom?: boolean
  /** The colour the page is painted, when it is not `bg.canvas` (the streak's lavender). */
  canvas?: string | undefined
}) {
  const blur = Platform.OS === 'ios' && !useReduceTransparency()
  return (
    <>
      {top && <Edge side="top" shown={state.scrolled} blur={blur} moving={state.moving} canvas={canvas} />}
      {bottom && <Edge side="bottom" shown={!state.atEnd} blur={blur} moving={state.moving} canvas={canvas} />}
    </>
  )
}

/**
 * An eased ramp from `canvas` at the screen's edge to clear inward: a smoothstep,
 * sampled. The canvas with no alpha is the canvas made transparent, so the ramp never
 * passes through grey on its way out. `side` is where the solid end is. Shared with
 * `StickyFooter`, so every edge in the app dissolves the same way.
 */
export function ramp(canvas: string, side: 'top' | 'bottom') {
  const colors: string[] = []
  const locations: number[] = []
  for (let i = 0; i < STOPS; i++) {
    const t = i / (STOPS - 1)
    const alpha = 1 - t * t * (3 - 2 * t)
    colors.push(`${canvas}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`)
    locations.push(t)
  }
  if (side === 'bottom') { colors.reverse(); locations.reverse(); for (let i = 0; i < STOPS; i++) locations[i] = 1 - locations[i]! }
  return { colors: colors as [string, string, ...string[]], locations: locations as [number, number, ...number[]] }
}

function Edge({ side, shown, blur, moving, canvas: paint }: {
  side: 'top' | 'bottom'; shown: boolean; blur: boolean; moving: boolean; canvas?: string | undefined
}) {
  const { colors, mode } = useTheme()
  const reduced = useReducedMotion()
  const canvas = paint ?? colors.bg.canvas
  const gradient = useMemo(() => ramp(canvas, side), [canvas, side])
  const opacity = useRef(new Animated.Value(shown ? 1 : 0)).current
  useEffect(() => {
    if (reduced) { opacity.setValue(shown ? 1 : 0); return }
    const animation = Animated.timing(opacity, {
      toValue: shown ? 1 : 0, duration: motion.quick.duration, easing: Easing.out(Easing.quad),
      useNativeDriver: true, isInteraction: false,
    })
    animation.start()
    return () => animation.stop()
  }, [shown, reduced, opacity])

  const place = [styles.edge, side === 'top' ? { top: 0, height: TOP } : { bottom: 0, height: BOTTOM }]
  return (
    <Animated.View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[place, { opacity }]} testID={`scroll-edge-${side}`} dataSet={{ shown: String(shown) }}>
      {blur ? (
        <MaskedView style={StyleSheet.absoluteFill} maskElement={<LinearGradient {...gradient} style={StyleSheet.absoluteFill} />}>
          <BlurView intensity={moving ? illustration.edgeBlur.moving : illustration.edgeBlur.rest}
            tint={mode === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: canvas, opacity: illustration.edgeBlur.fade }]} />
        </MaskedView>
      ) : <LinearGradient {...gradient} style={StyleSheet.absoluteFill} />}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', start: 0, end: 0 },
  // The frame takes the caller's size; `flex: 1` is the default a screen list wants.
  frame: { flex: 1 },
  fill: { flex: 1 },
})

/**
 * A full-screen `ScrollView` with soft edges built in: the drop-in for any screen whose
 * list fills it. The caller's `style` sizes the frame (so `flex: 1` keeps working) and
 * the scroll view fills the frame; every scroll handler the caller passes still runs,
 * after the edges have read the event.
 *
 * Not for a scroll view sized by its content (`flexGrow: 0` inside a sheet): the frame
 * would have nothing to fill. Those keep a plain `ScrollView`.
 */
export const EdgeScrollView = forwardRef<ScrollView, ScrollViewProps & { edgeTop?: boolean; edgeBottom?: boolean; edgeCanvas?: string }>(
  function EdgeScrollView({
    style, edgeTop = true, edgeBottom = true, edgeCanvas,
    onScroll, onLayout, onContentSizeChange, onScrollBeginDrag, onScrollEndDrag, onMomentumScrollBegin, onMomentumScrollEnd,
    scrollEventThrottle, ...props
  }, ref) {
    const edges = useScrollEdges()
    const { handlers } = edges
    return (
      <View style={[styles.frame, style]}>
        <ScrollView ref={ref} {...props} style={styles.fill}
          scrollEventThrottle={Math.min(scrollEventThrottle ?? handlers.scrollEventThrottle, handlers.scrollEventThrottle)}
          onScroll={event => { handlers.onScroll(event); onScroll?.(event) }}
          onLayout={event => { handlers.onLayout(event); onLayout?.(event) }}
          onContentSizeChange={(width, height) => { handlers.onContentSizeChange(width, height); onContentSizeChange?.(width, height) }}
          onScrollBeginDrag={event => { handlers.onScrollBeginDrag(); onScrollBeginDrag?.(event) }}
          onScrollEndDrag={event => { handlers.onScrollEndDrag(); onScrollEndDrag?.(event) }}
          onMomentumScrollBegin={event => { handlers.onMomentumScrollBegin(); onMomentumScrollBegin?.(event) }}
          onMomentumScrollEnd={event => { handlers.onMomentumScrollEnd(); onMomentumScrollEnd?.(event) }} />
        <ScrollEdges state={edges} top={edgeTop} bottom={edgeBottom} canvas={edgeCanvas} />
      </View>
    )
  },
)
