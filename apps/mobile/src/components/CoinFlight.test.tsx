import type { ContextType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccessibilityInfo, Animated } from 'react-native'
import { act, render, renderHook } from '@testing-library/react'
import { NavigationContext } from '@react-navigation/native'
import { setAppReducedMotion } from '@worldquest/design'
import { withFullMotion } from '../test/setup.js'
import { CoinFlight, forgetShownCounters, useArrivals } from './CoinFlight.js'

afterEach(() => { setAppReducedMotion(false); forgetShownCounters(); vi.restoreAllMocks() })

const flushPreference = () => act(async () => { await Promise.resolve() })

function screen(initiallyFocused: boolean) {
  let focused = initiallyFocused
  const listeners = new Set<() => void>()
  const navigation = {
    isFocused: () => focused,
    addListener: (_event: string, callback: () => void) => { listeners.add(callback); return () => { listeners.delete(callback) } },
  } as unknown as ContextType<typeof NavigationContext>
  return {
    wrapper: ({ children }: { children: ReactNode }) => <NavigationContext.Provider value={navigation}>{children}</NavigationContext.Provider>,
    show: () => act(() => { focused = true; listeners.forEach(callback => callback()) }),
  }
}

describe('a reward waits until it can be seen', () => {
  it('is never a rise on first sight: opening the app is not earning coins', () => {
    const hook = renderHook(() => useArrivals('coins', 40))
    expect(hook.result.current).toBe(0)
  })

  it('remembers across a rebuilt screen: Home is rebuilt after the lesson that paid', () => {
    // Traced in the web build: the bar that saw 5 coins is gone when Home comes back
    // with 15, so a per-bar memory celebrated nothing. The memory outlives the bar.
    const before = renderHook(() => useArrivals('coins', 5))
    before.unmount()
    const after = renderHook(() => useArrivals('coins', 15))
    expect(after.result.current).toBe(1)
  })

  it('holds a rise made while the screen is covered, and counts it when shown', () => {
    const home = screen(true)
    const hook = renderHook(({ value }) => useArrivals('coins', value), { initialProps: { value: 5 }, wrapper: home.wrapper })
    const covered = screen(false)
    hook.unmount()
    const again = renderHook(({ value }) => useArrivals('coins', value), { initialProps: { value: 15 }, wrapper: covered.wrapper })
    expect(again.result.current).toBe(0)
    covered.show()
    expect(again.result.current).toBe(1)
  })

  it('celebrates a rise once, on the first bar that shows it', () => {
    renderHook(() => useArrivals('coins', 5)).unmount()
    const first = renderHook(() => useArrivals('coins', 15))
    const second = renderHook(() => useArrivals('coins', 15))
    expect(first.result.current).toBe(1)
    expect(second.result.current).toBe(0)
  })
})

describe('coins fly into the counter', () => {
  it('does nothing on mount, flies six coins on a rise, then lands once', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    let finish: ((result: { finished: boolean }) => void) | undefined
    const timing = vi.spyOn(Animated, 'timing').mockReturnValue({
      start: (callback?: (result: { finished: boolean }) => void) => { finish = callback },
      stop: vi.fn(), reset: vi.fn(),
    })
    const onLanded = vi.fn()
    await withFullMotion(async () => {
      const view = render(<CoinFlight trigger={0} onLanded={onLanded} />)
      await flushPreference()
      expect(view.queryByTestId('coin-flight')).toBeNull()
      expect(timing).not.toHaveBeenCalled()

      view.rerender(<CoinFlight trigger={1} onLanded={onLanded} />)
      expect(view.getByTestId('coin-flight').children).toHaveLength(6)
      expect(timing.mock.calls.at(-1)?.[1]).toMatchObject({ useNativeDriver: true, isInteraction: false })
      expect(onLanded).not.toHaveBeenCalled()

      act(() => finish?.({ finished: true }))
      expect(onLanded).toHaveBeenCalledOnce()
      expect(view.queryByTestId('coin-flight')).toBeNull()
    })
  })

  it('lands at once, without flying, under Reduce Motion', async () => {
    setAppReducedMotion(true)
    const timing = vi.spyOn(Animated, 'timing')
    const onLanded = vi.fn()
    const view = render(<CoinFlight trigger={0} onLanded={onLanded} />)
    view.rerender(<CoinFlight trigger={1} onLanded={onLanded} />)
    expect(onLanded).toHaveBeenCalledOnce()
    expect(view.queryByTestId('coin-flight')).toBeNull()
    expect(timing).not.toHaveBeenCalled()
  })
})
