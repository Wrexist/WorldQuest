/**
 * Country geometry for hit testing and outlines: the same cut rings the ID raster was
 * drawn from (scripts/build-atlas.cjs), so a tap and a highlight agree on every border.
 *
 * Rings are planar in lon/lat — the build cut them at the antimeridian and closed
 * Antarctica along the pole — so even-odd containment is exact here, holes included
 * (Lesotho inside South Africa, Vatican City inside Rome's Italy).
 */

import type { LatLon } from './types.js'

export type CountryGeometry = {
  readonly id: string
  readonly rasterId: number
  /** [west, south, east, north]. */
  readonly bbox: readonly [number, number, number, number]
  /** Each ring as interleaved lon, lat degrees. */
  readonly rings: readonly Float64Array[]
}

export type AtlasGeometry = {
  readonly countries: ReadonlyMap<string, CountryGeometry>
  readonly byRasterId: ReadonlyMap<number, string>
}

const MAGIC = 'WQA1'
const QUANT = 1e5

/** Parse `countries.bin`. Throws on anything that is not exactly the format written. */
export function parseAtlasGeometry(buffer: ArrayBuffer): AtlasGeometry {
  const view = new DataView(buffer)
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
  if (magic !== MAGIC) throw new Error(`atlas geometry: bad magic "${magic}"`)
  const count = view.getUint32(4, true)
  let at = 8
  const countries = new Map<string, CountryGeometry>()
  const byRasterId = new Map<number, string>()
  for (let i = 0; i < count; i++) {
    const rasterId = view.getUint16(at, true)
    const id = String.fromCharCode(view.getUint8(at + 2), view.getUint8(at + 3))
    const ringCount = view.getUint32(at + 4, true)
    at += 8
    const rings: Float64Array[] = []
    let w = Infinity
    let s = Infinity
    let e = -Infinity
    let n = -Infinity
    for (let r = 0; r < ringCount; r++) {
      const points = view.getUint32(at, true)
      at += 4
      const ring = new Float64Array(points * 2)
      for (let p = 0; p < points; p++) {
        const lon = view.getInt32(at, true) / QUANT
        const lat = view.getInt32(at + 4, true) / QUANT
        ring[p * 2] = lon
        ring[p * 2 + 1] = lat
        if (lon < w) w = lon
        if (lon > e) e = lon
        if (lat < s) s = lat
        if (lat > n) n = lat
        at += 8
      }
      rings.push(ring)
    }
    countries.set(id, { id, rasterId, bbox: [w, s, e, n], rings })
    byRasterId.set(rasterId, id)
  }
  if (at !== buffer.byteLength) throw new Error(`atlas geometry: ${buffer.byteLength - at} trailing bytes`)
  return { countries, byRasterId }
}

export function containsPoint(country: CountryGeometry, { lat, lon }: LatLon): boolean {
  const [w, s, e, n] = country.bbox
  if (lon < w || lon > e || lat < s || lat > n) return false
  let inside = false
  for (const ring of country.rings) {
    const count = ring.length / 2
    for (let i = 0, j = count - 1; i < count; j = i++) {
      const xi = ring[i * 2]!
      const yi = ring[i * 2 + 1]!
      const xj = ring[j * 2]!
      const yj = ring[j * 2 + 1]!
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

/**
 * The country containing a point, or null — over water, or over land that is not a pack
 * country (Western Sahara, Antarctica). Never "the nearest country": a near miss is a
 * miss, and silently promoting it would grade a tap the learner did not make.
 */
export function countryAt(geometry: AtlasGeometry, point: LatLon, eligible?: ReadonlySet<string>): string | null {
  // Every country that contains the point, smallest first. Natural Earth draws some
  // enclaves without cutting a hole in the country around them — Vatican City sits
  // inside Italy's outline, not in a gap in it — so the smaller shape is the enclave and
  // wins. The build rasterises in the same order (largest first), so the highlighted
  // texel and the tapped country agree.
  let best: CountryGeometry | null = null
  for (const country of geometry.countries.values()) {
    if (!containsPoint(country, point)) continue
    if (best === null || bboxArea(country) < bboxArea(best)) best = country
  }
  if (best === null) return null
  // Eligibility filters the ANSWER, never the geometry: a tap on Spain while only
  // Portugal is selectable is a miss, not Portugal.
  return eligible === undefined || eligible.has(best.id) ? best.id : null
}

function bboxArea(country: CountryGeometry): number {
  const [w, s, e, n] = country.bbox
  return (e - w) * (n - s)
}

/**
 * Line segments of a country's outline, as lon/lat pairs, with the cut edges removed.
 *
 * The build closed rings along ±180° and the south pole; those edges are where the
 * geometry was CUT, not borders, and drawing them would put a line down the
 * antimeridian through Fiji and Russia. Long edges are subdivided so a segment follows
 * the sphere instead of tunnelling under it.
 */
export function outlineSegments(country: CountryGeometry, maxStepDeg = 0.75): Float64Array {
  const out: number[] = []
  const cut = (a: number, b: number) =>
    (Math.abs(Math.abs(a) - 180) < 1e-6 && Math.abs(Math.abs(b) - 180) < 1e-6) // both on the seam
  for (const ring of country.rings) {
    const count = ring.length / 2
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count
      const x1 = ring[i * 2]!
      const y1 = ring[i * 2 + 1]!
      const x2 = ring[j * 2]!
      const y2 = ring[j * 2 + 1]!
      if (cut(x1, x2) && x1 === x2) continue
      if (y1 <= -89.999 && y2 <= -89.999) continue
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / maxStepDeg))
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps
        const t1 = (k + 1) / steps
        out.push(x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0, x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1)
      }
    }
  }
  return Float64Array.from(out)
}
