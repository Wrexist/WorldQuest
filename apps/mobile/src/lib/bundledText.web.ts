import { Asset } from 'expo-asset'

export async function bundledText(module: number | string): Promise<string> {
  const uri = typeof module === 'string' ? module : Asset.fromModule(module).uri
  const response = await fetch(uri)
  if (!response.ok) throw new Error('Reference asset could not be loaded')
  return response.text()
}
