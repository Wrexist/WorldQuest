import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, within } from '@testing-library/react'
import { AccessibilityInfo, Animated, Text } from 'react-native'
import { TabBar, setAppReducedMotion } from '@worldquest/design'
import { withFullMotion } from '../test/setup.js'

afterEach(() => { setAppReducedMotion(false); vi.restoreAllMocks() })

const items = ['Home', 'Explore', 'Quests', 'Profile', 'Shop'].map(label => ({
  key: label, label, icon: () => <Text aria-hidden>Icon</Text>,
}))

function Navigation({ onSelect }: { onSelect: (key: string) => void }) {
  const [selected, select] = useState('Home')
  return <TabBar items={items} activeKey={selected} onSelect={key => { onSelect(key); select(key) }} />
}

describe('Tab selection motion', () => {
  it('restores the selected chip without an entrance animation', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const timing = vi.spyOn(Animated, 'timing')
    const sequence = vi.spyOn(Animated, 'sequence')
    await withFullMotion(async () => {
      const view = render(<TabBar items={items} activeKey="Quests" onSelect={vi.fn()} />)
      await act(async () => { await Promise.resolve() })
      for (const item of items) {
        const tab = view.getByRole('tab', { name: item.label })
        expect(tab.getAttribute('aria-selected')).toBe(String(item.key === 'Quests'))
        expect(within(tab).getByTestId('tab-chip').style.opacity).toBe(item.key === 'Quests' ? '1' : '0')
      }
      expect(timing).not.toHaveBeenCalled()
      expect(sequence).not.toHaveBeenCalled()
      view.unmount()
    })
  })

  it('navigates immediately while chips crossfade and only the new selection pops', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const start = vi.fn(), stop = vi.fn()
    const sequence = vi.spyOn(Animated, 'sequence').mockReturnValue({ start, stop, reset: vi.fn() })
    // Leave motion pending so navigation is proven independent of its completion.
    const fades: { target: number; stop: ReturnType<typeof vi.fn> }[] = []
    const timing = vi.spyOn(Animated, 'timing').mockImplementation((_value, config) => {
      const animationStop = vi.fn()
      return {
        start: vi.fn(() => { fades.push({ target: config.toValue as number, stop: animationStop }) }),
        stop: animationStop,
        reset: vi.fn(),
      }
    })
    const onSelect = vi.fn()
    await withFullMotion(async () => {
      const view = render(<Navigation onSelect={onSelect} />)
      await act(async () => { await Promise.resolve() })
      expect(sequence).not.toHaveBeenCalled()
      expect(timing).not.toHaveBeenCalled()

      fireEvent.click(view.getByRole('tab', { name: 'Explore' }))
      expect(onSelect).toHaveBeenLastCalledWith('Explore')
      expect(view.getByRole('tab', { name: 'Explore' }).getAttribute('aria-selected')).toBe('true')
      expect(sequence).toHaveBeenCalledOnce()
      expect(start).toHaveBeenCalledOnce()
      expect(fades.map(fade => fade.target)).toEqual([0, 1])
      expect(within(view.getByRole('tab', { name: 'Home' })).getByTestId('tab-chip').style.opacity).toBe('1')
      expect(within(view.getByRole('tab', { name: 'Explore' })).getByTestId('tab-chip').style.opacity).toBe('0')
      for (const [, config] of timing.mock.calls) {
        expect(config).toMatchObject({ useNativeDriver: true, isInteraction: false })
      }

      // Reselecting still dispatches navigation (scroll-to-top uses it), without replaying motion.
      fireEvent.click(view.getByRole('tab', { name: 'Explore' }))
      expect(onSelect).toHaveBeenCalledTimes(2)
      expect(sequence).toHaveBeenCalledOnce()
      expect(fades).toHaveLength(2)

      // A rapid next selection cancels the incoming fade and settles the old icon.
      fireEvent.click(view.getByRole('tab', { name: 'Quests' }))
      expect(view.getByRole('tab', { name: 'Explore' }).getAttribute('aria-selected')).toBe('false')
      expect(sequence).toHaveBeenCalledTimes(2)
      expect(fades[1]?.stop).toHaveBeenCalledOnce()
      expect(fades.map(fade => fade.target)).toEqual([0, 1, 0, 1])
      expect(stop).toHaveBeenCalled()
      view.unmount()
      expect(fades.every(fade => fade.stop.mock.calls.length > 0)).toBe(true)
    })
  })

  it('keeps reduced-motion navigation immediate and does not replay when motion is re-enabled', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const sequence = vi.spyOn(Animated, 'sequence')
    const timing = vi.spyOn(Animated, 'timing')
    const onSelect = vi.fn()
    await withFullMotion(async () => {
      setAppReducedMotion(true)
      const view = render(<Navigation onSelect={onSelect} />)
      await act(async () => { await Promise.resolve() })
      fireEvent.click(view.getByRole('tab', { name: 'Shop' }))
      expect(onSelect).toHaveBeenLastCalledWith('Shop')
      expect(view.getByRole('tab', { name: 'Shop' }).getAttribute('aria-selected')).toBe('true')
      expect(within(view.getByRole('tab', { name: 'Shop' })).getByTestId('tab-chip').style.opacity).toBe('1')
      expect(within(view.getByRole('tab', { name: 'Home' })).getByTestId('tab-chip').style.opacity).toBe('0')
      expect(sequence).not.toHaveBeenCalled()
      expect(timing).not.toHaveBeenCalled()
      act(() => setAppReducedMotion(false))
      expect(sequence).not.toHaveBeenCalled()
      expect(timing).not.toHaveBeenCalled()
      view.unmount()
    })
  })
})
