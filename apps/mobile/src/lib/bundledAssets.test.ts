import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ download: vi.fn(), read: vi.fn() }))
vi.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: native.download }) } }))
vi.mock('expo-file-system/legacy', () => ({
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  readAsStringAsync: native.read,
}))
// These methods require write permission in the installed SDK 54 iOS implementation.
// A read-only app bundle must never reach them. Real permissions still need iOS proof.
vi.mock('expo-file-system', () => ({
  File: class {
    text() { throw new Error('read-only app bundle: write permission denied') }
    bytes() { throw new Error('read-only app bundle: write permission denied') }
  },
}))

import { bundledText } from './bundledText.js'
import { loadBinaryAsset, loadTextureAsset } from '../features/atlas/render/assetSource.js'
import { parseAtlasGeometry } from '../features/atlas/geo/geometry.js'

const bundleUri = 'file:///private/WorldQuest.app/assets/bundled.bin'

beforeEach(() => {
  vi.clearAllMocks()
  native.download.mockResolvedValue({ uri: 'https://asset.invalid/original.bin', localUri: bundleUri })
})

it('reads the resolved read-only catalogue as UTF-8, preserving Swedish text', async () => {
  const text = '{"sv":"Öar, sjöar och världens länder"}'
  native.read.mockResolvedValue(text)
  expect(await bundledText(71)).toBe(text)
  expect(native.read).toHaveBeenCalledExactlyOnceWith(bundleUri, { encoding: 'utf8' })
})

it('reads actual packaged map geometry without write permission or global atob', async () => {
  const original = readFileSync(join(import.meta.dirname, '../../assets/atlas/countries.bin'))
  native.read.mockResolvedValue(original.toString('base64'))
  vi.stubGlobal('atob', undefined)
  try {
    const buffer = await loadBinaryAsset(72)
    expect(Buffer.from(buffer).equals(original)).toBe(true)
    expect(parseAtlasGeometry(buffer).countries.has('SE')).toBe(true)
    expect(native.read).toHaveBeenCalledExactlyOnceWith(bundleUri, { encoding: 'base64' })
  } finally {
    vi.unstubAllGlobals()
  }
})

it.each([[], [0], [0, 255], [0, 127, 255], [255, 128, 0, 1]].map(values => [values]))(
  'preserves the exact binary length and padding for %j', async values => {
    native.read.mockResolvedValue(`${Buffer.from(values).toString('base64')}\r\n`)
    const buffer = await loadBinaryAsset(72)
    expect([...new Uint8Array(buffer)]).toEqual(values)
    expect(buffer.byteLength).toBe(values.length)
  },
)

it.each([null, undefined, 'https://asset.invalid/not-downloaded.bin'])(
  'rejects a non-local asset before file access: %s', async localUri => {
    native.download.mockResolvedValue({ localUri })
    await expect(bundledText(71)).rejects.toThrow('no local file')
    await expect(loadBinaryAsset(72)).rejects.toThrow('no local file')
    expect(native.read).not.toHaveBeenCalled()
  },
)

it('retains the native texture URI without reading or copying image bytes', async () => {
  expect(await loadTextureAsset(73, 'image/png')).toEqual({ localUri: bundleUri })
  expect(native.read).not.toHaveBeenCalled()
})
