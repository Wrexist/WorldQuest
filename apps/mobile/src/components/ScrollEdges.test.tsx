import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccessibilityInfo, Platform } from 'react-native'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import { illustration, motion } from '@worldquest/design'
import { ScrollEdges, useScrollEdges } from './ScrollEdges.js'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

/** Run a test as iOS, where the edges are a real blur, with Reduce Transparency set. */
async function asIos(reduceTransparency: boolean, run: () => Promise<void> | void) {
  const platform = Platform as unknown as { OS: string }
  // react-native-web has no Reduce Transparency query; iOS does.
  const info = AccessibilityInfo as unknown as { isReduceTransparencyEnabled?: () => Promise<boolean> }
  const os = platform.OS
  platform.OS = 'ios'
  info.isReduceTransparencyEnabled = () => Promise.resolve(reduceTransparency)
  try { await run() } finally { platform.OS = os; delete info.isReduceTransparencyEnabled }
}

describe('soft scroll edges', () => {
  it('draws a top and a bottom strip that never take a touch', () => {
    const view = render(<ScrollEdges />)
    for (const side of ['top', 'bottom']) {
      const edge = view.getByTestId(`scroll-edge-${side}`)
      expect(edge.getAttribute('aria-hidden')).toBe('true')
      expect(getComputedStyle(edge).pointerEvents).toBe('none')
    }
  })

  it('fades without blurring off iOS: Android blur is costly, and the web has no mask', () => {
    const view = render(<ScrollEdges />)
    expect(view.container.querySelector('[data-intensity]')).toBeNull()
  })

  it('blurs on iOS, and blurs less while the content is moving', async () => {
    await asIos(false, async () => {
      const view = render(<ScrollEdges />)
      const blurs = () => Array.from(view.container.querySelectorAll('[data-intensity]')).map(node => node.getAttribute('data-intensity'))
      expect(blurs()).toEqual([String(illustration.edgeBlur.rest), String(illustration.edgeBlur.rest)])
      view.rerender(<ScrollEdges moving />)
      expect(blurs()).toEqual([String(illustration.edgeBlur.moving), String(illustration.edgeBlur.moving)])
      expect(illustration.edgeBlur.moving).toBeLessThan(illustration.edgeBlur.rest)
    })
  })

  it('only fades under Reduce Transparency, as the setting asks', async () => {
    await asIos(true, async () => {
      const view = render(<ScrollEdges />)
      await waitFor(() => expect(view.container.querySelector('[data-intensity]')).toBeNull())
    })
  })
})

describe('knowing when the page is moving', () => {
  it('is moving from the touch until a drag without a fling has had a beat to settle', () => {
    vi.useFakeTimers()
    const { result } = renderHook(useScrollEdges)
    expect(result.current.moving).toBe(false)
    act(() => result.current.handlers.onScrollBeginDrag())
    expect(result.current.moving).toBe(true)
    act(() => result.current.handlers.onScrollEndDrag())
    expect(result.current.moving).toBe(true)
    act(() => vi.advanceTimersByTime(motion.quick.duration))
    expect(result.current.moving).toBe(false)
  })

  it('stays moving through a fling, and settles when the fling ends', () => {
    vi.useFakeTimers()
    const { result } = renderHook(useScrollEdges)
    act(() => result.current.handlers.onScrollBeginDrag())
    act(() => result.current.handlers.onScrollEndDrag())
    act(() => result.current.handlers.onMomentumScrollBegin())
    act(() => vi.advanceTimersByTime(motion.quick.duration * 4))
    expect(result.current.moving).toBe(true)
    act(() => result.current.handlers.onMomentumScrollEnd())
    expect(result.current.moving).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
