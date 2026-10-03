import type { ContextType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook } from '@testing-library/react'
import { AccessibilityInfo, Animated, AppState, type AppStateStatus } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { motion, setAppReducedMotion, Skeleton, useCountUp, useDrift } from '@worldquest/design'
import { withFullMotion } from '../test/setup.js'
import { CloudBackdrop } from './CloudBackdrop.js'
import { FloatingProp, IslandStage, SceneryBanner } from './Scenery.js'

afterEach(() => { vi.useRealTimers(); setAppReducedMotion(false); vi.restoreAllMocks() })

function appLifecycle(initial: AppStateStatus = 'active') {
  let state = initial
  const listeners = new Set<(state: AppStateStatus) => void>()
  vi.spyOn(AppState, 'currentState', 'get').mockImplementation(() => state)
  vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    listeners.add(callback)
    return { remove: () => { listeners.delete(callback) } }
  })
  return {
    listeners,
    change: (next: AppStateStatus) => act(() => { state = next; listeners.forEach(callback => callback(next)) }),
  }
}

function loopWork() {
  const running = new Set<number>()
  const starts = vi.fn()
  let id = 0
  const timing = vi.spyOn(Animated, 'timing').mockImplementation(() => ({ start: vi.fn(), stop: vi.fn(), reset: vi.fn() }))
  vi.spyOn(Animated, 'loop').mockImplementation(() => {
    const key = id++
    return { start: () => { running.add(key); starts() }, stop: () => { running.delete(key) }, reset: vi.fn() }
  })
  return { running, starts, timing }
}

const resolvePreference = () => act(async () => { await Promise.resolve() })
const settleDelay = () => act(() => vi.advanceTimersByTime(motion.drift.duration))

describe('animation lifecycle work', () => {
  it('does not restart a pending drift in the background, and resumes exactly once', async () => {
    vi.useFakeTimers()
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const app = appLifecycle()
    const work = loopWork()
    await withFullMotion(async () => {
      const hook = renderHook(() => useDrift(.6))
      await resolvePreference()
      app.change('background')
      settleDelay()
      expect(work.running.size).toBe(0)
      app.change('active')
      settleDelay()
      expect(work.running.size).toBe(1)
      expect(work.starts).toHaveBeenCalledTimes(1)
      hook.unmount()
      settleDelay()
      expect(work.running.size).toBe(0)
      expect(app.listeners.size).toBe(0)
    })
  })

  it('does no drift work when first mounted in the background', async () => {
    vi.useFakeTimers()
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    appLifecycle('background')
    const work = loopWork()
    await withFullMotion(async () => {
      const hook = renderHook(() => useDrift())
      await resolvePreference()
      settleDelay()
      expect(work.starts).not.toHaveBeenCalled()
      hook.unmount()
    })
  })

  it('stops all three scenery loops on tab blur and restores only the focused scene', async () => {
    vi.useFakeTimers()
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const app = appLifecycle()
    const work = loopWork()
    let focused = true
    const listeners = new Map<string, Set<() => void>>()
    const navigation = {
      isFocused: () => focused,
      addListener: (event: string, callback: () => void) => {
        const callbacks = listeners.get(event) ?? new Set<() => void>()
        callbacks.add(callback); listeners.set(event, callbacks)
        return () => { callbacks.delete(callback) }
      },
    } as unknown as ContextType<typeof NavigationContext>
    const changeFocus = (value: boolean) => act(() => {
      focused = value
      listeners.get(value ? 'focus' : 'blur')?.forEach(callback => callback())
    })
    await withFullMotion(async () => {
      const view = render(<NavigationContext.Provider value={navigation}>
        <CloudBackdrop />
        <FloatingProp name="compass" size={72} phase={0} />
        <IslandStage size={120}><span>Guide</span></IslandStage>
      </NavigationContext.Provider>)
      await resolvePreference()
      settleDelay()
      expect(work.running.size).toBe(3)
      changeFocus(false)
      expect(work.running.size).toBe(0)
      app.change('background')
      app.change('active')
      settleDelay()
      expect(work.running.size).toBe(0)
      changeFocus(true)
      settleDelay()
      expect(work.running.size).toBe(3)
      view.unmount()
      settleDelay()
      expect(work.running.size).toBe(0)
      expect([...listeners.values()].every(callbacks => callbacks.size === 0)).toBe(true)
    })
  })

  it('does not animate a still cover banner or an unused outer island wrapper', async () => {
    vi.useFakeTimers()
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    appLifecycle()
    const work = loopWork()
    await withFullMotion(async () => {
      const view = render(<>
        <SceneryBanner name="europe" height={120} />
        <SceneryBanner name="discovery-island" height={120}><span>Guide</span></SceneryBanner>
      </>)
      await resolvePreference()
      settleDelay()
      expect(work.running.size).toBe(1)
      view.unmount()
    })
  })

  it('never starts a skeleton after its delayed OS preference resolves post-unmount', async () => {
    let resolve: (value: boolean) => void = () => {}
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => new Promise<boolean>(done => { resolve = done }))
    appLifecycle()
    const work = loopWork()
    const view = render(<Skeleton />)
    view.unmount()
    const before = work.starts.mock.calls.length
    await act(async () => { resolve(false); await Promise.resolve() })
    expect(work.running.size).toBe(0)
    expect(work.starts).toHaveBeenCalledTimes(before)
  })

  it('stops skeleton work for app motion preference and background without interaction handles', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const app = appLifecycle()
    const work = loopWork()
    await withFullMotion(async () => {
      const view = render(<Skeleton />)
      await resolvePreference()
      expect(work.running.size).toBe(1)
      expect(work.timing.mock.calls.every(([, config]) => config.isInteraction === false)).toBe(true)
      app.change('background')
      expect(work.running.size).toBe(0)
      app.change('active')
      expect(work.running.size).toBe(1)
      act(() => setAppReducedMotion(true))
      expect(work.running.size).toBe(0)
      view.unmount()
    })
  })

  it('cancels count-up work and rejects stale completion callbacks', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const app = appLifecycle()
    const runs: { stop: ReturnType<typeof vi.fn<() => void>>; complete?: Animated.EndCallback | undefined }[] = []
    vi.spyOn(Animated, 'timing').mockImplementation(() => {
      const run: (typeof runs)[number] = { stop: vi.fn() }
      runs.push(run)
      return { start: callback => { run.complete = callback }, stop: run.stop, reset: vi.fn() }
    })
    await withFullMotion(async () => {
      const hook = renderHook(({ total }) => useCountUp(total), { initialProps: { total: 40 } })
      await resolvePreference()
      const first = runs.at(-1)!
      hook.rerender({ total: 100 })
      const second = runs.at(-1)!
      expect(first.stop).toHaveBeenCalledOnce()
      act(() => second.complete?.({ finished: true }))
      expect(hook.result.current).toBe(100)
      act(() => first.complete?.({ finished: false }))
      expect(hook.result.current).toBe(100)
      hook.rerender({ total: 120 })
      const third = runs.at(-1)!
      app.change('background')
      expect(third.stop).toHaveBeenCalledOnce()
      expect(hook.result.current).toBe(120)
      hook.unmount()
      expect(app.listeners.size).toBe(0)
    })
  })
})
