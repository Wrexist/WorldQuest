/**
 * Which country labels fit, and where. Pure, so the collision rule is testable.
 *
 * Few labels beats many: a label behind the Earth, half off the edge or on top of
 * another is noise, so each is projected through the same camera as the globe and
 * placed greedily by priority. Widths are ESTIMATED from character count — measuring
 * text needs a layout pass per frame — so the estimate errs wide.
 */

import { degreesPerPoint, project } from './geo/camera.js'
import type { Camera, Viewport } from './geo/types.js'
import type { AtlasLabel } from './scene/types.js'

export type PlacedLabel = {
  readonly countryId: string
  readonly text: string
  /** Top-left, layout points. */
  readonly x: number
  readonly y: number
  readonly opacity: number
}

/**
 * How far map labels grow with the system text size — 1.3×, then they stop.
 *
 * A map label's position IS its meaning: "Algeria" twice the size covers Mali and Niger
 * and stops saying where Algeria is. The words themselves reach a screen reader through
 * the atlas's summary at full size, and these pills are hidden from it. Same reasoning,
 * and the same mechanism, as the tab labels' 1.2× in packages/design AppChrome.
 */
export const LABEL_MAX_SCALE = 1.3

/**
 * Caption size × average glyph width, plus the pill's padding, at the LARGEST size the
 * label may reach — so a layout made at 1× still holds when the text has grown to 1.3×.
 */
const CHAR_WIDTH = 7.6 * LABEL_MAX_SCALE
const PADDING = 18
const HEIGHT = 22 * LABEL_MAX_SCALE

/** The box a pin and its name occupy, tip at (x, y). Matches WorldAtlasView's styles. */
export function markerBox(x: number, y: number, label: string | null): Box {
  const head: Box = { x0: x - 16, y0: y - 44, x1: x + 16, y1: y + 2 }
  if (label === null) return head
  // The pin's name is an h3 pill: ~10.5 pt per glyph at the capped scale.
  return { ...head, y0: y - 52, x1: x + 44 + Math.min(220, label.length * 10.5 * LABEL_MAX_SCALE + 26) }
}
const MAX_LABELS = 10
/** Labels near the limb are foreshortened smears; they fade out and then go. */
const MIN_FACING = 0.18

export type Box = { x0: number; y0: number; x1: number; y1: number }

/** Where a label may sit relative to its anchor, in order of preference. */
const OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, HEIGHT + 4],
  [0, -(HEIGHT + 4)],
]

/**
 * `reserved` are boxes already taken — pins and their names — which always win: a
 * country label is context, a pin is the answer being taught.
 */
export function layoutLabels(
  labels: readonly AtlasLabel[],
  camera: Camera,
  viewport: Viewport,
  reserved: readonly Box[] = [],
): PlacedLabel[] {
  const placed: PlacedLabel[] = []
  const boxes: Box[] = [...reserved]
  for (const label of [...labels].sort((a, b) => b.priority - a.priority)) {
    if (placed.length >= MAX_LABELS) break
    const p = project(label, camera, viewport)
    if (!p.visible || p.facing < MIN_FACING) continue
    const width = label.text.length * CHAR_WIDTH + PADDING
    // A name wider than its country would hide the very shape it names: try beside it.
    const radiusPx = label.extent === undefined ? Infinity : label.extent / degreesPerPoint(camera, viewport)
    const beside = Math.min(radiusPx * 0.55, 70) + HEIGHT / 2 + 4
    // The subject's own name (priority 10 and up) goes beside it whenever its size is
    // known: the shape IS the question, and a name on top of it hides the coastline.
    const subject = label.priority >= 10 && label.extent !== undefined
    const offsets: readonly (readonly [number, number])[] =
      width / 2 <= radiusPx * 0.85 && !subject
        ? OFFSETS
        : [
            [0, beside],
            [0, -beside],
            [radiusPx * 0.8 + width / 2 + 4, 0],
            [-(radiusPx * 0.8 + width / 2 + 4), 0],
          ]
    for (const [dx, dy] of offsets) {
      const x = p.x - width / 2 + dx
      const y = p.y - HEIGHT / 2 + dy
      if (x < 2 || y < 2 || x + width > viewport.width - 2 || y + HEIGHT > viewport.height - 2) continue
      const box = { x0: x - 4, y0: y - 3, x1: x + width + 4, y1: y + HEIGHT + 3 }
      if (boxes.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue
      boxes.push(box)
      placed.push({ countryId: label.countryId, text: label.text, x, y, opacity: Math.min(1, 0.35 + p.facing) })
      break
    }
  }
  return placed
}
