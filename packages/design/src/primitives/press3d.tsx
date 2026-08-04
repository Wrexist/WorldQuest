/**
 * The press mechanic every solid control in this app shares.
 *
 * ## What it is
 *
 * A control is drawn as two rectangles: a dark **edge** and, sitting on top of it and
 * offset upwards, a bright **face**. At rest you see the face plus a few pixels of
 * edge along the bottom, which is what makes it read as a physical object with a side
 * rather than as a coloured rectangle. On press the face slides down by exactly the
 * edge's thickness and lands flush, so the object looks compressed rather than moved.
 *
 * That is the whole trick, and it is most of why Duolingo's interface feels tactile
 * where a flat one feels like a form. It is worth doing properly once, here, rather
 * than approximately in five components.
 *
 * ## Why it is built this way
 *
 * The naive version animates height or margin, which cannot use the native driver —
 * so the animation runs on the JS thread and stutters during exactly the moments the
 * app is busiest (a question being graded, a screen transition). This version only
 * ever animates `translateY`, which the native driver handles, and the socket's
 * layout height never changes: nothing below a button moves when it is pressed.
 *
 * The geometry, with `d` = depth:
 *
 *     socket   0 ────────────── H     transparent, H = faceHeight + d
 *     edge     d ────────────── H     absolute; the darker side
 *     face     0 ────────── H-d       rest: d pixels of edge show below it
 *     face     d ────────────── H     pressed: covers the edge exactly
 *
 * ## Accessibility
 *
 * Under reduced motion the face still moves — it just arrives instantly, because
 * `useTiming` collapses the duration to zero. The movement is the feedback that a
 * press registered, not decoration, and removing it would leave a control that gives
 * nothing back. That distinction is the whole point of `motion.ts`.
 */

import { useCallback, useRef } from 'react'
import { Animated, StyleSheet } from 'react-native'
import { useTiming } from '../motion.js'

export type FacePress = {
  /** Hand straight to the face's `transform`. */
  readonly translateY: Animated.Value
  readonly onPressIn: () => void
  readonly onPressOut: () => void
}

/**
 * `depth` is the edge thickness in pixels — always a `depth.*` token, never a number
 * chosen at the call site, because a control whose edge is a different size from its
 * neighbour's is the kind of thing nobody can name but everybody notices.
 */
export function useFacePress(depth: number, disabled = false): FacePress {
  const translateY = useRef(new Animated.Value(0)).current
  const timing = useTiming('press')

  const to = useCallback(
    (value: number) => {
      Animated.timing(translateY, { toValue: value, ...timing }).start()
    },
    [translateY, timing],
  )

  return {
    translateY,
    onPressIn: useCallback(() => {
      if (!disabled) to(depth)
    }, [to, depth, disabled]),
    onPressOut: useCallback(() => to(0), [to]),
  }
}

export const press3d = StyleSheet.create({
  /**
   * The transparent box the whole control lives in. It owns the layout height, so
   * pressing never reflows the screen.
   */
  socket: { position: 'relative' },
  /**
   * The side of the object. `top: depth` rather than a bottom border, so the face can
   * cover it completely on press — a border would still be drawn under a translated
   * child.
   */
  edge: { position: 'absolute', start: 0, end: 0, bottom: 0 },
  face: { overflow: 'hidden' },
})
