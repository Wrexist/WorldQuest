/**
 * EmptyState — the block a screen shows when it has nothing to show.
 *
 * ## Why this is a primitive and not eight copies
 *
 * Eight screens had hand-rolled the same three-part block — a picture, a heading, a
 * line, sometimes a button — with eight slightly different spacing rhythms and two
 * different art sizes. That is the ordinary cost of duplication, and it was not the
 * expensive part.
 *
 * The expensive part is that every one of them was laid out the same wrong way:
 *
 * ```
 * centered: { alignItems: 'center', justifyContent: 'flex-start', paddingTop: space[9] }
 * ```
 *
 * A short block pinned to the top of a tall screen. On a 390 × 844 phone that leaves
 * roughly half the screen empty below it, and on a tablet closer to two thirds — which
 * is the single most common reason a screen in this app reads as unfinished. Profile's
 * empty state measured 40 % ink with a 46 % gap; League's, 43 % with 46 %.
 *
 * Centring is one line, and getting it right in eight places independently is how it
 * ends up right in six.
 *
 * ## Centred, and still scrollable
 *
 * `justifyContent: 'center'` on scroll CONTENT is a real bug and `pnpm scrollable`
 * fails the build over it: content taller than the viewport gets centred past both
 * edges and the ends become unreachable. The correct shape is `flexGrow: 1` on the
 * content container and a `flex: 1` centred child inside it, which centres while the
 * content is short and scrolls normally once it is not.
 *
 * That is what this component is. A caller inside a `ScrollView` passes
 * `contentContainerStyle={{ flexGrow: 1 }}` and drops this in; a caller in a plain
 * `View` does nothing. Both get the same result, and neither has to know why.
 *
 * ## What it does not do
 *
 * It does not make a screen full. Centring redistributes emptiness — it halves the
 * largest gap and leaves the ink where it was. A screen that genuinely has too little
 * on it needs more on it, which is a decision per screen and not a component's to make.
 */

import type { ReactNode } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, space } from '../tokens.js'
import { text } from '../typography.js'

export type EmptyStateProps = {
  /**
   * The illustration, as an element rather than a name.
   *
   * `Art` lives in the app and resolves against its asset manifest; the design package
   * cannot import it without inverting the dependency. So the caller passes the picture
   * it wants at the size it wants, and this owns only where it sits.
   */
  readonly art?: ReactNode
  /**
   * Rendered as a heading. Required, and a string rather than a node, so a screen
   * cannot produce an empty state that a screen reader cannot navigate to — the design
   * system's rule that the accessible path is the easy path.
   */
  readonly title: string
  readonly body?: string
  /** The way out. A `Button`, usually — an empty state that names a next step and does
   *  not open it is a dead end, and this is where a new user is most likely to be. */
  readonly action?: ReactNode
  /** Anything below the action — a secondary link, a hint, a price. */
  readonly footnote?: ReactNode
  /**
   * Sits inside a card or a section rather than owning the screen.
   *
   * Drops the `flex: 1` and the outer padding, because a block that fills its parent is
   * right exactly once per screen and wrong everywhere else.
   */
  readonly compact?: boolean
  readonly style?: StyleProp<ViewStyle>
  readonly testID?: string
}

/**
 * The line length a centred paragraph stops being readable past.
 *
 * The same 320 the eight hand-rolled versions had all arrived at independently, which
 * is the best evidence available that it is the right number.
 */
const BODY_WIDTH = 320

export function EmptyState({
  art,
  title,
  body,
  action,
  footnote,
  compact = false,
  style,
  testID,
}: EmptyStateProps) {
  return (
    <View style={[compact ? styles.compact : styles.fill, style]} testID={testID}>
      {art !== undefined && <View style={styles.art}>{art}</View>}
      <Text style={styles.title} role="heading">
        {title}
      </Text>
      {body !== undefined && <Text style={styles.body}>{body}</Text>}
      {action !== undefined && <View style={styles.action}>{action}</View>}
      {footnote !== undefined && <View style={styles.footnote}>{footnote}</View>}
    </View>
  )
}

const shared = {
  alignItems: 'center',
  justifyContent: 'center',
  gap: space[3],
} as const

const styles = StyleSheet.create({
  /**
   * `flex: 1` and centred.
   *
   * Inside a plain `View` this fills the screen. Inside a `ScrollView` whose content
   * container has `flexGrow: 1` it fills the viewport when the content is short and
   * gives way to normal scrolling when it is not — which is the whole trick, and the
   * reason no screen has to write `justifyContent` again.
   */
  fill: { ...shared, flex: 1, padding: space[5] },
  compact: { ...shared },

  // Below the picture rather than on it: the gap belongs to the stack, and a margin
  // here would double it.
  art: { alignItems: 'center' },
  title: { ...text('h2'), color: colors.text.primary, textAlign: 'center' },
  body: {
    ...text('body'),
    color: colors.text.secondary,
    textAlign: 'center',
    maxWidth: BODY_WIDTH,
  },
  // One step more than the gap between the words above it. The action is a different
  // kind of thing from the sentence explaining it, and the space says so.
  action: { marginTop: space[2], alignItems: 'center' },
  footnote: { alignItems: 'center', maxWidth: BODY_WIDTH },
})
