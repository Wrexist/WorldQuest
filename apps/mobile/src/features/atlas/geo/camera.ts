/**
 * The camera: one set of matrices, used by the GPU and by every overlay and hit test.
 *
 * The renderer uploads `viewProjection(...)` and the rotation from `globeRotation(...)`;
 * markers call `project`, taps call `unproject`. They are the same numbers, computed in
 * the same place, so a pin cannot drift from the coastline it marks and a tap cannot hit
 * a different country from the one drawn under the finger. Pure: no React, no GL.
 */

import { clampLat, lonDelta, normalizeLon, toLatLon, toVec3 } from './sphere.js'
import type { AtlasFrame, Camera, LatLon, Vec3, Viewport } from './types.js'

const RAD = Math.PI / 180

/** Vertical field of view. Narrow, so the globe reads as a globe, not a fish-eye. */
export const FOV_Y = 30 * RAD
/** Closest the camera may get, in globe radii from the centre. ~0.06 R above the surface. */
export const MIN_DISTANCE = 1.06
/** Far enough that the whole globe fits a phone-width viewport with margin. */
export const MAX_DISTANCE = 4.6
/**
 * Never closer than this in degrees of visible radius: the 1:50m surface texture is
 * ~0.09° per texel at 4096 wide, and zooming further shows texels, which is misleading
 * detail rather than more of it.
 */
export const MIN_FRAME_RADIUS = 1.6
/** North stays up; this keeps the poles reachable without the view flipping over. */
export const MAX_CAMERA_LAT = 80

export const WORLD_CAMERA: Camera = { lat: 20, lon: 10, distance: MAX_DISTANCE * 0.86 }

/** Row-major 3×3 rotation that turns the camera target to +Z. M = Rx(lat) · Ry(−lon). */
export function globeRotation(camera: Pick<Camera, 'lat' | 'lon'>): readonly number[] {
  const a = camera.lat * RAD
  const b = -camera.lon * RAD
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const cb = Math.cos(b)
  const sb = Math.sin(b)
  // Ry(b) = [cb 0 sb; 0 1 0; −sb 0 cb], Rx(a) = [1 0 0; 0 ca −sa; 0 sa ca]
  return [cb, 0, sb, sa * sb, ca, -sa * cb, -ca * sb, sa, ca * cb]
}

export function rotate(m: readonly number[], [x, y, z]: Vec3): Vec3 {
  return [m[0]! * x + m[1]! * y + m[2]! * z, m[3]! * x + m[4]! * y + m[5]! * z, m[6]! * x + m[7]! * y + m[8]! * z]
}

/** The inverse of a rotation is its transpose. */
export function rotateInverse(m: readonly number[], [x, y, z]: Vec3): Vec3 {
  return [m[0]! * x + m[3]! * y + m[6]! * z, m[1]! * x + m[4]! * y + m[7]! * z, m[2]! * x + m[5]! * y + m[8]! * z]
}

/**
 * Column-major 4×4 (as WebGL wants it): perspective × translate(0, 0, −d) × rotation.
 * `aspect` is width / height of the drawing buffer.
 */
export function viewProjection(camera: Camera, aspect: number): Float32Array {
  const f = 1 / Math.tan(FOV_Y / 2)
  const near = Math.max(0.01, camera.distance - 1.05)
  const far = camera.distance + 1.2
  const r = globeRotation(camera)
  const d = camera.distance
  // P × T, then × R (R padded to 4×4). P·T rows:
  //   [f/aspect, 0, 0, 0]
  //   [0, f, 0, 0]
  //   [0, 0, A, B − A·d]   where A = (far+near)/(near−far), B = 2·far·near/(near−far)
  //   [0, 0, −1, d]
  const A = (far + near) / (near - far)
  const B = (2 * far * near) / (near - far)
  const rows = [
    [(f / aspect) * r[0]!, (f / aspect) * r[1]!, (f / aspect) * r[2]!, 0],
    [f * r[3]!, f * r[4]!, f * r[5]!, 0],
    [A * r[6]!, A * r[7]!, A * r[8]!, -A * d + B],
    [-r[6]!, -r[7]!, -r[8]!, d],
  ]
  const out = new Float32Array(16)
  for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) out[c * 4 + rr] = rows[rr]![c]!
  return out
}

export type Projected = {
  /** Layout points from the viewport's top-left. */
  readonly x: number
  readonly y: number
  /** On the camera-facing side of the globe. A hidden point must not be drawn or tapped. */
  readonly visible: boolean
  /** 1 at the centre of the visible disc, 0 at the horizon — for fading labels. */
  readonly facing: number
}

/** Where a point lands on screen, and whether the Earth is in front of it. */
export function project(point: LatLon, camera: Camera, viewport: Viewport, altitude = 0): Projected {
  const p = rotate(globeRotation(camera), toVec3(point))
  const r = 1 + altitude
  const x = p[0] * r
  const y = p[1] * r
  const z = p[2] * r
  const depth = camera.distance - z
  const f = 1 / Math.tan(FOV_Y / 2)
  const aspect = viewport.width / viewport.height
  const ndcX = (f / aspect) * (x / depth)
  const ndcY = f * (y / depth)
  // Visible from (0, 0, d) iff p · (0, 0, d) > 1 for a point on the unit sphere.
  const horizon = 1 / camera.distance
  return {
    x: ((ndcX + 1) / 2) * viewport.width,
    y: ((1 - ndcY) / 2) * viewport.height,
    visible: p[2] > horizon,
    facing: Math.max(0, Math.min(1, (p[2] - horizon) / (1 - horizon))),
  }
}

/** The geographic point under a screen position, or null when the ray misses the Earth. */
export function unproject(x: number, y: number, camera: Camera, viewport: Viewport): LatLon | null {
  const f = 1 / Math.tan(FOV_Y / 2)
  const aspect = viewport.width / viewport.height
  const ndcX = (x / viewport.width) * 2 - 1
  const ndcY = 1 - (y / viewport.height) * 2
  // Ray from (0, 0, d) through the near-plane point at z = d − 1.
  const dir: Vec3 = [ndcX * (aspect / f), ndcY / f, -1]
  const o: Vec3 = [0, 0, camera.distance]
  const a = dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2
  const b = 2 * (o[2] * dir[2])
  const c = o[2] ** 2 - 1
  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  if (t <= 0) return null
  const hit: Vec3 = [o[0] + t * dir[0], o[1] + t * dir[1], o[2] + t * dir[2]]
  return toLatLon(rotateInverse(globeRotation(camera), hit))
}

/** Radius of the globe's disc on screen, layout points. */
export function discRadius(camera: Camera, viewport: Viewport): number {
  const f = 1 / Math.tan(FOV_Y / 2)
  // The limb is where the tangent ray touches: angular radius asin(1/d).
  const half = Math.tan(Math.asin(1 / camera.distance))
  return (half * f * viewport.height) / 2
}

/**
 * The camera that fits a frame inside the uncovered part of the viewport.
 *
 * Solves for the distance at which a point `radius` degrees from the centre lands at
 * `fill` of the half-extent, horizontally and vertically, and takes the farther one.
 * Insets shift the target so the frame sits in the visible gap, not under a sheet.
 */
export function cameraForFrame(frame: AtlasFrame, viewport: Viewport, fill = 0.82): Camera {
  const insets = viewport.insets ?? { top: 0, bottom: 0, minX: 0, maxX: 0 }
  const usableW = Math.max(1, viewport.width - insets.minX - insets.maxX)
  const usableH = Math.max(1, viewport.height - insets.top - insets.bottom)
  const radius = Math.min(80, Math.max(MIN_FRAME_RADIUS, frame.radius)) * RAD
  const f = 1 / Math.tan(FOV_Y / 2)
  const aspect = viewport.width / viewport.height
  const tanX = aspect / f
  const tanY = 1 / f
  const sx = (usableW / viewport.width) * fill
  const sy = (usableH / viewport.height) * fill
  const fit = (scale: number, tanHalf: number) => Math.cos(radius) + Math.sin(radius) / (scale * tanHalf)
  const distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, fit(sx, tanX), fit(sy, tanY)))
  // Offset the look-at point so the frame centres in the uncovered rectangle: the screen
  // offset of the gap's centre, turned back into an angle at this distance.
  const offsetY = (insets.bottom - insets.top) / 2 / viewport.height
  const offsetX = (insets.maxX - insets.minX) / 2 / viewport.width
  const degPerNdc = ((distance - 1) * tanY * 2) / RAD
  const lat = clampLat(frame.lat - offsetY * degPerNdc, MAX_CAMERA_LAT)
  const lon = normalizeLon(frame.lon + offsetX * degPerNdc * aspect)
  return { lat, lon, distance }
}

/** How many degrees of rotation one layout point of drag is worth, near the centre. */
export function degreesPerPoint(camera: Camera, viewport: Viewport): number {
  const tanY = Math.tan(FOV_Y / 2)
  return (((camera.distance - 1) * tanY * 2) / viewport.height) / RAD
}

/** Drag the globe under the finger. North stays up; latitude is clamped. */
export function panCamera(camera: Camera, dx: number, dy: number, viewport: Viewport): Camera {
  const k = degreesPerPoint(camera, viewport)
  const cosLat = Math.max(0.2, Math.cos(camera.lat * RAD))
  return {
    lat: clampLat(camera.lat + dy * k, MAX_CAMERA_LAT),
    lon: normalizeLon(camera.lon - (dx * k) / cosLat),
    distance: camera.distance,
  }
}

/** Pinch: `scale` > 1 zooms in. Altitude above the surface scales, so it never crosses it. */
export function zoomCamera(camera: Camera, scale: number): Camera {
  const altitude = (camera.distance - 1) / Math.max(0.05, scale)
  return { ...camera, distance: Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, 1 + altitude)) }
}

/** Ease between two cameras along the short way round in longitude. */
export function interpolateCamera(from: Camera, to: Camera, t: number): Camera {
  const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
  return {
    lat: from.lat + (to.lat - from.lat) * e,
    lon: normalizeLon(from.lon + lonDelta(from.lon, to.lon) * e),
    distance: from.distance + (to.distance - from.distance) * e,
  }
}

/** Degrees of arc between two cameras' targets — used to keep moves short. */
export function cameraTravel(from: Camera, to: Camera): number {
  const a = toVec3(from)
  const b = toVec3(to)
  return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) / RAD
}
