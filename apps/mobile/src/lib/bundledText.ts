import { Asset } from 'expo-asset'
import { EncodingType, readAsStringAsync } from './nativeFileSystem.js'

/** Metro ships .bin as a raw local file on both iOS and Android. */
export async function bundledText(module: number | string): Promise<string> {
  const asset = await Asset.fromModule(module).downloadAsync()
  if (!asset.localUri?.startsWith('file://')) throw new Error('Reference asset has no local file')
  // SDK 54's File.text() requests write permission on iOS. Metro assets live in the
  // read-only app bundle, so use the API that only requires read permission.
  return readAsStringAsync(asset.localUri, { encoding: EncodingType.UTF8 })
}
