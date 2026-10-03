import { Asset } from 'expo-asset'
import { File } from 'expo-file-system'

/** Metro ships .bin as a raw local file on both iOS and Android. */
export async function bundledText(module: number | string): Promise<string> {
  const asset = await Asset.fromModule(module).downloadAsync()
  if (!asset.localUri?.startsWith('file://')) throw new Error('Reference asset has no local file')
  return new File(asset.localUri).text()
}
