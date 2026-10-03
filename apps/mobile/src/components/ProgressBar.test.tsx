import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { AccessibilityInfo, Animated, AppState, type AppStateStatus } from 'react-native'
import { ProgressBar, setAppReducedMotion } from '@worldquest/design'
import { withFullMotion } from '../test/setup.js'

afterEach(() => { setAppReducedMotion(false); vi.restoreAllMocks() })

describe('progress feedback', () => {
  it('reports the true value immediately while fill motion is pending, and cancels stale work', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const stops: ReturnType<typeof vi.fn>[] = []
    const timing = vi.spyOn(Animated, 'timing').mockImplementation(() => {
      const stop = vi.fn(); stops.push(stop)
      return { start: vi.fn(), stop, reset: vi.fn() }
    })
    const listeners = new Set<(value: AppStateStatus) => void>()
    vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      listeners.add(callback)
      return { remove: () => { listeners.delete(callback) } }
    })
    await withFullMotion(async () => {
      const view = render(<ProgressBar current={2} total={10} label="Progress" />)
      await act(async () => { await Promise.resolve() })
      // Restoring progress does not replay a fill from zero.
      expect(timing).not.toHaveBeenCalled()
      view.rerender(<ProgressBar current={5} total={10} label="Progress" />)
      expect(view.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('5')
      expect(view.getByText('5 / 10')).toBeTruthy()
      expect(timing).toHaveBeenCalledOnce()
      // A label or parent rerender must not restart an in-flight fill.
      view.rerender(<ProgressBar current={5} total={10} label="Updated label" />)
      expect(timing).toHaveBeenCalledOnce()
      view.rerender(<ProgressBar current={7} total={10} label="Progress" />)
      expect(stops[0]).toHaveBeenCalledOnce()
      expect(timing).toHaveBeenCalledTimes(2)
      act(() => listeners.forEach(callback => callback('background')))
      expect(stops[1]).toHaveBeenCalledOnce()
      const fill = view.container.querySelector<HTMLElement>('[style*="scaleX"]')!
      expect(fill.style.transform).toContain('scaleX(0.7)')
      view.unmount()
      expect(listeners.size).toBe(0)
    })
  })

  it('settles immediately when motion is reduced and never replays that change later', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const timing = vi.spyOn(Animated, 'timing')
    setAppReducedMotion(true)
    await withFullMotion(async () => {
      const view = render(<ProgressBar current={0} total={10} />)
      await act(async () => { await Promise.resolve() })
      view.rerender(<ProgressBar current={10} total={10} />)
      expect(view.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('10')
      expect(view.container.querySelector<HTMLElement>('[style*="scaleX"]')!.style.transform).toContain('scaleX(1)')
      expect(timing).not.toHaveBeenCalled()
      act(() => setAppReducedMotion(false))
      expect(timing).not.toHaveBeenCalled()
    })
  })
})
