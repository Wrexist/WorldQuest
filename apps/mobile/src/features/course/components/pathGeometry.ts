/**
 * The path's geometry, in one place — sizes and the zig-zag.
 *
 * Every number here is a shape rather than a spacing step, so each carries its reason,
 * the way `QUEST_ART` and `MASCOT_OF_SHEET` do elsewhere. The donor's figures (Duolingo's
 * iOS path) are from knowledge of the app, not a measured teardown — P03 is still open —
 * so each is checked against OUR constraints instead: a 320 pt column, a 44 pt target,
 * and 200 % text. See the graft in `.claude/skills/dna-transplant/references`.
 */

import { I18nManager } from 'react-native'
import { layout, space } from '@worldquest/design'

/**
 * The path's column before it has measured itself: Home's content width.
 *
 * The router caps every screen at `layout.maxContentWidth` and Home pads its content by
 * the gutter, so this is the measured width to within a rounding — the first frame's
 * zig-zag is already the right one on a phone and on a tablet, and nothing shifts when
 * the real measurement lands. (It used the window's width first, and on a 768 pt tablet
 * the tail of the first callout pointed 80 points to the side of its step.)
 */
export function estimatedColumn(windowWidth: number): number {
  return Math.max(0, Math.min(windowWidth, layout.maxContentWidth) - 2 * space[4])
}

/**
 * A step on the path.
 *
 * The donor's lesson circle is roughly a fifth of a phone's width. 64 is a fifth of 320,
 * clears the 44 pt target floor with room to spare, and leaves the zig-zag something to
 * swing in on the smallest supported phone.
 */
export const NODE = 64

/**
 * The current step, one size up.
 *
 * The one element on Home allowed to be big (visual-craft R4): the step you are on is
 * the primary action, and size is how the eye finds it before colour does — which also
 * keeps the signal when colour is not seen at all.
 */
export const CURRENT_NODE = 80

/** The glyph inside a step, about 45 % of it — the proportion the tab bar's icons hold. */
export const NODE_GLYPH = 28
export const CURRENT_GLYPH = 36

/** The lock worn by a step that is not open yet: a badge, so the shape says it, not colour. */
export const BADGE = 24
export const BADGE_GLYPH = 14

/** The point of a bubble — the same rotated square `SpeechBubble` uses. */
export const TAIL = 14

/**
 * The zig-zag, in steps from the centre line: a gentle wave that returns to the middle
 * every four nodes, as the donor's does.
 */
const SWING = [0, 1, 2, 1, 0, -1, -2, -1] as const

/**
 * How far one swing step may reach.
 *
 * At most a quarter of the free travel either side, so the widest swing uses half of it:
 * a step at full swing on a 320 pt column still leaves its callout and its bubble inside
 * the column at 200 % text. Capped so a tablet's wide column does not turn the path into
 * a slalom.
 */
const MAX_SWING_STEP = space[7]

/**
 * This step's offset from the column's centre, in points, for the n-th step of a unit.
 *
 * Each unit starts on the centre line again, as the donor's do: a unit header is a new
 * start, and a path that carried its phase across the header would begin the next unit
 * wherever the last one happened to stop.
 */
export function swingFor(indexInUnit: number, column: number): number {
  const step = Math.min(Math.max(0, (column - NODE) / 2 / 4), MAX_SWING_STEP)
  return (SWING[indexInUnit % SWING.length] ?? 0) * step
}

/**
 * The offset as a `translateX`, mirrored for a right-to-left layout.
 *
 * A transform is physical — it does not flip with the layout — while the bubble's tail is
 * placed with `start`, which does. Mirroring the swing keeps the tail over its step in
 * both directions, and the wave simply runs the other way.
 */
export function physicalSwing(swing: number): number {
  return I18nManager.isRTL ? -swing : swing
}
