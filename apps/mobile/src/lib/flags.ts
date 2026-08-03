/**
 * Flags.
 *
 * ## Why this file took so long to appear
 *
 * Flags sat in the "needs an illustrator" bucket for the whole life of the project,
 * filed beside the mascot and the landmark photography. That was the same mistake
 * `sound.ts` documents, and it went the same way: a correct-answer chime turned out to
 * be a sine wave, and a national flag turns out to be a public-domain design that
 * somebody has already drawn correctly and licensed for reuse.
 *
 * `docs/design/asset-prompts.md` had in fact said so since it was written — flags are
 * the one row in that table whose "source" column names a package rather than a brief,
 * precisely because **a generated flag with the wrong number of stars is a wrong
 * fact**, and a wrong fact is the one bug class this repo treats as unshippable. The
 * blocker was never "we cannot draw these", it was "we must not draw these", and
 * nobody had noticed those point in opposite directions.
 *
 * ## What this unlocks
 *
 * `tpl.flag-to-country.mc4` — "Which country's flag is this?", the mockup's lesson
 * screen — has been filtered out of every lesson since the composer learned to ask
 * what the host can present (see `PRESENTABLE` in ./content.ts). It comes back here.
 *
 * ## Missing is a placeholder, never a wrong flag
 *
 * `flagSource` returns `undefined` for anything the bundle does not have, and every
 * caller falls back to the reserved art slot. Rendering the wrong country's flag —
 * which is what a "closest match" or an alphabetical fallback would eventually do —
 * is worse than rendering nothing, because nothing is honest and a wrong flag teaches
 * a child something false.
 */

import type { ImageSourcePropType } from 'react-native'
import { FLAG_BY_PATH } from './flags.generated.js'

/**
 * The content pack's asset path (`flags/SE.png`) → something `Image` can render.
 *
 * Takes the PATH rather than the country code on purpose. The pack is what declares
 * where a flag lives and under what licence; if it ever names a file we do not ship,
 * this should miss and the placeholder should show, rather than a code-derived guess
 * quietly resolving to a different country's artwork.
 */
export function flagSource(path: string | undefined): ImageSourcePropType | undefined {
  if (path === undefined) return undefined
  const asset = FLAG_BY_PATH[path]
  if (asset === undefined) return undefined
  // Metro gives a number, Vite a URL string — see types/assets.d.ts.
  return typeof asset === 'string' ? { uri: asset } : asset
}

/**
 * 4:3, because that is what flag-icons normalises every flag to.
 *
 * Real flags are not one ratio — Japan is 2:3, the USA 10:19, Nepal is not even a
 * rectangle — so any single box is a convention, and taking the source set's costs
 * nothing. What is NOT free is picking a different one: squeezing 4:3 artwork into the
 * 3:2 slot this app used to reserve would stretch Japan's disc into an ellipse. That
 * is a wrong fact drawn rather than written, and it would be invisible in review.
 *
 * Every flag box in the app derives its height from this, so there is exactly one
 * place to be wrong.
 */
export const FLAG_ASPECT = 4 / 3

/** The height a flag of `width` must have. Rounded — a half pixel seams on Android. */
export const flagHeight = (width: number): number => Math.round(width / FLAG_ASPECT)
