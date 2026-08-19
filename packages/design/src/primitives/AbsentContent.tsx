/**
 * AbsentContent — a stand-in that keeps the shape of something that has not arrived.
 *
 * ## The missing half of the skeleton story
 *
 * `Skeleton` is used on four screens and only ever for loading. But content can be
 * absent in four ways, and three of them had no treatment at all: the screen simply did
 * not render the thing, everything below slid up, and the page lost the shape it has
 * when it works.
 *
 * The paywall is the clearest case. Its two `PlanCard`s are the reason the screen
 * exists. When the store cannot be reached they are not replaced — they are gone, the
 * perk list slides up to meet the headline, and what is left is a short centred column
 * above two hundred points of nothing. A user deciding whether to pay is looking at a
 * page that appears to have failed to render.
 *
 * A missing price is not a missing layout. This holds the footprint and says what
 * happened inside it.
 *
 * ## Four states, because they are four different facts
 *
 * - `loading` — a moment. The box shimmers, which is the same "here is the shape of what
 *   is coming" a `Skeleton` gives, with room to say what is being waited for.
 * - `error` — something broke and the user can retry. The only state announced as an
 *   alert, and the only one drawn with a `border.strong` edge, because the retry inside
 *   it is the one control on the screen that can change the outcome.
 * - `offline` — being on a train is not a failure. Same footprint, quieter edge, no
 *   alert: nothing is wrong and nothing needs doing.
 * - `unavailable` — we have nothing to show here and nobody did anything wrong. Our own
 *   misconfiguration, usually. Stated plainly rather than dressed as a weather event.
 *
 * ## One layout, four states
 *
 * The first version of this made `loading` a bare `Skeleton` and dropped its children,
 * reasoning that a shimmer with words on it is a lie. A paywall test caught it inside
 * five minutes: the screen deliberately says "Checking prices with the store" while it
 * waits, and that decision is older than this component and better than the rule.
 *
 * So there is one box, and `loading` shimmers it from behind. Suppressing an ACTION
 * during loading — a retry against something that has not failed — is real, and it
 * belongs to the caller, which knows which of its children is the action.
 *
 * ## `minHeight`, never `height`
 *
 * The caller passes the footprint of the real thing. It is a floor: at 200 % text the
 * message inside grows, and a fixed height would clip the sentence explaining why the
 * screen is empty — on the screen least able to afford it.
 */

import type { ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, radius, space } from '../tokens.js'
import { Skeleton } from './Skeleton.js'

export type AbsentState = 'loading' | 'error' | 'offline' | 'unavailable'

export type AbsentContentProps = {
  readonly state: AbsentState
  /**
   * The footprint of what is missing, in points.
   *
   * Measure the real component rather than guessing: the point is that the page does
   * not move when the content arrives.
   */
  readonly minHeight: number
  readonly borderRadius?: number
  /**
   * What a screen reader announces for this region.
   *
   * Required. Callers hide the visible copy from the reader — the same idiom a labelled
   * `Card` uses — so without this the box announces as an unnamed group, and the one
   * sentence explaining why the screen is empty is the one thing not read out.
   */
  readonly label: string
  /** The message, and the action where there is one. */
  readonly children?: ReactNode
  readonly style?: StyleProp<ViewStyle>
  readonly testID?: string
}

export function AbsentContent({
  state,
  minHeight,
  borderRadius = radius.lg,
  label,
  children,
  style,
  testID,
}: AbsentContentProps) {
  const loading = state === 'loading'

  return (
    <View
      style={[
        styles.box,
        state === 'error' && styles.actionable,
        loading && styles.waiting,
        { minHeight, borderRadius },
        style,
      ]}
      // `alert` only for the state that arrived unexpectedly and can be acted on.
      // Offline, unavailable and loading are facts about the world or about a moment;
      // interrupting a screen reader to announce one is the notification equivalent of
      // a dark pattern.
      role={state === 'error' ? 'alert' : undefined}
      aria-label={label}
      testID={testID}
    >
      {/* Behind the children, not instead of them. `Skeleton` already hides itself from
          the reader and already stops pulsing under reduced motion, so this is the
          existing primitive doing its job rather than a second shimmer to keep honest. */}
      {loading && (
        <Skeleton
          height={minHeight}
          borderRadius={borderRadius}
          style={StyleSheet.absoluteFill as StyleProp<ViewStyle>}
        />
      )}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
    // `space[3]`, not the `space[4]` a `Card` uses. The first screen to adopt this is
    // the one with the least room to spare: at `space[4]` the paywall's 200 %-text E2E
    // check failed with "Offline packs" drawn under "Not now". The frame is also doing
    // some of the work the padding would — the content is already grouped by an edge, so
    // it does not need to be inset from it as far.
    padding: space[3],
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    // The shimmer is absolutely positioned inside; without this it paints over the
    // rounded corners as a rectangle.
    overflow: 'hidden',
  },
  // The one state with something to press. A stronger edge, because the retry inside it
  // is the only control on the screen that can change the outcome — every other one is
  // disabled for want of the thing that did not arrive.
  actionable: { borderColor: colors.border.strong },
  // No edge while waiting: nothing has gone wrong yet, and a bordered box that then
  // becomes two cards is a flicker of a shape that was never real.
  waiting: { borderColor: colors.bg.surface },
})
