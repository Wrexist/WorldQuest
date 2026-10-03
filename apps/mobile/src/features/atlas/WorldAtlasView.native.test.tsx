import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AppState, type AppStateStatus } from 'react-native'
import { GLView } from 'expo-gl'
import { fakeGl, type FakeGl } from '../../test/fakeGl.js'
import { WorldAtlasView } from './WorldAtlasView.js'
import { buildExploreScene } from './scene/exploreScene.js'
import { zoomCamera } from './geo/camera.js'

vi.mock('react-native', async importOriginal => {
  const native = await importOriginal<typeof import('react-native')>()
  const React = await import('react')
  return { ...native, Platform: { ...native.Platform, OS: 'ios' }, View: ({ onLayout, ...props }: import('react-native').ViewProps) => {
    React.useEffect(() => {
      onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 700, height: 440 } } } as import('react-native').LayoutChangeEvent)
    }, [])
    return React.createElement(native.View, props)
  } }
})

vi.mock('./render/atlasResources.js', () => ({
  loadSurfaceTexture: async () => ({ surface: true }),
  loadCountryIdTexture: async () => ({ ids: true }),
  loadAtlasGeometry: async () => ({ countries: new Map() }),
}))

let gl: FakeGl
let pending: { resolve: () => void; reject: (error: Error) => void }[]
beforeEach(() => {
  gl = fakeGl()
  pending = []
  ;(globalThis as { __wqFakeGl?: unknown }).__wqFakeGl = gl
  GLView.waitForFrameAsync = vi.fn(() => new Promise<void>((resolve, reject) => pending.push({ resolve, reject })))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete (globalThis as { __wqFakeGl?: unknown }).__wqFakeGl
})

const spec = buildExploreScene({ selected: null, region: null, matches: [], countryName: id => id, factValueName: () => undefined, t: key => key })

function renderedDistance() {
  const matrices = gl.uniformMatrix4fv as ReturnType<typeof vi.fn>
  return (matrices.mock.calls.at(-1)![2] as Float32Array)[15]!
}

describe('native GPU frame completion', () => {
  it('keeps controls loading until the GPU completes the first frame', async () => {
    const onStatusChange = vi.fn()
    render(<WorldAtlasView spec={spec} controls onStatusChange={onStatusChange} />)
    await waitFor(() => expect(pending).toHaveLength(1))
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull()
    expect(onStatusChange).not.toHaveBeenCalledWith('ready', undefined)
    await act(async () => { pending[0]!.resolve() })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy())
    expect(onStatusChange).toHaveBeenCalledWith('ready', undefined)
  })

  it('coalesces repeated zoom requests into the latest camera while one frame is in flight', async () => {
    render(<WorldAtlasView spec={spec} controls />)
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => { pending[0]!.resolve() })
    // Leave a real zoom's GPU completion pending, then request three newer views.
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    await waitFor(() => expect(pending).toHaveLength(2))
    const initial = renderedDistance()
    const draws = gl.calls['drawElements']!
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)) })
    expect(gl.calls['drawElements']).toBe(draws)
    expect(pending).toHaveLength(2)
    await act(async () => { pending[1]!.resolve() })
    await waitFor(() => expect(pending).toHaveLength(3))
    expect(gl.calls['drawElements']).toBe(draws + 1)
    expect(renderedDistance()).toBeCloseTo(zoomCamera({ lat: 0, lon: 0, distance: initial }, 1.6 ** 3).distance, 5)
  })

  it('reports GPU failure and ignores a completion after unmount', async () => {
    const onStatusChange = vi.fn()
    const view = render(<WorldAtlasView spec={spec} onStatusChange={onStatusChange} />)
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => { pending[0]!.reject(new Error('GPU context lost')) })
    expect(onStatusChange).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'GPU context lost' }))
    view.unmount()
    onStatusChange.mockClear()
    const second = render(<WorldAtlasView spec={spec} onStatusChange={onStatusChange} />)
    await waitFor(() => expect(pending).toHaveLength(2))
    second.unmount()
    await act(async () => { pending[1]!.resolve() })
    expect(onStatusChange).not.toHaveBeenCalled()
  })

  it('pauses frame deadlines in the background and draws again on return', async () => {
    let change: (state: AppStateStatus) => void = () => {}
    vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      change = listener
      return { remove: vi.fn() }
    })
    const onStatusChange = vi.fn()
    render(<WorldAtlasView spec={spec} onStatusChange={onStatusChange} />)
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => { change('background'); pending[0]!.reject(Object.assign(new Error('background'), { code: 'E_GL_BACKGROUND' })) })
    expect(onStatusChange).not.toHaveBeenCalledWith('error', expect.anything())
    expect(pending).toHaveLength(1)
    await act(async () => { change('active') })
    await waitFor(() => expect(pending).toHaveLength(2))
    await act(async () => { pending[1]!.resolve() })
    expect(onStatusChange).toHaveBeenCalledWith('ready', undefined)
  })

  it('ignores a queued loading deadline immediately after backgrounding, before effect cleanup', async () => {
    const timers = vi.spyOn(globalThis, 'setTimeout')
    let change: (state: AppStateStatus) => void = () => {}
    vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      change = listener
      return { remove: vi.fn() }
    })
    const onStatusChange = vi.fn()
    render(<WorldAtlasView spec={spec} onStatusChange={onStatusChange} />)
    await waitFor(() => expect(pending).toHaveLength(1))
    const loadingDeadline = timers.mock.calls.find(call => call[1] === 12000)![0]
    expect(typeof loadingDeadline).toBe('function')
    await act(async () => {
      change('background')
      // A timeout already queued can run before React cleans up the loading effect.
      if (typeof loadingDeadline === 'function') loadingDeadline()
      pending[0]!.resolve()
    })
    expect(onStatusChange).not.toHaveBeenCalledWith('error', expect.anything())
    expect(onStatusChange).not.toHaveBeenCalledWith('ready', undefined)
    await act(async () => { change('active') })
    await waitFor(() => expect(pending).toHaveLength(2))
    await act(async () => { pending[1]!.resolve() })
    expect(onStatusChange).toHaveBeenCalledWith('ready', undefined)
  })

  it('falls back after a stalled completion and ignores its later stale frame', async () => {
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const onStatusChange = vi.fn()
    render(<WorldAtlasView spec={spec} onStatusChange={onStatusChange} />)
    await waitFor(() => expect(pending).toHaveLength(1))
    const deadline = timers.mock.calls.filter(call => call[1] === 12000).at(-1)![0]
    await act(async () => { if (typeof deadline === 'function') deadline() })
    expect(onStatusChange).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'atlas: frame timed out' }))
    await act(async () => { pending[0]!.resolve() })
    expect(onStatusChange).not.toHaveBeenCalledWith('ready', undefined)
  })
})
