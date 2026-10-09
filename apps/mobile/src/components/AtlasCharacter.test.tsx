import type { ContextType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccessibilityInfo, Animated, AppState, Platform, type AppStateStatus } from 'react-native'
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react'
import { NavigationContext } from '@react-navigation/native'
import { motion, setAppReducedMotion, useReducedMotion } from '@worldquest/design'
import { useMascotMotion } from './useMascotMotion.js'
import { IDLE, useMascotIdle } from './useMascotIdle.js'
import { AtlasCharacter, type AtlasMood } from './AtlasCharacter.js'
import { withFullMotion } from '../test/setup.js'
import { usePreferences, initializeMotionPreference } from '../features/settings/usePreferences.js'
import { writeJson } from '../lib/storage.js'
import { ATLAS_CLAY } from '../lib/atlasClay.generated.js'

afterEach(() => { vi.useRealTimers(); setAppReducedMotion(false); vi.restoreAllMocks() })

const flushPreference = () => act(async () => { await Promise.resolve() })
const art = (...moods: AtlasMood[]) => new Set<unknown>(moods.map(mood => ATLAS_CLAY[mood]))

function lifecycle(initialFocus = true) {
  let state: AppStateStatus = 'active'
  let focused = initialFocus
  const appListeners = new Set<(state: AppStateStatus) => void>()
  const navigationListeners = new Map<string, Set<() => void>>()
  vi.spyOn(AppState, 'currentState', 'get').mockImplementation(() => state)
  vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    appListeners.add(callback)
    return { remove: () => { appListeners.delete(callback) } }
  })
  const navigation = {
    isFocused: () => focused,
    addListener: (event: string, callback: () => void) => {
      const listeners = navigationListeners.get(event) ?? new Set<() => void>()
      listeners.add(callback); navigationListeners.set(event, listeners)
      return () => { listeners.delete(callback) }
    },
  } as unknown as ContextType<typeof NavigationContext>
  return {
    wrapper: ({ children }: { children: ReactNode }) => <NavigationContext.Provider value={navigation}>{children}</NavigationContext.Provider>,
    app: (next: AppStateStatus) => act(() => { state = next; appListeners.forEach(callback => callback(next)) }),
    focus: (value: boolean) => act(() => { focused = value; navigationListeners.get(value ? 'focus' : 'blur')?.forEach(callback => callback()) }),
    listenerCount: () => appListeners.size + [...navigationListeners.values()].reduce((sum, listeners) => sum + listeners.size, 0),
  }
}

describe('Atlas and motion preferences', () => {
  it('does not repeat a greeting when the learner returns to the same screen', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const events = lifecycle()
    const start = vi.fn()
    vi.spyOn(Animated, 'timing').mockReturnValue({ start, stop: vi.fn(), reset: vi.fn() })
    await withFullMotion(async () => {
      const hook = renderHook(() => useMascotMotion('welcome', 112, art('welcome')), { wrapper: events.wrapper })
      await flushPreference()
      expect(start).toHaveBeenCalledOnce()
      events.app('background')
      events.app('active')
      events.focus(false)
      events.focus(true)
      expect(start).toHaveBeenCalledOnce()
      hook.unmount()
      expect(events.listenerCount()).toBe(0)
    })
  })

  it('waits for the exact pose to decode, plays once with native transforms, and schedules no idle work', async () => {
    vi.useFakeTimers()
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    lifecycle()
    const start = vi.fn()
    const stop = vi.fn()
    const timing = vi.spyOn(Animated, 'timing').mockReturnValue({ start, stop, reset: vi.fn() })
    await withFullMotion(async () => {
      const hook = renderHook(({ decoded }) => useMascotMotion('thinking', 112, decoded), { initialProps: { decoded: art('welcome') } })
      await flushPreference()
      expect(start).not.toHaveBeenCalled()
      hook.rerender({ decoded: art('welcome', 'thinking') })
      expect(start).toHaveBeenCalledOnce()
      expect(timing.mock.calls[0]?.[1]).toMatchObject({ useNativeDriver: true, isInteraction: false, duration: motion.celebrate.duration })
      act(() => vi.advanceTimersByTime(motion.drift.duration * 100))
      expect(start).toHaveBeenCalledOnce()
      expect(hook.result.current.playing).toBe('thinking')
      expect(vi.getTimerCount()).toBe(0)
      hook.unmount()
      expect(stop).toHaveBeenCalledOnce()
    })
  })

  it('keeps one complete image in its motion parent before decoding, with no film or sheet', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const events = lifecycle()
    const start = vi.fn(), stop = vi.fn()
    vi.spyOn(Animated, 'timing').mockReturnValue({ start, stop, reset: vi.fn() })
    await withFullMotion(async () => {
      const view = render(<AtlasCharacter size={160} />)
      await flushPreference()
      expect(view.getByTestId('mascot-motion').contains(view.getByTestId('mascot-still'))).toBe(true)
      expect(view.queryByTestId('mascot-film')).toBeNull()
      expect(view.queryByTestId('mascot-sheet')).toBeNull()
      expect(start).not.toHaveBeenCalled()
      view.unmount()
      expect(events.listenerCount()).toBe(0)
    })
  })

  it.each<[AtlasMood, string]>([
    ['welcome', 'welcome'], ['celebrate', 'celebrate'], ['thinking', 'thinking'], ['resting', 'resting'],
    ['encouraging', 'welcome'], ['laughing', 'laughing'], ['surprised', 'celebrate'],
    ['proud', 'proud'], ['sleepy', 'resting'], ['wink', 'wink'],
  ])('preserves the logical %s pose with the complete %s artwork', (mood, mapped) => {
      setAppReducedMotion(true)
      const view = render(<AtlasCharacter size={140} mood={mood} />)
      const still = view.getByTestId('mascot-still')
      const image = still.querySelector('img') ?? still
      expect(image.getAttribute('src')).toContain(`atlas-clay/${mapped}.png`)
      expect(view.getByTestId(`mascot-pose-${mood}`)).toBeTruthy()
      expect(view.getByTestId('mascot-motion').style.transform).toBe('')
      expect(view.queryByTestId('mascot-film')).toBeNull()
      expect(view.getByTestId('world-mascot').getAttribute('aria-hidden')).toBe('true')
    })

  it('cancels a boop on blur/background and never resumes while hidden or reduced', async () => {
    vi.useFakeTimers()
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const events = lifecycle(false)
    const start = vi.fn(), stop = vi.fn()
    vi.spyOn(Animated, 'timing').mockReturnValue({ start, stop, reset: vi.fn() })
    await withFullMotion(async () => {
      const hook = renderHook(() => useMascotMotion('welcome', 112, art('welcome', 'laughing')), { wrapper: events.wrapper })
      await flushPreference()
      expect(start).not.toHaveBeenCalled()
      act(() => hook.result.current.boopNow())
      expect(hook.result.current.playing).toBe('welcome')
      events.focus(true)
      expect(start).toHaveBeenCalledOnce()
      act(() => hook.result.current.boopNow())
      expect(hook.result.current.playing).toBe('laughing')
      expect(vi.getTimerCount()).toBe(1)
      events.focus(false)
      expect(hook.result.current.playing).toBe('welcome')
      expect(vi.getTimerCount()).toBe(0)
      const hiddenStarts = start.mock.calls.length
      events.app('background')
      events.app('active')
      expect(start).toHaveBeenCalledTimes(hiddenStarts)
      events.focus(true)
      expect(start).toHaveBeenCalledTimes(hiddenStarts + 1)
      act(() => hook.result.current.boopNow())
      events.app('background')
      expect(hook.result.current.playing).toBe('welcome')
      expect(vi.getTimerCount()).toBe(0)
      events.app('active')
      act(() => setAppReducedMotion(true))
      const reducedStarts = start.mock.calls.length
      events.app('background')
      events.app('active')
      expect(start).toHaveBeenCalledTimes(reducedStarts)
      expect(stop).toHaveBeenCalled()
      hook.unmount()
      expect(events.listenerCount()).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('keeps compact icons still', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    lifecycle()
    const start = vi.fn()
    vi.spyOn(Animated, 'timing').mockReturnValue({ start, stop: vi.fn(), reset: vi.fn() })
    await withFullMotion(async () => {
      const hook = renderHook(() => useMascotMotion('welcome', 40, art('welcome')))
      await flushPreference()
      expect(start).not.toHaveBeenCalled()
      hook.unmount()
    })
  })

  it('applies the in-app setting immediately to mounted animation consumers', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    await withFullMotion(async () => {
      const hook = renderHook(() => ({ setting: usePreferences(), reduced: useReducedMotion() }))
      await waitFor(() => expect(hook.result.current.reduced).toBe(false))
      act(() => hook.result.current.setting.set('reduceMotion', true))
      expect(hook.result.current.reduced).toBe(true)
      act(() => hook.result.current.setting.set('reduceMotion', false))
      await waitFor(() => expect(hook.result.current.reduced).toBe(false))
    })
  })

  it('never lets the in-app switch override an OS request for reduced motion', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
    setAppReducedMotion(false)
    const hook = renderHook(useReducedMotion)
    await waitFor(() => expect(hook.result.current).toBe(true))
  })

  it('restores the persisted setting before the next screen mounts', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    writeJson('preferences.v1', { reduceMotion: true })
    initializeMotionPreference()
    await withFullMotion(async () => {
      const hook = renderHook(useReducedMotion)
      await act(async () => { await Promise.resolve() })
      expect(hook.result.current).toBe(true)
    })
  })
})




describe('Booping Atlas', () => {
  it('waits for laughing artwork before starting its gesture or finite hold', async () => {
    vi.useFakeTimers()
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    lifecycle()
    const start = vi.fn()
    vi.spyOn(Animated, 'timing').mockReturnValue({ start, stop: vi.fn(), reset: vi.fn() })
    await withFullMotion(async () => {
      const hook = renderHook(({ decoded }) => useMascotMotion('welcome', 112, decoded), { initialProps: { decoded: art('welcome') } })
      await flushPreference()
      start.mockClear()
      act(() => hook.result.current.boopNow())
      expect(hook.result.current.playing).toBe('laughing')
      expect(start).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
      act(() => vi.advanceTimersByTime(motion.celebrate.duration * 3))
      expect(hook.result.current.playing).toBe('laughing')
      hook.rerender({ decoded: art('welcome', 'laughing') })
      expect(start).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(1)
      act(() => vi.advanceTimersByTime(motion.celebrate.duration * 2))
      expect(hook.result.current.playing).toBe('welcome')
      expect(start).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
      hook.unmount()
    })
  })

  it('replays explicit taps even during a laugh or when laughing is the base pose', async () => {
    vi.useFakeTimers()
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    lifecycle()
    const start = vi.fn()
    vi.spyOn(Animated, 'timing').mockReturnValue({ start, stop: vi.fn(), reset: vi.fn() })
    await withFullMotion(async () => {
      const hook = renderHook(() => useMascotMotion('laughing', 112, art('laughing', 'wink')))
      await flushPreference()
      expect(start).toHaveBeenCalledOnce()
      act(() => hook.result.current.boopNow())
      expect(start).toHaveBeenCalledTimes(2)
      act(() => vi.advanceTimersByTime(motion.celebrate.duration))
      act(() => hook.result.current.boopNow())
      expect(start).toHaveBeenCalledTimes(3)
      expect(vi.getTimerCount()).toBe(1)
      hook.unmount()
      act(() => vi.advanceTimersByTime(motion.celebrate.duration * 3))
      expect(start).toHaveBeenCalledTimes(3)
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('changes expression without movement for reduced motion and settles once', async () => {
    vi.useFakeTimers()
    setAppReducedMotion(true)
    lifecycle()
    const timing = vi.spyOn(Animated, 'timing')
    const hook = renderHook(() => useMascotMotion('welcome', 112, art('welcome', 'laughing')))
    await flushPreference()
    act(() => hook.result.current.boopNow())
    expect(hook.result.current.playing).toBe('laughing')
    expect(timing).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(motion.celebrate.duration * 2))
    expect(hook.result.current.playing).toBe('welcome')
    expect(vi.getTimerCount()).toBe(0)
    hook.unmount()
  })

  it('is a named button only where a screen opts in, and laughs when tapped', async () => {
    const { WorldMascot } = await import('./WorldMascot.js')
    const decorative = render(<WorldMascot style={{ width: 120, height: 120 }} />)
    expect(decorative.queryByRole('button')).toBeNull()
    decorative.unmount()

    // Reduced motion, where the laughing still is HELD for a moment (jsdom would finish
    // the film in a frame and end the laugh before it could be seen).
    setAppReducedMotion(true)
    const view = render(<WorldMascot style={{ width: 120, height: 120 }} onBoopLabel="Atlas, your guide. Tap for a giggle." />)
    const button = view.getByRole('button', { name: 'Atlas, your guide. Tap for a giggle.' })
    expect(view.getByTestId('mascot-pose-welcome')).toBeTruthy()
    act(() => { fireEvent.click(button) })
    expect(view.getByTestId('mascot-pose-laughing')).toBeTruthy()
    // A second tap winks: two reactions in turn, not one button.
    act(() => { fireEvent.click(button) })
    expect(view.getByTestId('mascot-pose-wink')).toBeTruthy()
    act(() => { fireEvent.click(button) })
    expect(view.getByTestId('mascot-pose-laughing')).toBeTruthy()
  })
})

describe('Atlas moves like his face', () => {
  it('hops for a cheer, tilts his head for a thought, and greets otherwise', async () => {
    const { WorldMascot } = await import('./WorldMascot.js')
    const gesture = (mood: 'celebrate' | 'thinking' | 'welcome') => {
      const { getByTestId, unmount } = render(<WorldMascot mood={mood} style={{ width: 96, height: 96 }} />)
      const value = getByTestId('mascot-motion').getAttribute('data-gesture')
      unmount()
      return value
    }
    expect(gesture('celebrate')).toBe('hop')
    expect(gesture('thinking')).toBe('ponder')
    expect(gesture('welcome')).toBe('greet')
  })
})

describe('Atlas at rest: he breathes and blinks', () => {
  function loops() {
    const running = new Set<number>()
    let id = 0
    const timing = vi.spyOn(Animated, 'timing').mockReturnValue({ start: vi.fn(), stop: vi.fn(), reset: vi.fn() })
    const loop = vi.spyOn(Animated, 'loop').mockImplementation(() => {
      const key = id++
      return { start: () => { running.add(key) }, stop: () => { running.delete(key) }, reset: vi.fn() }
    })
    return { running, timing, loop }
  }

  it('snaps his eyes shut once per rest, and starts and ends each cycle with them open', () => {
    const { inputRange, outputRange } = IDLE.lids
    expect(inputRange[0]).toBe(0)
    expect(inputRange.at(-1)).toBe(1)
    inputRange.slice(1).forEach((at, i) => expect(at).toBeGreaterThan(inputRange[i]!))
    expect(outputRange[0]).toBe(0)
    expect(outputRange.at(-1)).toBe(0)
    const closings = outputRange.filter((lid, i) => lid === 1 && outputRange[i - 1] === 0).length
    expect(closings).toBe(motion.blink.restMs.length)
    // Snapped, not faded: every edge between open and shut is shorter than a 120 Hz frame,
    // so open eyes never show through closed ones.
    outputRange.forEach((lid, i) => {
      if (i > 0 && lid !== outputRange[i - 1]) expect((inputRange[i]! - inputRange[i - 1]!) * IDLE.cycle).toBeLessThan(1000 / 120)
    })
  })

  it('breathes whole, slow breaths that meet at the loop seam', () => {
    const { inputRange, outputRange } = IDLE.breath
    expect(inputRange[0]).toBe(0)
    expect(inputRange.at(-1)).toBe(1)
    expect(outputRange[0]).toBeCloseTo(0)
    expect(outputRange.at(-1)).toBeCloseTo(0)
    const peaks = outputRange.filter(value => value > 0.999).length
    expect(peaks).toBe(IDLE.breaths)
    // Within a fifth of the token: a whole number of breaths has to fit the blink cycle.
    expect(Math.abs(IDLE.cycle / IDLE.breaths - motion.breathe.duration)).toBeLessThan(motion.breathe.duration / 5)
  })

  it('runs as one native loop with no JS timers, and stops with his eyes open while hidden', async () => {
    vi.useFakeTimers()
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const events = lifecycle()
    const work = loops()
    await withFullMotion(async () => {
      const hook = renderHook(() => useMascotIdle(true), { wrapper: events.wrapper })
      await flushPreference()
      expect(work.running.size).toBe(1)
      expect(work.timing).toHaveBeenCalledTimes(1)
      // These tests render on react-native-web, where the loop must use the JS driver.
      expect(work.timing.mock.calls.at(-1)?.[1]).toMatchObject({ useNativeDriver: false, isInteraction: false, duration: IDLE.cycle })
      expect(vi.getTimerCount()).toBe(0)
      events.focus(false)
      expect(work.running.size).toBe(0)
      events.focus(true)
      expect(work.running.size).toBe(1)
      events.app('background')
      expect(work.running.size).toBe(0)
      events.app('active')
      expect(work.running.size).toBe(1)
      hook.unmount()
      expect(work.running.size).toBe(0)
      expect(events.listenerCount()).toBe(0)
    })
  })

  it('runs on the native driver on a phone', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    lifecycle()
    const work = loops()
    const platform = Platform as unknown as { OS: string }
    const os = platform.OS
    platform.OS = 'ios'
    try {
      await withFullMotion(async () => {
        const hook = renderHook(() => useMascotIdle(true))
        await flushPreference()
        expect(work.timing.mock.calls.at(-1)?.[1]).toMatchObject({ useNativeDriver: true })
        hook.unmount()
      })
    } finally {
      platform.OS = os
    }
  })

  it('never blinks under reduced motion, or when the caller has nothing to blink', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    lifecycle()
    const work = loops()
    await withFullMotion(async () => {
      const off = renderHook(() => useMascotIdle(false))
      await flushPreference()
      off.unmount()
    })
    setAppReducedMotion(true)
    const reduced = renderHook(() => useMascotIdle(true))
    await flushPreference()
    reduced.unmount()
    expect(work.loop).not.toHaveBeenCalled()
  })

  it('lays closed eyes over open-eyed poses only, breathes in every pose, and only where he is big enough to see', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    lifecycle()
    loops()
    const { WorldMascot } = await import('./WorldMascot.js')
    await withFullMotion(async () => {
      const overlay = async (mood: AtlasMood, side: number) => {
        const view = render(<WorldMascot mood={mood} style={{ width: side, height: side }} />)
        await flushPreference()
        const blink = view.queryByTestId('mascot-blink')
        const source = blink === null ? null : (blink.querySelector('img') ?? blink).getAttribute('src')
        const breathing = view.getByTestId('mascot-breath').style.transform !== ''
        view.unmount()
        return { source, breathing }
      }
      expect(await overlay('welcome', 160)).toEqual({ source: expect.stringContaining('atlas-clay/welcome-blink.png'), breathing: true })
      expect(await overlay('celebrate', 160)).toEqual({ source: expect.stringContaining('atlas-clay/celebrate-blink.png'), breathing: true })
      // Eyes already shut: nothing to blink, but he still breathes.
      expect(await overlay('resting', 160)).toEqual({ source: null, breathing: true })
      expect(await overlay('proud', 160)).toEqual({ source: null, breathing: true })
      expect(await overlay('welcome', 40)).toEqual({ source: null, breathing: false })
    })
    setAppReducedMotion(true)
    const still = render(<WorldMascot mood="welcome" style={{ width: 160, height: 160 }} />)
    expect(still.queryByTestId('mascot-blink')).toBeNull()
    expect(still.getByTestId('mascot-breath').style.transform).toBe('')
  })
})
