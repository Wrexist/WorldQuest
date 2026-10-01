/**
 * The atlas's one coordinate convention. Everything — texture, ID raster, picking,
 * markers, camera — goes through it, so they cannot disagree. See ADR 0017.
 *
 * GEOGRAPHIC   degrees. `lat` ∈ [−90, 90], north positive. `lon` ∈ (−180, 180], east
 *              positive. Always passed as `{ lat, lon }` objects: GeoJSON's [lon, lat]
 *              order exists only inside the build script and the binary reader.
 *
 * WORLD        right-handed, unit sphere. +Y is the north pole, +Z is (0°, 0°), +X is
 *              (0°, 90°E). So `x = cos φ sin λ`, `y = sin φ`, `z = cos φ cos λ`.
 *
 * TEXTURE      equirectangular. u = (λ + 180) / 360, v = (90 − φ) / 180, row 0 is north.
 *              Both `earth.jpg` and `countries.png` use it, with no flip.
 *
 * VIEW         the globe is rotated so the camera's target faces +Z, then viewed from
 *              (0, 0, distance) looking down −Z with +Y up. North stays up, always:
 *              there is no roll, which is why there is no compass to keep honest.
 */

export type LatLon = { readonly lat: number; readonly lon: number }

export type Vec3 = readonly [number, number, number]

/** Where the camera points and how far away it is, in globe radii from the centre. */
export type Camera = { readonly lat: number; readonly lon: number; readonly distance: number }

/** A region of the sphere to frame: a centre and an angular radius in degrees. */
export type AtlasFrame = { readonly lat: number; readonly lon: number; readonly radius: number }

/** The visible atlas rectangle, in layout points, and what covers its edges. */
export type Viewport = {
  readonly width: number
  readonly height: number
  /**
   * Points of the viewport covered by overlays (a sheet, a card). PHYSICAL edges — minX is
   * the screen's left, maxX its right — because the globe's image does not mirror in a
   * right-to-left locale; Spain is west of Italy in Arabic too.
   */
  readonly insets?: { readonly top: number; readonly bottom: number; readonly minX: number; readonly maxX: number }
}

export type AtlasCountry = {
  readonly id: string
  /** Index into the ID raster; 0 is water. */
  readonly rasterId: number
  readonly region: string
  /** [lat, lon] pole of inaccessibility of the largest part: inside it by construction. */
  readonly anchor: readonly [number, number]
  /** The main landmass's frame — outlying territories excluded from framing, never deleted. */
  readonly frame: AtlasFrame
  /** Angular radius of every part, including outlying ones. */
  readonly extent: number
  /** ID raster texels this country owns. */
  readonly pixels: number
  /** Too few texels to find by fill alone: drawn with a ring marker too. */
  readonly small: boolean
}

/**
 * A verified place. Provenance (Natural Earth row, GeoNames cross-check, any naming
 * difference) is in docs/design/world-atlas/atlas-manifest.generated.json, keyed by `id`.
 */
export type AtlasPlace = {
  readonly id: string
  readonly countryId: string
  /** The content fact this place is the value of. Its name comes from that fact. */
  readonly factId: string
  readonly role: 'capital'
  readonly quizzable: boolean
  readonly lat: number
  readonly lon: number
}
