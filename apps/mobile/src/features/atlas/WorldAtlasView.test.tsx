/**
 * The view's contract with the GPU and with whoever mounts it — through a fake context
 * (src/test/fakeGl.ts) that records calls. Whether the pixels are right is the browser
 * evidence's job (scripts/atlas-evidence.cjs); whether the view asks for the right
 * things, reuses them and cleans them up is this file's.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fakeGl, type FakeGl } from '../../test/fakeGl.js'
import { WorldAtlasView } from './WorldAtlasView.js'
import { buildLessonScene } from './scene/lessonScene.js'
import { parseAtlasGeometry } from './geo/geometry.js'

vi.mock('./render/atlasResources.js', () => ({
  loadSurfaceTexture: async () => ({ surface: true }),
  loadCountryIdTexture: async () => ({ ids: true }),
  loadAtlasGeometry: async () => {
    const bin = readFileSync(join(__dirname, '..', '..', '..', 'assets', 'atlas', 'countries.bin'))
    return parseAtlasGeometry(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength))
  },
}))

const t = (key: string, params?: Record<string, string | number>) => `${key} ${JSON.stringify(params ?? {})}`
const scene = (entityId: string, phase: 'question' | 'revealed' = 'question') =>
  buildLessonScene({
    sceneKey: `l:${entityId}`,
    policy: { mode: 'capital-name', beforeAnswer: true },
    entityId,
    factId: `geo.${entityId}.capital`,
    phase,
    chosenOptionId: null,
    countryName: (id) => ({ ES: 'Spain', JP: 'Japan' })[id],
    factValueName: (id) => ({ 'geo.ES.capital': 'Madrid', 'geo.JP.capital': 'Tokyo' })[id],
    t,
  })!

let gl: FakeGl
beforeEach(() => {
  gl = fakeGl()
  ;(globalThis as { __wqFakeGl?: unknown }).__wqFakeGl = gl
})
afterEach(() => {
  cleanup()
  delete (globalThis as { __wqFakeGl?: unknown }).__wqFakeGl
})

describe('WorldAtlasView', () => {
  it('becomes ready once both textures and the rings have loaded', async () => {
    const onStatusChange = vi.fn()
    render(<WorldAtlasView spec={scene('ES')} onStatusChange={onStatusChange} testID="atlas" />)
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('ready', undefined))
    // Surface, ID raster and the highlight table — one upload each at least.
    expect(gl.calls['texImage2D']).toBeGreaterThanOrEqual(3)
    expect(gl.calls['createProgram']).toBe(3)
  })

  it('reports a renderer it cannot build as an error, for the parent to fall back on', async () => {
    ;(globalThis as { __wqFakeGl?: unknown }).__wqFakeGl = fakeGl({ failCompile: true })
    const onStatusChange = vi.fn()
    render(<WorldAtlasView spec={scene('ES')} onStatusChange={onStatusChange} />)
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('error', expect.any(Error)))
    expect(onStatusChange.mock.calls.at(-1)![1].message).toMatch(/shader compile failed/)
  })

  it('moves to the next question by uploading highlights, not by rebuilding the Earth', async () => {
    const onStatusChange = vi.fn()
    const view = render(<WorldAtlasView spec={scene('ES')} onStatusChange={onStatusChange} />)
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('ready', undefined))
    const programs = gl.calls['createProgram']
    const textures = gl.calls['createTexture']
    const mipmaps = gl.calls['generateMipmap']
    for (const id of ['JP', 'ES', 'JP', 'ES']) {
      await act(async () => {
        view.rerender(<WorldAtlasView spec={scene(id)} onStatusChange={onStatusChange} />)
      })
    }
    expect(gl.calls['createProgram']).toBe(programs)
    expect(gl.calls['createTexture']).toBe(textures)
    expect(gl.calls['generateMipmap']).toBe(mipmaps)
  })

  it('deletes every GL object it made when it unmounts', async () => {
    const onStatusChange = vi.fn()
    const view = render(<WorldAtlasView spec={scene('ES')} onStatusChange={onStatusChange} />)
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('ready', undefined))
    view.unmount()
    expect(gl.calls['deleteProgram']).toBe(gl.calls['createProgram'])
    expect(gl.calls['deleteTexture']).toBe(gl.calls['createTexture'])
    expect(gl.calls['deleteBuffer']).toBeGreaterThanOrEqual(4)
  })

  it('is one accessible image whose label follows the disclosure policy', async () => {
    const onStatusChange = vi.fn()
    const view = render(<WorldAtlasView spec={scene('ES')} onStatusChange={onStatusChange} testID="atlas" />)
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('ready', undefined))
    expect(screen.getByTestId('atlas').getAttribute('aria-label')).toContain('capitalHidden')
    expect(screen.getByTestId('atlas').getAttribute('aria-label')).not.toContain('Madrid')
    view.rerender(<WorldAtlasView spec={scene('ES', 'revealed')} onStatusChange={onStatusChange} testID="atlas" />)
    expect(screen.getByTestId('atlas').getAttribute('aria-label')).toContain('Madrid')
  })

  it('offers recentre and zoom as buttons, so no gesture is required', async () => {
    const onStatusChange = vi.fn()
    render(<WorldAtlasView spec={scene('ES')} controls onStatusChange={onStatusChange} />)
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('ready', undefined))
    for (const name of ['Zoom in', 'Zoom out', 'Recentre map']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
  })
})
