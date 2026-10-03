import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { AccessibilityInfo, Animated } from 'react-native'
import { motion, setAppReducedMotion } from '@worldquest/design'
import { withFullMotion } from '../../test/setup.js'
import { StreakGemCollection } from './StreakGemCollection.js'

const days = Array.from({ length: 16 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)

afterEach(() => { setAppReducedMotion(false); vi.restoreAllMocks() })
describe('streak gem album', () => {
  it('browses every earned day, newest first, without losing older gems', () => {
    render(<StreakGemCollection days={days} />)
    expect(screen.getAllByTestId('collected-streak-gem')).toHaveLength(7)
    expect(screen.getByText('Gems 1–7 of 16')).toBeTruthy()
    expect(screen.getByText('Sep 16, 2026')).toBeTruthy()
    fireEvent.click(screen.getByText('Older gems'))
    expect(screen.getByText('Gems 8–14 of 16')).toBeTruthy()
    fireEvent.click(screen.getByText('Older gems'))
    expect(screen.getAllByTestId('collected-streak-gem')).toHaveLength(2)
    expect(screen.getByText('Sep 1, 2026')).toBeTruthy()
    fireEvent.click(screen.getByText('Newer gems'))
    expect(screen.getByText('Gems 8–14 of 16')).toBeTruthy()
  })
  it('clamps the page if the collection shrinks and offers the empty-state chest', () => {
    const onOpenChest = vi.fn()
    const { rerender } = render(<StreakGemCollection days={days} />)
    expect(screen.queryByTestId('explorer-chest-art')).toBeNull()
    fireEvent.click(screen.getByText('Older gems'))
    rerender(<StreakGemCollection days={[days[0]!]} />)
    expect(screen.getByText('Sep 1, 2026')).toBeTruthy()
    expect(screen.queryByText('Older gems')).toBeNull()
    rerender(<StreakGemCollection days={[]} onOpenChest={onOpenChest} />)
    expect(screen.getByText('Open today’s chest')).toBeTruthy()
    expect(screen.queryByTestId('collected-streak-gem')).toBeNull()
    expect(screen.getByTestId('explorer-chest-still')).toBeTruthy()
    expect(screen.queryByTestId('explorer-chest-opened')).toBeNull()
    expect(onOpenChest).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Open today’s chest' }))
    expect(onOpenChest).toHaveBeenCalledOnce()
  })

  it.each([false, true])('keeps paging controls focused and announcements immediate with reduced motion %s', async reduced => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const timing = vi.spyOn(Animated, 'timing').mockReturnValue({ start: vi.fn(), stop: vi.fn(), reset: vi.fn() })
    await withFullMotion(async () => {
      setAppReducedMotion(reduced)
      const view = render(<StreakGemCollection days={days} />)
      await act(async () => { await Promise.resolve() })
      timing.mockClear()
      const older = screen.getByRole('button', { name: 'Older gems' })
      const status = screen.getByRole('status')
      const batch = screen.getByTestId('streak-gem-page')
      older.focus()
      fireEvent.click(older)

      expect(document.activeElement).toBe(older)
      expect(screen.getByRole('status')).toBe(status)
      expect(status.textContent).toBe('Gems 8–14 of 16')
      expect(status.getAttribute('aria-live')).toBe('polite')
      expect(screen.getByText('Sep 9, 2026')).toBeTruthy()
      expect(batch.contains(older)).toBe(false)
      expect(batch.contains(status)).toBe(false)

      if (reduced) {
        expect(timing).not.toHaveBeenCalled()
        expect(batch.style.transform).toContain('translateY(0px)')
        expect(batch.style.transform).toContain('scale(1)')
      } else {
        expect(timing).toHaveBeenCalledOnce()
        expect(timing.mock.calls[0]?.[1]).toMatchObject({ duration: motion.quick.duration, useNativeDriver: true, isInteraction: false })
      }
      // A refreshed collection with the same page must not replay an old action.
      view.rerender(<StreakGemCollection days={[...days]} />)
      expect(timing).toHaveBeenCalledTimes(reduced ? 0 : 1)
      // Paging remains usable even while the previous entrance is in flight.
      fireEvent.click(older)
      expect(status.textContent).toBe('Gems 15–16 of 16')
      expect(screen.getAllByTestId('collected-streak-gem')).toHaveLength(2)
      expect(timing).toHaveBeenCalledTimes(reduced ? 0 : 2)
      view.unmount()
    })
  })
})
