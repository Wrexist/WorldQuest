import { describe, expect, it } from 'vitest'
import {
  cameraForFrame,
  discRadius,
  globeRotation,
  interpolateCamera,
  MAX_DISTANCE,
  MIN_DISTANCE,
  panCamera,
  project,
  rotate,
  unproject,
  viewProjection,
  zoomCamera,
} from './camera.js'
import { angularDistance, toVec3 } from './sphere.js'
import type { Camera, Viewport } from './types.js'

const VIEW: Viewport = { width: 358, height: 220 }
const SPAIN: Camera = { lat: 40, lon: -4, distance: 2.2 }

describe('the camera', () => {
  it('turns its target to face the viewer', () => {
    const [x, y, z] = rotate(globeRotation(SPAIN), toVec3(SPAIN))
    expect(x).toBeCloseTo(0, 9)
    expect(y).toBeCloseTo(0, 9)
    expect(z).toBeCloseTo(1, 9)
  })

  it('draws the target at the centre and east to the right, north up', () => {
    const centre = project(SPAIN, SPAIN, VIEW)
    expect(centre.x).toBeCloseTo(VIEW.width / 2, 6)
    expect(centre.y).toBeCloseTo(VIEW.height / 2, 6)
    expect(project({ lat: 40, lon: 0 }, SPAIN, VIEW).x).toBeGreaterThan(centre.x)
    expect(project({ lat: 45, lon: -4 }, SPAIN, VIEW).y).toBeLessThan(centre.y)
  })

  it('agrees with the matrix the GPU gets', () => {
    const m = viewProjection(SPAIN, VIEW.width / VIEW.height)
    const p = toVec3({ lat: 48.85, lon: 2.35 })
    const clip = [0, 1, 2, 3].map((r) => m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]!)
    const ndc = [clip[0]! / clip[3]!, clip[1]! / clip[3]!]
    const screen = project({ lat: 48.85, lon: 2.35 }, SPAIN, VIEW)
    expect(((ndc[0]! + 1) / 2) * VIEW.width).toBeCloseTo(screen.x, 3)
    expect(((1 - ndc[1]!) / 2) * VIEW.height).toBeCloseTo(screen.y, 3)
  })

  it('round-trips a tap through project and unproject', () => {
    for (const point of [
      { lat: 40.40197, lon: -3.6853 },
      { lat: 43, lon: 5 },
      { lat: 36.1, lon: -5.35 },
      { lat: 28.1, lon: -15.4 }, // Canaries, off-centre
    ]) {
      const s = project(point, SPAIN, VIEW)
      const back = unproject(s.x, s.y, SPAIN, VIEW)
      expect(back).not.toBeNull()
      expect(angularDistance(back!, point)).toBeLessThan(1e-6)
    }
  })

  it('round-trips across the antimeridian', () => {
    const fiji: Camera = { lat: -17.8, lon: 178.5, distance: 1.6 }
    for (const point of [{ lat: -16.5, lon: 179.9 }, { lat: -16.7, lon: -179.9 }]) {
      const s = project(point, fiji, VIEW)
      const back = unproject(s.x, s.y, fiji, VIEW)
      expect(angularDistance(back!, point)).toBeLessThan(1e-6)
    }
  })

  it('hides what is behind the Earth and returns nothing for a tap off the disc', () => {
    expect(project({ lat: -40, lon: 176 }, SPAIN, VIEW).visible).toBe(false) // antipode
    expect(project(SPAIN, SPAIN, VIEW).visible).toBe(true)
    const far: Camera = { lat: 0, lon: 0, distance: MAX_DISTANCE }
    expect(unproject(2, 2, far, VIEW)).toBeNull()
  })

  it('treats the horizon exactly: a point just past it is hidden', () => {
    const d = 2
    const horizon = (Math.acos(1 / d) * 180) / Math.PI
    const cam: Camera = { lat: 0, lon: 0, distance: d }
    expect(project({ lat: 0, lon: horizon - 0.5 }, cam, VIEW).visible).toBe(true)
    expect(project({ lat: 0, lon: horizon + 0.5 }, cam, VIEW).visible).toBe(false)
  })

  it('frames a country inside the viewport, wider subjects from farther away', () => {
    const small = cameraForFrame({ lat: 40, lon: -4, radius: 10 }, VIEW)
    const large = cameraForFrame({ lat: 60, lon: 90, radius: 40 }, VIEW)
    expect(large.distance).toBeGreaterThan(small.distance)
    // The frame's edge lands inside the viewport.
    const edge = project({ lat: 40, lon: -4 + 10 / Math.cos((40 * Math.PI) / 180) }, small, VIEW)
    expect(edge.x).toBeLessThan(VIEW.width)
    const top = project({ lat: 50, lon: -4 }, small, VIEW)
    expect(top.y).toBeGreaterThan(0)
  })

  it('keeps the subject in the uncovered part when a sheet covers the bottom', () => {
    const covered = cameraForFrame({ lat: 40, lon: -4, radius: 8 }, { ...VIEW, insets: { top: 0, bottom: 100, minX: 0, maxX: 0 } })
    const p = project({ lat: 40, lon: -4 }, covered, { ...VIEW })
    expect(p.y).toBeLessThan(VIEW.height / 2)
  })

  it('never zooms past the texture or out past the whole globe', () => {
    expect(cameraForFrame({ lat: 41.9, lon: 12.45, radius: 0.01 }, VIEW).distance).toBeGreaterThanOrEqual(MIN_DISTANCE)
    expect(zoomCamera(SPAIN, 100).distance).toBe(MIN_DISTANCE)
    expect(zoomCamera(SPAIN, 0.001).distance).toBe(MAX_DISTANCE)
  })

  it('pans with the finger: drag right shows what was west, drag down shows what was north', () => {
    const right = panCamera(SPAIN, 40, 0, VIEW)
    expect(right.lon).toBeLessThan(SPAIN.lon)
    const down = panCamera(SPAIN, 0, 40, VIEW)
    expect(down.lat).toBeGreaterThan(SPAIN.lat)
    expect(panCamera({ ...SPAIN, lat: 79 }, 0, 10_000, VIEW).lat).toBeLessThanOrEqual(80)
  })

  it('interpolates the short way across the antimeridian', () => {
    const mid = interpolateCamera({ lat: 0, lon: 170, distance: 2 }, { lat: 0, lon: -170, distance: 2 }, 0.5)
    expect(Math.abs(mid.lon)).toBeCloseTo(180, 6)
  })

  it('reports a disc that shrinks with distance', () => {
    expect(discRadius({ ...SPAIN, distance: 4 }, VIEW)).toBeLessThan(discRadius({ ...SPAIN, distance: 2 }, VIEW))
  })
})
