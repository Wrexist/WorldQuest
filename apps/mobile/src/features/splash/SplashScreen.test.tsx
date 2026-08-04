import { describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import {
  FAILED_AFTER_MS,
  SLOW_AFTER_MS,
  SplashScreen,
  useSplashPhase,
} from './SplashScreen.js'

describe('Splash — what it shows', () => {
  it('says nothing about loading while the boot is still quick', () => {
    // A status line that flashes for 300ms is noise. Under the budget, the screen is
    // the mark and the name and nothing else.
    const { container } = render(<SplashScreen />)
    expect(screen.getByText('WorldQuest')).toBeTruthy()
    expect(container.textContent).not.toMatch(/Getting your world ready/)
    expect(container.textContent).not.toMatch(/took too long/)
  })

  it('admits time is passing once the boot is slow', () => {
    // The difference between "slow" and "frozen" is entirely whether anything on
    // screen says time is passing.
    render(<SplashScreen phase="slow" />)
    expect(screen.getByText(/Getting your world ready/)).toBeTruthy()
  })

  it('stops claiming to be loading once it has failed', () => {
    const { container } = render(<SplashScreen phase="failed" onRetry={vi.fn()} />)
    expect(screen.getByText(/took too long/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/Getting your world ready/)
  })

  it('offers a way out of a failed boot', () => {
    // A splash that never resolves looks identical to a crash and has nothing to press.
    const onRetry = vi.fn()
    render(<SplashScreen phase="failed" onRetry={onRetry} />)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('does not draw a retry button with nothing behind it', () => {
    render(<SplashScreen phase="failed" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('never blames the user or their connection', () => {
    // We do not know it was the network, and a ten-year-old reading "check your
    // connection" on a working connection learns the app lies.
    const { container } = render(<SplashScreen phase="failed" onRetry={vi.fn()} />)
    expect(container.textContent).not.toMatch(
      /your connection|your device|your fault|check your|no internet/i,
    )
  })

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = render(<SplashScreen phase="slow" />)
    expect(container.textContent).not.toMatch(/\bsplash:[a-z]/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})

describe('Splash — the phase clock', () => {
  it('starts booting', () => {
    const { result } = renderHook(() => useSplashPhase(false))
    expect(result.current).toBe('booting')
  })

  it('never leaves booting once the app is ready', () => {
    // The important half. A boot that finishes in 80ms must not schedule a "slow"
    // that fires at 1.2s onto a screen the user left a second ago.
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useSplashPhase(true))
      act(() => void vi.advanceTimersByTime(FAILED_AFTER_MS * 2))
      expect(result.current).toBe('booting')
    } finally {
      vi.useRealTimers()
    }
  })

  it('goes slow at the budget and failed at the ceiling', () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useSplashPhase(false))

      act(() => void vi.advanceTimersByTime(SLOW_AFTER_MS - 10))
      expect(result.current).toBe('booting')

      act(() => void vi.advanceTimersByTime(20))
      expect(result.current).toBe('slow')

      act(() => void vi.advanceTimersByTime(FAILED_AFTER_MS))
      expect(result.current).toBe('failed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('holds no minimum duration of its own', () => {
    // A splash held open so the logo can be admired is an app made slower on purpose.
    // There is no timer here that delays readiness — only ones that describe waiting.
    expect(SLOW_AFTER_MS).toBeGreaterThan(0)
    expect(FAILED_AFTER_MS).toBeGreaterThan(SLOW_AFTER_MS)
  })
})
