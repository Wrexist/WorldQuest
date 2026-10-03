import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AccessibilityInfo, AppState, PanResponder, type AppStateStatus, type GestureResponderEvent, type PanResponderGestureState } from 'react-native'
import { GLView } from 'expo-gl'
import { motion } from '@worldquest/design'
import { fakeGl, type FakeGl } from '../../test/fakeGl.js'
import { withFullMotion } from '../../test/setup.js'
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

/** Advance JS camera frames separately from the native GPU's acknowledgement. */
async function animatedAtlas() {
  let now = 0
  let nextFrame = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    callbacks.set(++nextFrame, callback)
    return nextFrame
  })
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id) })
  const clock = {
    elapse(ms: number) { now += ms },
    async frame(ms = 16) {
      now += ms
      await act(async () => {
        const ready = [...callbacks.values()]
        callbacks.clear()
        ready.forEach(callback => callback(now))
      })
    },
    async complete(index: number, ms: number) {
      now += ms
      await act(async () => { pending[index]!.resolve() })
    },
  }
  await act(async () => { render(<WorldAtlasView spec={spec} controls />) })
  await clock.frame()
  expect(pending).toHaveLength(1)
  return clock
}

describe('native GPU frame completion', () => {
  it('owns pans from touch-down and preserves zoom when a pinch returns to one finger', async () => {
    const create = vi.spyOn(PanResponder, 'create')
    const onGestureActiveChange = vi.fn()
    const onEvent = vi.fn()
    const view = render(<WorldAtlasView spec={spec} onGestureActiveChange={onGestureActiveChange} onEvent={onEvent} />)
    await waitFor(() => expect(pending).toHaveLength(1))
    await act(async () => { pending[0]!.resolve() })
    const handlers = create.mock.calls.at(-1)![0]
    const touch = (separation: number, count: number) => ({ nativeEvent: { locationX: 250, locationY: 200,
      touches: Array.from({ length: count }, (_, index) => ({ pageX: 250 + index * separation, pageY: 200 })),
    } }) as GestureResponderEvent
    const state = { dx: 0, dy: 0, numberActiveTouches: 1 } as PanResponderGestureState
    expect(handlers.onStartShouldSetPanResponder?.(touch(0, 1), state)).toBe(true)
    act(() => { handlers.onPanResponderGrant?.(touch(0, 1), state) })
    expect(onGestureActiveChange).toHaveBeenLastCalledWith(true)
    expect(handlers.onPanResponderTerminationRequest?.(touch(0, 1), state)).toBe(false)
    act(() => {
      handlers.onPanResponderMove?.(touch(100, 2), { ...state, numberActiveTouches: 2 })
      handlers.onPanResponderMove?.(touch(200, 2), { ...state, numberActiveTouches: 2 })
      handlers.onPanResponderMove?.(touch(0, 1), { ...state, dx: 80, dy: 40 })
      handlers.onPanResponderRelease?.(touch(0, 0), state)
    })
    expect(onGestureActiveChange).toHaveBeenLastCalledWith(false)
    expect(onEvent).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'viewChanged', distance: zoomCamera({ lat: 20, lon: 10, distance: 4.6 * .86 }, 2).distance }))
    act(() => { handlers.onPanResponderGrant?.(touch(0, 1), state); handlers.onPanResponderTerminate?.(touch(0, 0), state) })
    expect(onGestureActiveChange).toHaveBeenLastCalledWith(false)
    act(() => { handlers.onPanResponderGrant?.(touch(0, 1), state) })
    view.unmount()
    expect(onGestureActiveChange).toHaveBeenLastCalledWith(false)
  })
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

  it('submits the final camera immediately when one native frame costs the whole animation', async () => {
    await withFullMotion(async () => {
      const clock = await animatedAtlas()
      const initial = renderedDistance()
      await clock.complete(0, motion.expressive.duration)
      fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
      await clock.frame()
      expect(pending).toHaveLength(2)
      expect(renderedDistance()).toBeCloseTo(zoomCamera({ lat: 0, lon: 0, distance: initial }, 1.6).distance, 5)
      const draws = gl.calls['drawElements']
      await clock.frame(motion.expressive.duration)
      expect(gl.calls['drawElements']).toBe(draws)
    })
  })

  it('restores intermediate camera frames after a later native frame completes quickly', async () => {
    await withFullMotion(async () => {
      const clock = await animatedAtlas()
      const initial = renderedDistance()
      await clock.complete(0, motion.expressive.duration)
      fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
      await clock.frame()
      const zoomed = renderedDistance()
      await clock.complete(1, 16)
      fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
      await clock.frame()
      await clock.frame()
      expect(pending).toHaveLength(3)
      expect(renderedDistance()).toBeGreaterThan(zoomed)
      expect(renderedDistance()).toBeLessThan(initial)
    })
  })

  it('ignores time spent in the background when deciding whether to animate', async () => {
    let change: (state: AppStateStatus) => void = () => {}
    vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      change = listener
      return { remove: vi.fn() }
    })
    await withFullMotion(async () => {
      const clock = await animatedAtlas()
      await clock.complete(0, 16)
      fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
      await clock.frame()
      await clock.frame()
      expect(pending).toHaveLength(2)
      const beforeBackground = renderedDistance()
      await act(async () => { change('background') })
      clock.elapse(motion.expressive.duration * 10)
      await act(async () => { change('active') })
      await clock.complete(1, 16)
      fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
      await clock.frame()
      expect(pending).toHaveLength(3)
      // The return redraw still has the pre-background camera; zoom-out is animating.
      // Counting background time would incorrectly cut straight to its farther target.
      expect(renderedDistance()).toBeLessThanOrEqual(beforeBackground)
    })
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
