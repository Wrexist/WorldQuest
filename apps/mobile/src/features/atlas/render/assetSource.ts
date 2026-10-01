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
import { File } from 'expo-file-system'

export async function loadBinaryAsset(module: number | string): Promise<ArrayBuffer> {
  const asset = await Asset.fromModule(module).downloadAsync()
  if (asset.localUri === null) throw new Error('atlas: asset has no local file')
  const bytes = await new File(asset.localUri).bytes()
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

/** `mime` is for the web loader; stb_image decodes by content. */
export async function loadTextureAsset(module: number | string, _mime: string): Promise<unknown> {
  const asset = await Asset.fromModule(module).downloadAsync()
  if (asset.localUri === null || !asset.localUri.startsWith('file://')) {
    throw new Error(`atlas: texture is not a local file (${asset.localUri ?? 'none'})`)
  }
  return { localUri: asset.localUri }
}
