import type { ContextType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { AccessibilityInfo, Animated, AppState, type AppStateStatus } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { motion, setAppReducedMotion } from '@worldquest/design'
import { withFullMotion } from '../test/setup.js'
import { SceneEntrance } from './SceneEntrance.js'
import { AtlasCompanion } from './AtlasCompanion.js'

afterEach(() => { vi.useRealTimers(); setAppReducedMotion(false); vi.restoreAllMocks() })

describe('companion interactions and arrival motion', () => {
  it('keeps controls usable immediately and offers a still laugh under reduced motion', () => {
    setAppReducedMotion(true)
    const view = render(<AtlasCompanion compact message="Pick a country to explore." />)
    expect(view.getByText('Pick a country to explore.')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: 'Atlas, your guide. Tap for a giggle.' }))
    expect(view.getByTestId('mascot-pose-laughing')).toBeTruthy()
    expect(view.queryByTestId('mascot-film')).toBeNull()
  })

  it('cancels a delayed entrance on blur and removes its listeners on unmount', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const timing = vi.spyOn(Animated, 'timing').mockReturnValue({ start: vi.fn(), stop: vi.fn(), reset: vi.fn() })
    const callbacks = new Map<string, () => void>()
    const remove = vi.fn()
    const navigation = {
      isFocused: () => true,
      addListener: (event: string, callback: () => void) => { callbacks.set(event, callback); return remove },
    } as unknown as ContextType<typeof NavigationContext>
    await withFullMotion(async () => {
      const view = render(<NavigationContext.Provider value={navigation}>
        <SceneEntrance delay={motion.quick.duration}><button>Explore</button></SceneEntrance>
      </NavigationContext.Provider>)
      await act(async () => { await Promise.resolve() })
      vi.useFakeTimers()
      act(() => callbacks.get('focus')?.())
      act(() => callbacks.get('blur')?.())
      act(() => vi.advanceTimersByTime(motion.celebrate.duration))
      expect(timing).not.toHaveBeenCalled()
      expect(view.getByRole('button', { name: 'Explore' }).getAttribute('disabled')).toBeNull()
      remove.mockClear()
      view.unmount()
      expect(remove).toHaveBeenCalledTimes(2)
    })
  })

  it('lands an in-flight entrance when reduced motion is enabled', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const stop = vi.fn()
    const timing = vi.spyOn(Animated, 'timing').mockReturnValue({ start: vi.fn(), stop, reset: vi.fn() })
    await withFullMotion(async () => {
      const view = render(<SceneEntrance><button>Continue</button></SceneEntrance>)
      await waitFor(() => expect(timing).toHaveBeenCalled())
      act(() => setAppReducedMotion(true))
      expect(stop).toHaveBeenCalled()
      expect(view.getByTestId('scene-entrance').style.transform).toContain('translateY(0px)')
      expect(view.getByTestId('scene-entrance').style.transform).toContain('scale(1)')
    })
  })

  it('only replays identity arrivals for new content, keeping focused controls mounted', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const stop = vi.fn()
    const timing = vi.spyOn(Animated, 'timing').mockReturnValue({ start: vi.fn(), stop, reset: vi.fn() })
    const callbacks = new Map<string, () => void>()
    let focused = true
    const navigation = {
      isFocused: () => focused,
      addListener: (event: string, callback: () => void) => { callbacks.set(event, callback); return () => callbacks.delete(event) },
    } as unknown as ContextType<typeof NavigationContext>
    const remove = vi.fn()
    let appState: (state: AppStateStatus) => void = () => {}
    vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      appState = callback
      return { remove }
    })
    const onPress = vi.fn()
    const scene = (id: string) => <NavigationContext.Provider value={navigation}>
      <SceneEntrance replayKey={id}><button onClick={onPress}>Answer</button></SceneEntrance>
    </NavigationContext.Provider>
    await withFullMotion(async () => {
      const view = render(scene('first'))
      await act(async () => { await Promise.resolve() })
      timing.mockClear()
      view.rerender(scene('second'))
      expect(timing).toHaveBeenCalledTimes(1)
      expect(timing.mock.calls[0]?.[1]).toMatchObject({ duration: motion.quick.duration, useNativeDriver: true, isInteraction: false })
      const answer = view.getByRole('button', { name: 'Answer' })
      answer.focus()
      fireEvent.click(answer)
      expect(onPress).toHaveBeenCalledOnce()
      view.rerender(scene('second'))
      expect(timing).toHaveBeenCalledTimes(1)

      act(() => callbacks.get('blur')?.())
      expect(stop).toHaveBeenCalled()
      act(() => callbacks.get('focus')?.())
      act(() => { setAppReducedMotion(true) })
      act(() => { setAppReducedMotion(false) })
      expect(timing).toHaveBeenCalledTimes(1)
      expect(document.activeElement).toBe(answer)
      expect(view.getByTestId('scene-entrance').style.transform).toContain('translateY(0px)')

      view.rerender(scene('third'))
      expect(timing).toHaveBeenCalledTimes(2)
      act(() => appState('background'))
      expect(view.getByTestId('scene-entrance').style.transform).toContain('scale(1)')
      act(() => appState('active'))
      expect(timing).toHaveBeenCalledTimes(2)

      focused = false
      view.rerender(scene('offscreen'))
      focused = true
      act(() => callbacks.get('focus')?.())
      expect(timing).toHaveBeenCalledTimes(2)
      remove.mockClear()
      view.unmount()
      expect(remove).toHaveBeenCalledOnce()
      expect(callbacks.size).toBe(0)
    })
  })
})
