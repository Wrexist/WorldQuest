/**
 * Slider — a value dragged along a track, snapping to named stops.
 *
 * Built for onboarding's difficulty question, where the three answers are a *scale*
 * rather than a menu: "just starting", "I know some", "bring it on" are one axis with a
 * direction, and three radio rows say nothing about the fact that the middle one is
 * between the other two. A track says it in the shape of the control.
 *
 * ## Discrete, not continuous
 *
 * It snaps. A continuous slider that resolves to one of three buckets lies about its own
 * precision — the thumb comes to rest somewhere the value does not exist, and the user
 * cannot tell whether they got the answer they aimed at. Every position the thumb can
 * hold is a real value, and the stop dots on the track say how many there are before the
 * first drag.
 *
 * ## Why it is not the navigation
 *
 * Every other single-select step in onboarding advances on the tap that answers it. This
 * one cannot: a drag passes THROUGH the values on its way, so advancing on change would
 * leave on the first stop crossed. A dragged answer needs a separate "done", which is
 * why the level step still has a button under it.
 *
 * ## Accessibility
 *
 * `role="slider"` — one spelling that is valid in React Native's `role` prop and lands
 * as a real `slider` on web, where `adjustable` would not. It carries `aria-valuetext`
 * so a reader says "I know some" rather than "1", and it answers increment and decrement
 * actions, which is how VoiceOver and TalkBack change a slider: they never send a drag.
 * A control adjustable only by dragging is a control a screen-reader user cannot set.
 *
 * The stop labels underneath are `aria-hidden`. They are the track's own legend and a
 * reader already gets the current one from `aria-valuetext`; announcing all three again
 * would be the value read four times.
 */

import { useRef, useState } from 'react'
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { colors, depth, layout, radius, space } from '../tokens.js'
import { text } from '../typography.js'

export type SliderStop = {
  /** Shown under the track and spoken as the value. */
  readonly label: string
}

export type SliderProps = {
  readonly stops: readonly SliderStop[]
  /** Index into `stops`. Controlled — the parent owns the value. */
  readonly value: number
  readonly onChange: (index: number) => void
  /** Names the slider. Required: one with no name announces as "slider". */
  readonly label: string
  readonly style?: StyleProp<ViewStyle>
  readonly testID?: string
}

/** Shared by the responder and the keyboard path, so they cannot disagree at the ends. */
const clampTo = (index: number, count: number): number =>
  Math.min(count - 1, Math.max(0, index))

const TRACK = 14
/** 44 is the touch-target floor, and the thumb is the target. */
const THUMB = layout.minTouchTarget

export function Slider({ stops, value, onChange, label, style, testID }: SliderProps) {
  const [width, setWidth] = useState(0)
  const onTrackLayout = (event: LayoutChangeEvent): void => {
    setWidth(event.nativeEvent.layout.width)
  }

  const last = Math.max(1, stops.length - 1)
  const clamp = (index: number): number => clampTo(index, stops.length)

  /**
   * The travel available to the thumb's CENTRE.
   *
   * The thumb is 44 wide and centred on its stop, so at either end half of it hangs past
   * the track. Insetting the travel by half a thumb is what keeps the first and last
   * stops on screen instead of clipped by the parent.
   */
  const travel = Math.max(0, width - THUMB)
  const step = travel / last

  // Read through a ref inside the responder: the callbacks below are created once and
  // would otherwise close over the first render's value forever.
  const state = useRef({ value, step, onChange, count: stops.length })
  state.current = { value, step, onChange, count: stops.length }
  /** The index the finger landed on, which every subsequent move is measured from. */
  const grabbed = useRef(0)

  const pan = useRef(
    PanResponder.create({
      // Claim the gesture on touch-down, so a TAP anywhere on the track moves the thumb
      // there. Without this the control answers only to a drag, and the three labels
      // underneath would each have needed to be a pressable of their own — three more
      // controls reporting a value the slider already reports.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const { step: size, onChange: emit, count } = state.current
        if (size <= 0) return
        // `locationX` is relative to the track itself, so this is where on the track the
        // finger actually is — no page offset to measure and nothing to keep in sync.
        const index = clampTo(Math.round((event.nativeEvent.locationX - THUMB / 2) / size), count)
        grabbed.current = index
        if (index !== state.current.value) emit(index)
      },
      onPanResponderMove: (_event, gesture) => {
        const { step: size, onChange: emit, count } = state.current
        if (size <= 0) return
        const next = clampTo(Math.round(grabbed.current + gesture.dx / size), count)
        // Measured from where the finger went down, so this re-derives the same index
        // until it crosses half a step. Emitting only on a real change is what stops a
        // drag from firing sixty identical updates a second — and, in onboarding, sixty
        // haptics.
        if (next !== state.current.value) emit(next)
      },
    }),
  ).current

  const at = (index: number): number => (travel > 0 ? index * step : 0)

  return (
    <View style={[styles.wrap, style]} testID={testID}>
      <View
        style={styles.track}
        onLayout={onTrackLayout}
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={stops.length - 1}
        aria-valuenow={value}
        aria-valuetext={stops[value]?.label ?? ''}
        // How a screen reader moves a slider. Without these the control is drag-only,
        // which is to say unusable by exactly the people the label was written for.
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') onChange(clamp(value + 1))
          if (event.nativeEvent.actionName === 'decrement') onChange(clamp(value - 1))
        }}
        {...pan.panHandlers}
      >
        <View style={styles.rail} />
        <View style={[styles.fill, { width: at(value) + THUMB / 2 }]} />

        {/* One dot per stop, so the number of answers is visible before the first drag.
            Behind the thumb and deaf to touch — the track above already takes the
            gesture, and a dot that swallowed it would create dead spots between stops. */}
        {stops.map((stop, index) => (
          <View
            key={stop.label}
            style={[styles.notch, { start: at(index) + THUMB / 2 - space[1] / 2 }]}
            pointerEvents="none"
            aria-hidden
          />
        ))}

        <View style={[styles.thumb, { start: at(value) }]} pointerEvents="none" aria-hidden />
      </View>

      {/* The legend — text, not controls.
          They were three Pressables at first, so a label could be tapped as well as
          dragged to. That is three more controls reporting a value the slider already
          reports, and they had to be hidden from the reader to avoid announcing it four
          times — which is the exact shape of a control nobody can reach. The track takes
          a tap at any position instead, so the affordance survives and the semantics stay
          in one place.

          Hidden from the reader because `aria-valuetext` already says which one is
          current, and the other two are the scale rather than information. */}
      <View style={styles.legend} aria-hidden importantForAccessibility="no-hide-descendants">
        {stops.map((stop, index) => (
          <Text
            key={stop.label}
            style={[styles.legendText, index === value && styles.legendTextOn]}
          >
            {stop.label}
          </Text>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  track: { height: THUMB, justifyContent: 'center' },
  rail: {
    height: TRACK,
    borderRadius: radius.full,
    backgroundColor: colors.bg.surfaceRaised,
    marginHorizontal: THUMB / 2,
  },
  fill: {
    position: 'absolute',
    start: THUMB / 2,
    height: TRACK,
    borderRadius: radius.full,
    backgroundColor: colors.action.secondary,
  },
  notch: {
    position: 'absolute',
    width: space[1],
    height: space[1],
    borderRadius: radius.full,
    backgroundColor: colors.bg.canvas,
    opacity: 0.5,
  },
  /**
   * The same face-on-an-edge every other pressable surface in this system uses, so the
   * thumb reads as the one object on the screen you are meant to grab.
   */
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: radius.full,
    backgroundColor: colors.action.primary,
    borderBottomWidth: depth.button,
    borderBottomColor: colors.action.primaryEdge,
  },
  legend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space[2] },
  legendText: { ...text('caption'), color: colors.text.tertiary, flex: 1, textAlign: 'center' },
  legendTextOn: { ...text('caption', { weight: '700' }), color: colors.text.primary },
})
