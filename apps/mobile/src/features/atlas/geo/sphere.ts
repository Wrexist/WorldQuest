/**
 * Geographic ↔ world conversions and distances. Pure; see `types.ts` for the convention.
 */

import type { LatLon, Vec3 } from './types.js'

const RAD = Math.PI / 180
const DEG = 180 / Math.PI

/** Mean Earth radius (IUGG), for turning angles into kilometres. */
export const EARTH_RADIUS_KM = 6371.0088

/** Into (−180, 180]. 180 stays 180 and −180 becomes 180, so the seam has one name. */
export function normalizeLon(lon: number): number {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180
  return wrapped === -180 ? 180 : wrapped
}

export function clampLat(lat: number, limit = 90): number {
  return Math.max(-limit, Math.min(limit, lat))
}

export function toVec3({ lat, lon }: LatLon): Vec3 {
  const phi = lat * RAD
  const lambda = lon * RAD
  return [Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda)]
}

export function toLatLon([x, y, z]: Vec3): LatLon {
  const length = Math.hypot(x, y, z) || 1
  const lat = Math.asin(Math.max(-1, Math.min(1, y / length))) * DEG
  // At a pole longitude is undefined; 0 is the conventional answer and round-trips.
  const lon = Math.abs(x) < 1e-12 && Math.abs(z) < 1e-12 ? 0 : normalizeLon(Math.atan2(x, z) * DEG)
  return { lat, lon }
}

/** Central angle between two points, degrees. Haversine: stable for small distances. */
export function angularDistance(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RAD
  const dLon = (b.lon - a.lon) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * Math.asin(Math.min(1, Math.sqrt(h))) * DEG
}

export function distanceKm(a: LatLon, b: LatLon): number {
  return angularDistance(a, b) * RAD * EARTH_RADIUS_KM
}

/** Equirectangular texture coordinate of a point. Row 0 is north; no flip. */
export function toTextureUv({ lat, lon }: LatLon): readonly [number, number] {
  return [(normalizeLon(lon) + 180) / 360, (90 - lat) / 180]
}

/**
 * The shortest way round from one longitude to another, signed, in (−180, 180].
 * Camera moves use it so Fiji → Samoa crosses the antimeridian rather than the planet.
 */
export function lonDelta(from: number, to: number): number {
  return normalizeLon(to - from)
}
