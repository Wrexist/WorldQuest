/**
 * The one action a screen is for, pinned where the thumb already is.
 *
 * ## Why this exists
 *
 * Reported off TestFlight: on the country page the green *Träna* button is the reason
 * the page exists, and it was the last child of a `ScrollView`. On a country with six
 * facts it sits below the fold, so the screen's primary action was invisible until you
 * scrolled to the bottom of a page whose content is a list you were reading anyway. The
 * region page had the same shape with *Starta*.
 *
 * Both screens now put their action here instead: outside the scroller, in a flex column,
 * so the list scrolls under a control that never leaves.
 *
 * ## Why it is a component and not two copies of three styles
 *
 * Because the interesting part is not the padding. A control pinned over scrolling
 * content needs a surface of its own or the words behind it show through the gap between
 * the button and the screen edge, and it needs a hairline so the eye reads it as chrome
 * rather than as the next row of the list. That is three decisions, and two screens
 * making them separately is how they drift.
 *
 * ## What it deliberately does NOT do
 *
 * No shadow, no blur, no translucency. `Card` owns elevation in this design system and a
 * second elevated surface at the bottom of every screen would compete with it — and a
 * translucent bar over a dark canvas is where text contrast quietly stops being
 * measurable, which `design:contrast` checks token pairs for and cannot see through.
 * Solid `bg.canvas`, the same colour the screen is already painted in, so the only thing
 * that marks the boundary is the hairline.
 */

import { StyleSheet, View, type ViewStyle } from 'react-native'
import { colors, space } from '@worldquest/design'

export type StickyFooterProps = {
  readonly children: React.ReactNode
  readonly style?: ViewStyle | undefined
}

export function StickyFooter({ children, style }: StickyFooterProps) {
  return <View style={[styles.footer, style]}>{children}</View>
}

const styles = StyleSheet.create({
  footer: {
    padding: space[4],
    gap: space[2],
    // Opaque, and the canvas colour rather than a surface: see the header. The list
    // scrolls *under* this, so anything less than opaque puts a country name behind a
    // button label.
    backgroundColor: colors.bg.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
})
