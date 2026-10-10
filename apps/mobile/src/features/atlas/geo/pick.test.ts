import { describe, expect, it } from 'vitest'
import { pickCountry, type PickInput } from './pick.js'

/**
 * A flat test world, one degree per point: "IT" covers x 0–100, "FR" x 100–200, nothing
 * beyond 200 (the sea). "SM" is a ringed microstate at (50, 50), inside Italy's outline.
 */
const world = (over: Partial<PickInput> = {}): PickInput => ({
  x: 0,
  y: 0,
  unproject: (x, y) => ({ lat: y, lon: x }),
  project: (p) => ({ x: p.lon, y: p.lat, visible: true }),
  hit: (p) => (p.lon >= 0 && p.lon < 100 ? 'IT' : p.lon >= 100 && p.lon < 200 ? 'FR' : null),
  rings: [{ countryId: 'SM', lat: 50, lon: 50 }],
  ringRadius: 17,
  reach: 24,
  ...over,
})

describe('which country a finger meant', () => {
  it('takes the outline under the finger', () => {
    expect(pickCountry(world({ x: 150, y: 10 }))).toBe('FR')
  })

  it('takes a ringed country anywhere inside its ring, even inside a neighbour', () => {
    expect(pickCountry(world({ x: 60, y: 58 }))).toBe('SM')
    expect(pickCountry(world({ x: 50, y: 80 }))).toBe('IT')
  })

  it('prefers the nearer of two overlapping rings', () => {
    const rings = [{ countryId: 'SM', lat: 50, lon: 50 }, { countryId: 'VA', lat: 50, lon: 70 }]
    expect(pickCountry(world({ x: 64, y: 50, rings }))).toBe('VA')
  })

  it('forgives a near miss into the sea, and only a near one', () => {
    expect(pickCountry(world({ x: 205, y: 10 }))).toBe('FR')
    expect(pickCountry(world({ x: 260, y: 10 }))).toBeNull()
  })

  it('ignores a ring that is round the back of the globe', () => {
    const project: PickInput['project'] = (p) => ({ x: p.lon, y: p.lat, visible: p.lon !== 50 })
    expect(pickCountry(world({ x: 50, y: 50, project }))).toBe('IT')
  })

  it('selects nothing off the globe', () => {
    expect(pickCountry(world({ x: 150, y: 10, unproject: () => null, rings: [] }))).toBeNull()
  })
})
