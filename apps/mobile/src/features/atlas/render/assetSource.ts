/**
 * Native asset loading. Web is `assetSource.web.ts`.
 *
 * expo-asset resolves a bundled file to a local copy, expo-file-system reads its bytes
 * (`fetch` on a local URI is not dependable on Android), and expo-gl uploads an image
 * from `{ localUri }` — decoding it with stb_image, and ONLY from a `file://` path. Any
 * other scheme gives an empty texture and no GL error, which is how the first Android
 * run drew a black globe with perfectly placed outlines. That is why the atlas's images
 * ship as `.bin` (packed raw, so they get a real file) and why a non-file URI is an error
 * here rather than a black globe later.
 */

import { Asset } from 'expo-asset'
import { EncodingType, readAsStringAsync } from '../../../lib/nativeFileSystem.js'
import { toByteArray } from 'base64-js'

export async function loadBinaryAsset(module: number | string): Promise<ArrayBuffer> {
  const asset = await Asset.fromModule(module).downloadAsync()
  if (!asset.localUri?.startsWith('file://')) throw new Error('atlas: asset has no local file')
  // File.bytes() in SDK 54 requests write permission; bundled iOS files are read-only.
  // Base64 preserves every geometry byte without relying on a native atob global.
  const encoded = await readAsStringAsync(asset.localUri, { encoding: EncodingType.Base64 })
  return Uint8Array.from(toByteArray(encoded.replace(/\s/g, ''))).buffer
}

/** `mime` is for the web loader; stb_image decodes by content. */
export async function loadTextureAsset(module: number | string, _mime: string): Promise<unknown> {
  const asset = await Asset.fromModule(module).downloadAsync()
  if (asset.localUri === null || !asset.localUri.startsWith('file://')) {
    throw new Error(`atlas: texture is not a local file (${asset.localUri ?? 'none'})`)
  }
  return { localUri: asset.localUri }
}
