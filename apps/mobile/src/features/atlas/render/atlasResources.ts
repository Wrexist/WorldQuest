/**
 * The atlas's immutable data, loaded once per app run and shared by every mounted view.
 *
 * Shared because it is plain data: the parsed rings and the decoded image sources are
 * not tied to a GL context, so a lesson that mounts a globe per question, or Explore and
 * a lesson in the same session, decode them once. GL textures made FROM them belong to
 * each view's renderer and die with it.
 *
 * A failed load clears its cache entry, so the next mount retries instead of inheriting
 * a rejection forever — "offline at launch" must not mean "no globe until restart".
 */

import { parseAtlasGeometry, type AtlasGeometry } from '../geo/geometry.js'
import { loadBinaryAsset, loadTextureAsset } from './assetSource.js'
import countriesBin from '../../../../assets/atlas/countries.bin'
// Images shipped as .bin so Android packs them as raw files expo-gl can read; see
// scripts/build-atlas.cjs. The bytes are a JPEG and a PNG.
import countryIds from '../../../../assets/atlas/country-ids.bin'
import surfaceBin from '../../../../assets/atlas/surface.bin'

let geometry: Promise<AtlasGeometry> | null = null
let surface: Promise<unknown> | null = null
let ids: Promise<unknown> | null = null

function cached<T>(get: () => Promise<T> | null, set: (p: Promise<T> | null) => void, load: () => Promise<T>): Promise<T> {
  const existing = get()
  if (existing !== null) return existing
  const promise = load().catch((error: unknown) => {
    set(null)
    throw error
  })
  set(promise)
  return promise
}

export function loadAtlasGeometry(): Promise<AtlasGeometry> {
  return cached(
    () => geometry,
    (p) => (geometry = p),
    async () => parseAtlasGeometry(await loadBinaryAsset(countriesBin)),
  )
}

export function loadSurfaceTexture(): Promise<unknown> {
  return cached(
    () => surface,
    (p) => (surface = p),
    () => loadTextureAsset(surfaceBin, 'image/jpeg'),
  )
}

export function loadCountryIdTexture(): Promise<unknown> {
  return cached(
    () => ids,
    (p) => (ids = p),
    () => loadTextureAsset(countryIds, 'image/png'),
  )
}

/** Tests only: forget everything so each case loads from scratch. */
export function __resetAtlasResources(): void {
  geometry = null
  surface = null
  ids = null
}
