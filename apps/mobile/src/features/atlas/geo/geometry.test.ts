/**
 * Against the SHIPPED binary, not a fixture: a hit test is only as right as the file it
 * reads, so the file is what is tested.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { containsPoint, countryAt, outlineSegments, parseAtlasGeometry } from './geometry.js'

const bin = readFileSync(join(__dirname, '..', '..', '..', '..', 'assets', 'atlas', 'countries.bin'))
const geometry = parseAtlasGeometry(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength))

describe('country geometry', () => {
  it('holds every pack country exactly once', () => {
    expect(geometry.countries.size).toBe(194)
    expect(new Set([...geometry.countries.values()].map((c) => c.rasterId)).size).toBe(194)
  })

  it.each([
    ['ES', 40.4168, -3.7038], // Madrid
    ['SE', 59.3293, 18.0686], // Stockholm
    ['JP', 35.6762, 139.6503], // Tokyo
    ['FJ', -18.1416, 178.4419], // Suva, east of the antimeridian
    ['FJ', -16.78, -179.95], // Taveuni area, west of it — same country
    ['RU', 66.0, -172.0], // Chukotka, across the antimeridian
    ['SG', 1.3521, 103.8198],
    ['ZA', -26.2041, 28.0473], // Johannesburg
    ['LS', -29.31, 27.48], // Maseru, inside South Africa's hole
    ['VA', 41.9029, 12.4534], // Vatican City, inside Rome
    ['IT', 41.8933, 12.4829], // Rome, outside the Vatican
    ['ID', -6.2088, 106.8456], // Jakarta, on Java
    ['ID', -2.5, 140.7], // Jayapura, on New Guinea
    ['NZ', -41.2865, 174.7762],
    ['CL', -33.4489, -70.6693],
  ])('finds %s at (%f, %f)', (id, lat, lon) => {
    expect(countryAt(geometry, { lat, lon })).toBe(id)
  })

  it('returns null over open water and over land no pack country owns', () => {
    expect(countryAt(geometry, { lat: 30, lon: -40 })).toBeNull() // mid-Atlantic
    expect(countryAt(geometry, { lat: -80, lon: 0 })).toBeNull() // Antarctica
    expect(countryAt(geometry, { lat: 72, lon: -40 })).toBeNull() // Greenland
  })

  it('never answers with a neighbour for a point just outside a country', () => {
    // Off the Portuguese coast: the nearest country is Portugal, and the answer is still none.
    expect(countryAt(geometry, { lat: 39.5, lon: -9.8 })).toBeNull()
  })

  it('restricts hits to eligible countries without changing which country is hit', () => {
    expect(countryAt(geometry, { lat: 40.4168, lon: -3.7038 }, new Set(['PT']))).toBeNull()
  })

  it('keeps Lesotho as a hole in South Africa', () => {
    const za = geometry.countries.get('ZA')!
    expect(containsPoint(za, { lat: -29.31, lon: 27.48 })).toBe(false)
  })

  it('draws no outline along the antimeridian where Fiji and Russia were cut', () => {
    for (const id of ['FJ', 'RU']) {
      const segments = outlineSegments(geometry.countries.get(id)!)
      for (let i = 0; i < segments.length; i += 4) {
        const onSeam = Math.abs(Math.abs(segments[i]!) - 180) < 1e-6 && segments[i] === segments[i + 2]
        expect(onSeam).toBe(false)
      }
    }
  })

  it('subdivides long outline edges so they follow the sphere', () => {
    const segments = outlineSegments(geometry.countries.get('US')!, 0.75)
    for (let i = 0; i < segments.length; i += 4) {
      expect(Math.abs(segments[i + 2]! - segments[i]!)).toBeLessThanOrEqual(0.75 + 1e-9)
    }
  })

  it('refuses a file that is not exactly the format', () => {
    const bad = new Uint8Array(bin)
    bad[0] = 0x58
    expect(() => parseAtlasGeometry(bad.buffer)).toThrow(/magic/)
    const longer = new Uint8Array(bin.length + 4)
    longer.set(bin)
    expect(() => parseAtlasGeometry(longer.buffer)).toThrow(/trailing/)
  })
})
