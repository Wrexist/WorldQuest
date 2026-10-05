/**
 * The view's contract with the GPU and with whoever mounts it — through a fake context
 * (src/test/fakeGl.ts) that records calls. Whether the pixels are right is the browser
 * evidence's job (scripts/atlas-evidence.cjs); whether the view asks for the right
 * things, reuses them and cleans them up is this file's.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { useReducedMotion } from '@worldquest/design'
import { AccessibilityInfo } from 'react-native'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fakeGl, type FakeGl } from '../../test/fakeGl.js'
import { WorldAtlasView } from './WorldAtlasView.js'
import { buildLessonScene } from './scene/lessonScene.js'
import { parseAtlasGeometry } from './geo/geometry.js'
import { withFullMotion } from '../../test/setup.js'

// jsdom has no layout engine. Supply a real-size layout event while keeping the real
// View and Pressable behavior; readiness must now wait for an actual draw submission.
vi.mock('react-native', async importOriginal => {
  const native = await importOriginal<typeof import('react-native')>()
  const React = await import('react')
  return { ...native, View: ({ onLayout, ...props }: import('react-native').ViewProps) => {
    React.useEffect(() => {
      onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 700, height: 440 } } } as import('react-native').LayoutChangeEvent)
    }, [])
    return React.createElement(native.View, props)
  } }
})

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
  vi.restoreAllMocks()
  delete (globalThis as { __wqFakeGl?: unknown }).__wqFakeGl
})

describe('WorldAtlasView', () => {
  it('becomes ready after the first complete frame, retaining a safe preview underneath', async () => {
    const onStatusChange = vi.fn()
    let firstFrameHighlighted: boolean | undefined
    const originalDraw = gl.drawElements as (...args: unknown[]) => unknown
    gl.drawElements = (...args: unknown[]) => {
      if (firstFrameHighlighted === undefined) {
        const uploads = gl.texImage2D as ReturnType<typeof vi.fn>
        const state = uploads.mock.calls.filter(call => call.length === 9).at(-1)![8] as Uint8Array
        firstFrameHighlighted = state.some(value => value !== 0)
      }
      return originalDraw(...args)
    }
    render(<WorldAtlasView spec={scene('ES')} onStatusChange={onStatusChange} testID="atlas" />)
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('ready', undefined))
    // Surface, ID raster and the highlight table — one upload each at least.
    expect(gl.calls['texImage2D']).toBeGreaterThanOrEqual(3)
    expect(gl.calls['createProgram']).toBe(3)
    expect(gl.calls['drawElements']).toBeGreaterThan(0)
    expect(gl.calls['endFrameEXP']).toBeGreaterThan(0)
    expect(firstFrameHighlighted).toBe(true)
    const preview = screen.getByTestId('atlas-preview')
    expect(preview.querySelector('img')?.getAttribute('src')).toContain('/geo/clay/ES.webp')
    expect(preview.textContent).toBe('')
    expect(screen.queryByText('Madrid')).toBeNull()
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

  it('ignores a loading deadline already queued when the first frame becomes ready', async () => {
    const timers = vi.spyOn(globalThis, 'setTimeout')
    let deadlineDelivered = false
    const onStatusChange = vi.fn((status: string) => {
      if (status !== 'ready') return
      const deadline = timers.mock.calls.find(call => call[1] === 12000)?.[0]
      expect(typeof deadline).toBe('function')
      // Deliver before the ready render/effect cleanup, like a native shader draw
      // which blocked JS past the deadline but completed successfully.
      if (typeof deadline === 'function') { deadlineDelivered = true; deadline() }
    })
    render(<WorldAtlasView spec={scene('ES')} onStatusChange={onStatusChange} />)
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('ready', undefined))
    expect(deadlineDelivered).toBe(true)
    expect(onStatusChange.mock.calls.at(-1)?.[0]).toBe('ready')
    expect(onStatusChange.mock.calls.some(call => call[0] === 'error')).toBe(false)
  })

  it('schedules camera frames after a completed first draw when zoom is pressed with full motion', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    await withFullMotion(async () => {
      const preference = renderHook(useReducedMotion)
      await waitFor(() => expect(preference.result.current).toBe(false))
      const onStatusChange = vi.fn()
      render(<WorldAtlasView spec={scene('ES')} controls onStatusChange={onStatusChange} />)
      await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('ready', undefined))
      const matrices = gl.uniformMatrix4fv as ReturnType<typeof vi.fn>
      const distance = () => (matrices.mock.calls.at(-1)![2] as Float32Array)[15]!
      const initial = distance()
      fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
      await waitFor(() => expect(distance()).toBeLessThan(initial - 0.1))
      const zoomed = distance()
      fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
      await waitFor(() => expect(distance()).toBeGreaterThan(zoomed + 0.1))
    })
  })
})
