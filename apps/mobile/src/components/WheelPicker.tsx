/**
 * A wheel — one long list, snapped to a centre band.
 *
 * ## Why this exists
 *
 * The onboarding age gate asked for one number out of a hundred and answered it with
 * twenty-one buttons: eleven decade chips, then ten year chips, with the decade list
 * collapsing once a decade was picked so the whole thing would fit. It was a careful
 * design for a real problem — "ninety targets is not a picker, it is a phone book" — and
 * at 320 pt it still did not fit. The 1930s and 1920s chips rendered behind the Continue
 * button, so the two options that reach the oldest users were the two that were clipped
 * (docs/design/ios-native-audit.md, O5).
 *
 * A wheel is the platform's own answer to that question, and it does not have the
 * problem: one gesture reaches any row, the height is fixed no matter how many rows
 * there are, and nothing can overflow because nothing is laid out beside anything else.
 *
 * ## Nothing is pre-selected, and a wheel always shows something
 *
 * Those two facts fight, and the age gate is the one screen where the first one wins:
 * the answer decides whether a child gets the child experience, so a default would nudge
 * the one number in the app we must not nudge.
 *
 * So the caller supplies an explicit empty row as `options[0]` and passes `value: null`
 * for it. The band shows "Choose a year" rather than a year nobody chose, and the
 * primary action stays disabled until the wheel has moved. That is an iOS wheel telling
 * the truth, rather than an iOS wheel pretending a guess is an answer.
 *
 * ## Why every row is a Pressable
 *
 * A wheel is a scroll gesture, and a scroll gesture is invisible to a screen reader, to a
 * keyboard, and to every test in this repo. Each row is therefore a real radio: VoiceOver
 * announces a radiogroup and can pick any row directly, a click selects, and
 * `getByRole('radio', { name: '1996' })` works in jsdom — where `onMomentumScrollEnd`
 * never fires, because jsdom has no momentum. The gesture is the fast path for a finger,
 * not the only path.
 *
 * ## Distance, not scroll position
 *
 * The rows fade with their distance from the selected one rather than from the live
 * scroll offset. Tracking the offset would be truer to a real UIPickerView and would
 * re-render a hundred rows on every frame of a fling; measured against what it buys —
 * the fade is a hint, not information — the cheap version wins.
 */

import { useEffect, useRef } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { colors, radius, space, squircle, text } from '@worldquest/design'
import { hapticSelect } from '../lib/haptics.js'

export type WheelOption<T> = {
  /** `null` is the empty row — see the header. */
  readonly value: T | null
  readonly label: string
}

export type WheelPickerProps<T> = {
  readonly options: readonly WheelOption<T>[]
  readonly value: T | null
  readonly onChange: (value: T | null) => void
  /** Names the radiogroup. Required — a picker with no name announces as "radiogroup". */
  readonly label: string
  readonly testID?: string
}

/**
 * 44 is the accessibility floor for a touch target and the row height iOS uses in its
 * own pickers. That the two numbers agree is not a coincidence — one is why the other is
 * what it is.
 */
const ROW = 44

/** Five rows: the selection, two of context each way. Seven is a slot machine. */
const VISIBLE = 5

/**
 * Three rows on a phone too short for five.
 *
 * 5 × 44 is 220 pt of control, which is 39 % of a 320×568 screen's height before any
 * question, any explanation or any button. `docs/design/ios-native-audit.md` already
 * recorded this step overflowing at 320 (O5) and the wheel was the fix for a DIFFERENT
 * overflow — it replaced a chip grid whose oldest two decades rendered behind the
 * Continue button — so it inherited the problem rather than solving it.
 *
 * Three is still a wheel: the selection with one of context each way is what makes the
 * control legible as a scrolling list rather than a button. Two would not be.
 *
 * The threshold is `LessonScreen`'s 700 and deliberately the same number, from the same
 * measurement of what a 320-wide phone actually gives you.
 */
const VISIBLE_SHORT = 3
const SHORT_SCREEN = 700

/**
 * How far a row's label may grow. The second cap in the app, and `AppChrome`'s comment
 * on the first one demands this be justified rather than copied: *"the moment a second
 * component wants a cap, the right move is to ask why its layout cannot hold its own
 * text."*
 *
 * The answer here is that `ROW` is not a layout choice. It is 44 because that is the
 * touch-target floor, and it is simultaneously `snapToInterval` — the pitch the wheel
 * snaps on. A row that grew with the text would either break the snap arithmetic or stop
 * being a reachable target, and iOS's own picker does not grow its rows with Dynamic Type
 * either; it scales the text inside a bounded cell.
 *
 * 1.4, not 1.2: `h3` is 18, so this stops at 25 in a 44 pt row, which still leaves room
 * for the descenders. The label keeps scaling — refusing to scale at all is what the
 * accessibility spec forbids and is the lazy version of this fix.
 *
 * Found by `pnpm e2e`, which photographed "2026" painted over the Continue button at
 * 200 % text. The wheel had been at its limit and a taller question above it was what
 * pushed it over.
 */
const ROW_MAX_SCALE = 1.4

export function WheelPicker<T extends string | number>({
  options,
  value,
  onChange,
  label,
  testID,
}: WheelPickerProps<T>) {
  const scroller = useRef<ScrollView>(null)
  // Measured, not assumed: the same wheel is 220 pt tall on a phone that can afford it
  // and 132 on one that cannot, and nothing else about it changes.
  const { height } = useWindowDimensions()
  const visible = height < SHORT_SCREEN ? VISIBLE_SHORT : VISIBLE
  const pad = ((visible - 1) / 2) * ROW
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )

  // Follow the value when it is set from outside the wheel — a tapped row, or a reset.
  // `animated` is fine to leave on: this only runs when the index actually changes, and
  // the row that was tapped is already under the finger, so the travel is short.
  useEffect(() => {
    scroller.current?.scrollTo({ y: selected * ROW, animated: true })
  }, [selected])

  const pick = (index: number): void => {
    const option = options[index]
    if (option === undefined || option.value === value) return
    // The one thing a wheel must do that a list need not: a tick per row as it passes.
    // `hapticSelect` has existed in lib/haptics.ts since haptics landed and had no
    // callers at all — the pickers, the chips and the tab bar it was written for were
    // all silent.
    hapticSelect()
    onChange(option.value)
  }

  return (
    <View
      // The group, named. Individual rows carry their own label and checked state.
      role="radiogroup"
      aria-label={label}
      style={[styles.frame, { height: visible * ROW }]}
      testID={testID}
    >
      {/* The band the selection sits in. Behind the rows and deaf to touches, so a tap
          lands on the row it looks like it landed on. */}
      <View style={[styles.band, { top: pad }]} pointerEvents="none" aria-hidden />

      <ScrollView
        ref={scroller}
        // Bounded to the well, explicitly.
        //
        // Without a height the scroller is sized by its CONTENT — a hundred rows — and
        // only the frame's `overflow: hidden` stopped it being visible. Its box still
        // extended hundreds of points down the screen, which is invisible until
        // something measures it: the 200 %-text check reported "2025 overlaps Continue"
        // for a row that was clipped out of sight, because the row really was inside its
        // scroller's rect and the scroller really did reach the button.
        style={{ height: visible * ROW }}
        showsVerticalScrollIndicator={false}
        // The two properties that make this a wheel rather than a list. `fast` is what
        // stops a fling from coasting past twenty rows before it settles.
        snapToInterval={ROW}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: pad }}
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.y / ROW)
          pick(Math.min(options.length - 1, Math.max(0, index)))
        }}
      >
        {options.map((option, index) => {
          const distance = Math.abs(index - selected)
          const isSelected = option.value === value
          return (
            <Pressable
              key={String(option.value ?? 'none')}
              role="radio"
              aria-label={option.label}
              aria-selected={isSelected}
              aria-checked={isSelected}
              onPress={() => pick(index)}
              style={styles.row}
            >
              <Text
                maxFontSizeMultiplier={ROW_MAX_SCALE}
                dataSet={{ maxScale: String(ROW_MAX_SCALE) }}
                numberOfLines={1}
                style={[
                  styles.label,
                  isSelected && styles.labelOn,
                  // A hint, not information — the band and the type size already say
                  // which row is chosen, and a screen reader is told outright.
                  distance > 1 && styles.labelFar,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  /**
   * The wheel sits on its own surface, and that is not decoration.
   *
   * A wheel opens on its first row, so two of its five rows are blank by construction —
   * the padding that lets row zero reach the centre band. Drawn straight onto the canvas
   * those 88 points read as a gap in the layout with a stray highlighted rectangle in the
   * middle of it. On a surface they read as the top of a control that has more below,
   * which is what they are, and it is how iOS draws a picker: an inset well, with the
   * selection band lifted out of it.
   */
  frame: {
    // Height comes from `visible` at the call site below — it is measured, not fixed.
    alignSelf: 'stretch',
    justifyContent: 'center',
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    ...squircle,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    // Rows run past both ends of the well; this is what cuts them off at its edge.
    overflow: 'hidden',
  },
  band: {
    position: 'absolute',
    start: space[2],
    end: space[2],
    height: ROW,
    borderRadius: radius.md,
    ...squircle,
    backgroundColor: colors.bg.surfaceRaised,
  },
  // The padding is what lets the FIRST and LAST rows reach the centre band. Without it
  // the wheel can scroll to neither end of its own list.
  row: { height: ROW, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[4] },
  label: { ...text('h3', { numeric: true }), color: colors.text.secondary },
  labelOn: { ...text('h2', { numeric: true }), color: colors.text.primary },
  labelFar: { color: colors.text.tertiary, opacity: 0.6 },
})
