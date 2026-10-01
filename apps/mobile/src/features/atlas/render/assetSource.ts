/**
 * Native asset loading: expo-asset resolves the bundled file to a local URI, expo-gl
 * uploads an `Asset` straight to a texture, and expo-file-system reads binary bytes
 * (`fetch` on a `file://` URI is not dependable on Android). Web is `assetSource.web.ts`.
 */

import { Asset } from 'expo-asset'
import { File } from 'expo-file-system'

export async function loadBinaryAsset(module: number | string): Promise<ArrayBuffer> {
  const asset = await Asset.fromModule(module).downloadAsync()
  if (asset.localUri === null) throw new Error('atlas: asset has no local file')
  const bytes = await new File(asset.localUri).bytes()
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

/** expo-gl's `texImage2D` accepts a downloaded `Asset` in place of pixels. */
export async function loadTextureAsset(module: number | string): Promise<unknown> {
  const asset = await Asset.fromModule(module).downloadAsync()
  if (asset.localUri === null) throw new Error('atlas: texture has no local file')
  return asset
}
