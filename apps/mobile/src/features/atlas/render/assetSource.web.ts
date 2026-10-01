/**
 * Web asset loading. expo-gl's web `texImage2D` wraps an `Asset` in an `Image` it never
 * waits for, so the first upload would be an empty texture; this decodes first.
 */

import { Asset } from 'expo-asset'

const uriOf = (module: number | string) => (typeof module === 'string' ? module : Asset.fromModule(module).uri)

export async function loadBinaryAsset(module: number | string): Promise<ArrayBuffer> {
  const response = await fetch(uriOf(module))
  if (!response.ok) throw new Error(`atlas: ${response.status} loading geometry`)
  return response.arrayBuffer()
}

export async function loadTextureAsset(module: number | string): Promise<unknown> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = uriOf(module)
  await image.decode()
  return image
}
