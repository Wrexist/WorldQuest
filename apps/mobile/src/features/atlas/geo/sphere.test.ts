import { describe, expect, it } from 'vitest'
import { angularDistance, distanceKm, lonDelta, normalizeLon, toLatLon, toTextureUv, toVec3 } from './sphere.js'

describe('the coordinate convention', () => {
  it('puts (0°, 0°) on +Z, 90°E on +X and the north pole on +Y', () => {
    const at = (lat: number, lon: number) => toVec3({ lat, lon }).map((v) => Math.round(v * 1e9) / 1e9)
    expect(at(0, 0)).toEqual([0, 0, 1])
    expect(at(0, 90)).toEqual([1, 0, 0])
    expect(at(90, 0)).toEqual([0, 1, 0])
    expect(at(0, -90)).toEqual([-1, 0, 0])
  })

  it('round-trips points everywhere, including the antimeridian and near the poles', () => {
    const points = [
      { lat: 40.40197, lon: -3.6853 }, // Madrid
      { lat: -18.13302, lon: 178.44171 }, // Suva
      { lat: 64.73, lon: -177.5 }, // Chukotka, west of the antimeridian
      { lat: -89.5, lon: 45 },
      { lat: 1.29, lon: 103.85 }, // Singapore
      { lat: 0, lon: 180 },
    ]
    for (const p of points) {
      const back = toLatLon(toVec3(p))
      expect(back.lat).toBeCloseTo(p.lat, 9)
      expect(normalizeLon(back.lon - p.lon)).toBeCloseTo(0, 9)
    }
  })

  it('gives a pole a defined longitude rather than NaN', () => {
    expect(toLatLon([0, 1, 0])).toEqual({ lat: 90, lon: 0 })
  })

  it('normalises longitude into (−180, 180]', () => {
    expect(normalizeLon(190)).toBe(-170)
    expect(normalizeLon(-180)).toBe(180)
    expect(normalizeLon(540)).toBe(180)
    expect(normalizeLon(-190)).toBe(170)
  })

  it('takes the short way across the antimeridian', () => {
    expect(lonDelta(178, -178)).toBe(4)
    expect(lonDelta(-178, 178)).toBe(-4)
  })

  it('measures known distances', () => {
    // Madrid → Paris is ~1 053 km great-circle.
    expect(distanceKm({ lat: 40.4168, lon: -3.7038 }, { lat: 48.8566, lon: 2.3522 })).toBeGreaterThan(1040)
    expect(distanceKm({ lat: 40.4168, lon: -3.7038 }, { lat: 48.8566, lon: 2.3522 })).toBeLessThan(1065)
    expect(angularDistance({ lat: 0, lon: 179 }, { lat: 0, lon: -179 })).toBeCloseTo(2, 9)
  })

  it('maps to the equirectangular texture with row 0 at the north', () => {
    expect(toTextureUv({ lat: 90, lon: -180 })).toEqual([1, 0]) // −180 is named 180
    expect(toTextureUv({ lat: 0, lon: 0 })).toEqual([0.5, 0.5])
    expect(toTextureUv({ lat: -90, lon: 90 })).toEqual([0.75, 1])
  })
})
