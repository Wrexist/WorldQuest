/**
 * Web asset loading. The atlas's images ship as `.bin` (see assetSource.ts), so they are
 * fetched as bytes and decoded here — with colour-space conversion off, because the
 * country-ID raster is data: a browser colour-managing ID 57 into 58 is a wrong country.
 */

import { Asset } from 'expo-asset'

const uriOf = (module: number | string) => (typeof module === 'string' ? module : Asset.fromModule(module).uri)

export async function loadBinaryAsset(module: number | string): Promise<ArrayBuffer> {
  const response = await fetch(uriOf(module))
  if (!response.ok) throw new Error(`atlas: ${response.status} loading geometry`)
  return response.arrayBuffer()
}

export async function loadTextureAsset(module: number | string, mime: string): Promise<unknown> {
  const bytes = await loadBinaryAsset(module)
  return createImageBitmap(new Blob([bytes], { type: mime }), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  })
}
