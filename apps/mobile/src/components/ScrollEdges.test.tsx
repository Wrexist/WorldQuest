import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccessibilityInfo, Platform, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import { illustration, motion } from '@worldquest/design'
import { ScrollEdges, useScrollEdges, type ScrollEdgeState } from './ScrollEdges.js'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

const midway: ScrollEdgeState = { moving: false, scrolled: true, atEnd: false }

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

const scrollTo = (y: number) => ({ nativeEvent: { contentOffset: { x: 0, y } } }) as NativeSyntheticEvent<NativeScrollEvent>
const viewport = (height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } }) as LayoutChangeEvent

describe('soft scroll edges', () => {
  it('draws a top and a bottom edge that never take a touch', () => {
    const view = render(<ScrollEdges state={midway} />)
    for (const side of ['top', 'bottom']) {
      const edge = view.getByTestId(`scroll-edge-${side}`)
      expect(edge.getAttribute('aria-hidden')).toBe('true')
      expect(getComputedStyle(edge).pointerEvents).toBe('none')
    }
  })

  it('softens only where there is content: the top once scrolled, the bottom until the end', () => {
    // At the top of a page the bar and the first card are never blurred; at the end, the last card is not.
    const shown = (view: ReturnType<typeof render>, side: string) => view.getByTestId(`scroll-edge-${side}`).getAttribute('data-shown')
    const atTop = render(<ScrollEdges state={{ moving: false, scrolled: false, atEnd: false }} />)
    expect(shown(atTop, 'top')).toBe('false')
    expect(shown(atTop, 'bottom')).toBe('true')
    atTop.rerender(<ScrollEdges state={{ moving: false, scrolled: true, atEnd: true }} />)
    expect(shown(atTop, 'top')).toBe('true')
    expect(shown(atTop, 'bottom')).toBe('false')
  })

  it('fades without blurring off iOS: Android blur is costly, and the web has no mask', () => {
    const view = render(<ScrollEdges state={midway} />)
    expect(view.container.querySelector('[data-intensity]')).toBeNull()
  })

  it('blurs on iOS, and blurs less while the content is moving', async () => {
    await asIos(false, async () => {
      const view = render(<ScrollEdges state={midway} />)
      const blurs = () => Array.from(view.container.querySelectorAll('[data-intensity]')).map(node => node.getAttribute('data-intensity'))
      expect(blurs()).toEqual([String(illustration.edgeBlur.rest), String(illustration.edgeBlur.rest)])
      view.rerender(<ScrollEdges state={{ ...midway, moving: true }} />)
      expect(blurs()).toEqual([String(illustration.edgeBlur.moving), String(illustration.edgeBlur.moving)])
      expect(illustration.edgeBlur.moving).toBeLessThan(illustration.edgeBlur.rest)
    })
  })

  it('only fades under Reduce Transparency, as the setting asks', async () => {
    await asIos(true, async () => {
      const view = render(<ScrollEdges state={midway} />)
      await waitFor(() => expect(view.container.querySelector('[data-intensity]')).toBeNull())
    })
  })
})

describe('knowing where the page is', () => {
  it('tracks whether the page has left its top and reached its end', () => {
    const { result } = renderHook(useScrollEdges)
    act(() => {
      result.current.handlers.onLayout(viewport(500))
      result.current.handlers.onContentSizeChange(390, 1200)
    })
    expect(result.current.scrolled).toBe(false)
    expect(result.current.atEnd).toBe(false)
    act(() => result.current.handlers.onScroll(scrollTo(300)))
    expect(result.current.scrolled).toBe(true)
    expect(result.current.atEnd).toBe(false)
    act(() => result.current.handlers.onScroll(scrollTo(700)))
    expect(result.current.atEnd).toBe(true)
  })

  it('counts a page that never overflows as already at its end', () => {
    const { result } = renderHook(useScrollEdges)
    act(() => {
      result.current.handlers.onLayout(viewport(800))
      result.current.handlers.onContentSizeChange(390, 600)
    })
    expect(result.current.atEnd).toBe(true)
  })

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
