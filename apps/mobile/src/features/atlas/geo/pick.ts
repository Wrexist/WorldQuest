/**
 * Which country a finger meant. Pure: a tap point and the ways to look things up, in; an id out.
 *
 * `countryAt` answers a narrower question — which outline contains this exact point — and a
 * finger is not a point. It covers about forty points of glass, Liechtenstein is a few
 * pixels wide at a continent's zoom, and a child aiming at Croatia's coast lands in the
 * Adriatic as often as on land. A map drill that refused those taps would be grading aim,
 * not geography (map-drill research, 2026-10-10: JetPunk circles microstates and forgives
 * near misses; Seterra's small-country circles are the most-praised thing about it).
 *
 * So, in order:
 *
 * 1. **A ring.** Countries too small to see by fill alone are drawn with a ring around them
 *    (`AtlasSceneSpec.rings`). A tap inside a ring is that country, even when it is inside
 *    Italy too: a ring is a promise that it can be tapped there.
 * 2. **The outline** under the finger, exactly as before.
 * 3. **The nearest outline** within a finger's reach: points on two small circles around the
 *    tap, inner first, so the closest land wins and a tap in open sea far from anything still
 *    selects nothing.
 */

import type { LatLon } from './types.js'

export type PickInput = {
  /** The tap, in the view's own points. */
  readonly x: number
  readonly y: number
  /** Screen point to globe point; null off the globe. */
  readonly unproject: (x: number, y: number) => LatLon | null
  /** Globe point to screen point. */
  readonly project: (point: LatLon) => { readonly x: number; readonly y: number; readonly visible: boolean }
  /** Which eligible country's outline contains this point, if any. */
  readonly hit: (point: LatLon) => string | null
  /** Ringed countries: tappable anywhere inside their ring. Already narrowed to the eligible. */
  readonly rings: readonly { readonly countryId: string; readonly lat: number; readonly lon: number }[]
  /** A ring's radius in points. */
  readonly ringRadius: number
  /** How far a near miss may be, in points. */
  readonly reach: number
}

/** Eight directions, so a near miss is found whichever side of the coast it fell. */
const DIRECTIONS = 8

export function pickCountry(input: PickInput): string | null {
  const { x, y } = input

  // 1. Rings first, nearest centre wins: two microstates' rings can overlap (San Marino
  //    and Vatican City at a continent's zoom), and the closer one is what was aimed at.
  let ringed: string | null = null
  let nearest = Infinity
  for (const ring of input.rings) {
    const p = input.project(ring)
    if (!p.visible) continue
    const d = Math.hypot(p.x - x, p.y - y)
    if (d <= input.ringRadius && d < nearest) {
      nearest = d
      ringed = ring.countryId
    }
  }
  if (ringed !== null) return ringed

  // 2. The outline under the finger.
  const at = input.unproject(x, y)
  if (at !== null) {
    const direct = input.hit(at)
    if (direct !== null) return direct
  }

  // 3. The closest outline within reach: the country hit most often on the inner circle,
  //    else on the outer one. A tie goes to the first direction found, which is stable.
  for (const radius of [input.reach / 2, input.reach]) {
    const counts = new Map<string, number>()
    for (let i = 0; i < DIRECTIONS; i++) {
      const angle = (i / DIRECTIONS) * Math.PI * 2
      const point = input.unproject(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
      if (point === null) continue
      const id = input.hit(point)
      if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    let best: string | null = null
    let most = 0
    for (const [id, count] of counts) {
      if (count > most) {
        most = count
        best = id
      }
    }
    if (best !== null) return best
  }
  return null
}
