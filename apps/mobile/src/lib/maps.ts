/**
 * Country and region outlines.
 *
 * ## Why this file took so long to appear, which is the interesting part
 *
 * Map thumbnails sat in `docs/design/mockup-fidelity.md` under "needs assets — blocked
 * on a decision" for the life of the project. They were never blocked. Two other
 * documents said so:
 *
 * - `docs/design/asset-prompts.md` lists **Country / continent geometry** under **⛔
 *   Never generate these**, and names **Natural Earth (public domain)** as the source
 *   in the same row — for the same reason it does for flags, that an invented
 *   coastline is a wrong fact and an invented border is a political claim.
 * - **ADR 0008** accepted that source, by name, months ago.
 *
 * "Never draw this" and "we cannot have this" point in opposite directions, and this
 * project has now confused them three times: sound (a chime is a sine wave), flags (a
 * national flag is a public-domain drawing), and geometry. The pack even carried a
 * `geometry: "geo/countries/SE.svg"` field on all 65 entities that nothing ever read.
 *
 * The lesson is not about maps. **When something is filed as blocked, check what it is
 * blocked on** — the note saying "never generate this" is written by someone who knew
 * where to get it, and usually says so in the next clause.
 *
 * ## Two layers, both alpha masks
 *
 * `geo/regions/<REGION>.png` is the continent; `geo/countries/<CODE>.png` is one
 * country inside the same projection frame. Stacked, they line up. Both are white on
 * transparent, so the COLOUR IS THE CALLER'S: tint them from design tokens and the map
 * re-themes with everything else. Treating either as finished artwork with a colour of
 * its own would hard-code a palette into a PNG, which is the thing tokens exist to
 * prevent.
 *
 * ## Missing is a placeholder, never a substitute
 *
 * Like `flagSource`, this returns `undefined` for anything the bundle does not have,
 * and callers fall back to the reserved art slot. A "closest match" would eventually
 * show a child one country's outline under another country's name.
 */

import type { ImageSourcePropType } from 'react-native'
import { MAP_BY_PATH } from './maps.generated.js'

/**
 * A content-pack asset path (`geo/countries/SE.png`) → something `Image` can render.
 *
 * Takes the PATH rather than the country code, for the reason `flagSource` documents:
 * the pack declares where the artwork lives and under what licence, so a pack naming a
 * file we do not ship must miss this lookup rather than have a code-derived guess
 * resolve to somebody else's outline.
 */
export function mapSource(path: string | undefined): ImageSourcePropType | undefined {
  if (path === undefined) return undefined
  const asset = MAP_BY_PATH[path]
  if (asset === undefined) return undefined
  // Metro gives a number, Vite a URL string — see types/assets.d.ts.
  return typeof asset === 'string' ? { uri: asset } : asset
}

/** The region layer that shares a country layer's frame. */
export const regionMapPath = (region: string): string => `geo/regions/${region}.png`

/**
 * 4:3, the same box as a flag.
 *
 * Deliberate: the lesson prompt is one slot and both a flag and a map can land in it.
 * Two different aspect ratios there would shift the answers up and down depending on
 * which template the composer happened to pick, which reads as jitter rather than as
 * variety. `scripts/build-maps.cjs` rasterises to exactly this.
 */
export const MAP_ASPECT = 4 / 3

/** The height a map of `width` must have. Rounded — a half pixel seams on Android. */
export const mapHeight = (width: number): number => Math.round(width / MAP_ASPECT)
