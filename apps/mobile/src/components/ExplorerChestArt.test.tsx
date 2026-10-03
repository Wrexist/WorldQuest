import type { ContextType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { AccessibilityInfo, Animated, AppState, type AppStateStatus } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { motion, setAppReducedMotion } from '@worldquest/design'
import { withFullMotion } from '../test/setup.js'
import { ExplorerChestArt } from './ExplorerChestArt.js'

afterEach(() => { setAppReducedMotion(false); vi.restoreAllMocks() })

/** RN Web decodes an off-DOM Image, not the accessibility <img> it renders. */
function imageRequests() {
  const NativeImage = window.Image
  const requests: HTMLImageElement[] = []
  vi.spyOn(window, 'Image').mockImplementation(function () {
    const image = new NativeImage()
    image.decode = () => Promise.resolve()
    requests.push(image)
    return image
  })
  return {
    async finishFilm(view: ReturnType<typeof render>, error = false) {
      const uri = view.getByTestId('explorer-chest-film').querySelector('img')?.getAttribute('src')
      expect(uri).toBeTruthy()
      const image = [...requests].reverse().find(request => request.getAttribute('src') === uri && request.onload !== null)
      expect(image).toBeTruthy()
      await act(async () => {
        if (error) fireEvent.error(image!)
        else fireEvent.load(image!)
        await Promise.resolve()
      })
    },
  }
}

function controlledTimelines() {
  const timelines: { stop: ReturnType<typeof vi.fn>; finish: (finished?: boolean) => void }[] = []
  const timing = vi.spyOn(Animated, 'timing').mockImplementation(() => {
    let completion: ((result: { finished: boolean }) => void) | undefined
    const stop = vi.fn()
    timelines.push({ stop, finish: (finished = true) => completion?.({ finished }) })
    return { start: callback => { completion = callback }, stop, reset: vi.fn() }
  })
  return { timing, timelines }
}

describe('Explorer chest artwork lifecycle', () => {
  it('shows a static completed receipt once under reduced motion without waiting for film decode', () => {
    setAppReducedMotion(true)
    const reveal = vi.fn(), celebrate = vi.fn()
    const view = render(<ExplorerChestArt size={240} onReveal={reveal} onCelebrate={celebrate} />)
    expect(reveal).not.toHaveBeenCalled()
    expect(view.getByTestId('explorer-chest-still').style.opacity).toBe('1')
    expect(view.getByTestId('explorer-chest-opened').style.opacity).toBe('0')

    view.rerender(<ExplorerChestArt size={240} opened onReveal={reveal} onCelebrate={celebrate} />)
    expect(reveal).toHaveBeenCalledOnce()
    expect(celebrate).toHaveBeenCalledOnce()
    expect(view.queryByTestId('explorer-chest-film')).toBeNull()
    expect(view.getByTestId('explorer-chest-opened').style.opacity).toBe('1')
    expect(view.getByTestId('explorer-chest-still').style.opacity).toBe('0')

    view.rerender(<ExplorerChestArt size={240} opened onReveal={() => reveal()} onCelebrate={() => celebrate()} />)
    expect(reveal).toHaveBeenCalledOnce()
    expect(celebrate).toHaveBeenCalledOnce()
  })

  it('restores an opened chest without replaying its opening or celebration', () => {
    const reveal = vi.fn(), celebrate = vi.fn()
    const { timing } = controlledTimelines()
    const view = render(<ExplorerChestArt size={128} opened onReveal={reveal} onCelebrate={celebrate} />)
    expect(reveal).toHaveBeenCalledOnce()
    expect(celebrate).not.toHaveBeenCalled()
    expect(timing).not.toHaveBeenCalled()
    expect(view.queryByTestId('explorer-chest-film')).toBeNull()
  })

  it('waits for a cold film to decode and completes exactly once after the visual opening', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const decoder = imageRequests()
    const { timing, timelines } = controlledTimelines()
    const reveal = vi.fn(), celebrate = vi.fn()
    await withFullMotion(async () => {
      const view = render(<ExplorerChestArt size={240} onReveal={reveal} onCelebrate={celebrate} />)
      await act(async () => { await Promise.resolve() })
      view.rerender(<ExplorerChestArt size={240} opened onReveal={reveal} onCelebrate={celebrate} />)
      expect(timing).not.toHaveBeenCalled()
      expect(reveal).not.toHaveBeenCalled()
      expect(view.getByTestId('explorer-chest-still')).toBeTruthy()

      await decoder.finishFilm(view)
      expect(timing).toHaveBeenCalledOnce()
      expect(reveal).not.toHaveBeenCalled()
      act(() => timelines[0]!.finish())
      expect(reveal).toHaveBeenCalledOnce()
      expect(celebrate).toHaveBeenCalledOnce()
      expect(view.queryByTestId('explorer-chest-film')).toBeNull()
      expect(view.getByTestId('explorer-chest-opened').style.opacity).toBe('1')
      act(() => timelines[0]!.finish())
      expect(reveal).toHaveBeenCalledOnce()
    })
  })

  it('settles a failed opening on the high-resolution still without blocking its receipt', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const decoder = imageRequests()
    const { timing } = controlledTimelines()
    const reveal = vi.fn(), celebrate = vi.fn()
    await withFullMotion(async () => {
      const view = render(<ExplorerChestArt size={240} onReveal={reveal} onCelebrate={celebrate} />)
      await act(async () => { await Promise.resolve() })
      view.rerender(<ExplorerChestArt size={240} opened onReveal={reveal} onCelebrate={celebrate} />)
      await decoder.finishFilm(view, true)
      expect(reveal).toHaveBeenCalledOnce()
      expect(celebrate).toHaveBeenCalledOnce()
      expect(timing).not.toHaveBeenCalled()
      expect(view.queryByTestId('explorer-chest-film')).toBeNull()
      expect(view.getByTestId('explorer-chest-opened').style.opacity).toBe('1')
    })
  })

  it('keeps both sheet translations on one whole cell when native timing supplies fractional frames', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const decoder = imageRequests()
    const { timing } = controlledTimelines()
    await withFullMotion(async () => {
      const view = render(<ExplorerChestArt size={240} opened revealOnMount />)
      await act(async () => { await Promise.resolve() })
      await decoder.finishFilm(view)
      expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        duration: motion.celebrate.duration, useNativeDriver: true,
      }))
      const frame = timing.mock.calls[0]![0] as Animated.Value
      const film = view.getByTestId('explorer-chest-film')
      // iOS interpolates native timing samples, even with a stepped easing function.
      // Halfway across a row wrap must hold the old cell, never sweep through the sheet.
      for (const [value, x, y] of [
        [0.5, 0, 0],
        [7.5, -1680, 0],
        [7.999, -1680, 0],
        [8, 0, -240],
        [8.5, 0, -240],
        [15.5, -1680, -240],
        [16, 0, -480],
        [23.5, -1680, -480],
        [24, 0, -720],
        [31.5, -1680, -720],
        [32, 0, -960],
        [38.999, -1440, -960],
        [39, -1680, -960],
      ] as const) {
        act(() => frame.setValue(value))
        await vi.waitFor(() => {
          expect(film.style.transform).toBe(`translateX(${x}px) translateY(${y}px)`)
        })
      }
    })
  })

  it.each(['blur', 'background'] as const)('settles an opening waiting for decode on %s without reward cues', async cause => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const { timing } = controlledTimelines()
    const reveal = vi.fn(), celebrate = vi.fn()
    const blurListeners = new Set<() => void>()
    const stateListeners = new Set<(state: AppStateStatus) => void>()
    vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      stateListeners.add(callback)
      return { remove: () => { stateListeners.delete(callback) } }
    })
    const navigation = {
      isFocused: () => true,
      addListener: (event: string, callback: () => void) => {
        if (event === 'blur') blurListeners.add(callback)
        return () => { blurListeners.delete(callback) }
      },
    } as unknown as ContextType<typeof NavigationContext>

    await withFullMotion(async () => {
      const content = (opened: boolean) => <NavigationContext.Provider value={navigation}>
        <ExplorerChestArt size={240} opened={opened} onReveal={reveal} onCelebrate={celebrate} />
      </NavigationContext.Provider>
      const view = render(content(false))
      await act(async () => { await Promise.resolve() })
      view.rerender(content(true))
      expect(reveal).not.toHaveBeenCalled()
      act(() => {
        if (cause === 'blur') blurListeners.forEach(listener => listener())
        else stateListeners.forEach(listener => listener('background'))
      })
      expect(reveal).toHaveBeenCalledOnce()
      expect(celebrate).not.toHaveBeenCalled()
      expect(timing).not.toHaveBeenCalled()
      expect(view.queryByTestId('explorer-chest-film')).toBeNull()
      view.unmount()
      expect(blurListeners.size).toBe(0)
      expect(stateListeners.size).toBe(0)
    })
  })

  it('stops active motion when reduced motion is enabled and leaves nudge feedback static', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const { timing, timelines } = controlledTimelines()
    await withFullMotion(async () => {
      const view = render(<ExplorerChestArt size={128} nudge={0} />)
      await act(async () => { await Promise.resolve() })
      view.rerender(<ExplorerChestArt size={128} nudge={1} />)
      expect(timing).toHaveBeenCalledOnce()
      act(() => setAppReducedMotion(true))
      expect(timelines[0]!.stop).toHaveBeenCalled()
      view.rerender(<ExplorerChestArt size={128} nudge={2} />)
      expect(timing).toHaveBeenCalledOnce()
      expect(view.getByTestId('explorer-chest-still')).toBeTruthy()
    })
  })

  it('cancels an active opening on unmount and ignores a late completion callback', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const decoder = imageRequests()
    const { timelines } = controlledTimelines()
    const reveal = vi.fn(), celebrate = vi.fn()
    await withFullMotion(async () => {
      const view = render(<ExplorerChestArt size={240} onReveal={reveal} onCelebrate={celebrate} />)
      await act(async () => { await Promise.resolve() })
      view.rerender(<ExplorerChestArt size={240} opened onReveal={reveal} onCelebrate={celebrate} />)
      await decoder.finishFilm(view)
      expect(timelines).toHaveLength(1)
      view.unmount()
      expect(timelines[0]!.stop).toHaveBeenCalled()
      act(() => timelines[0]!.finish())
      expect(reveal).not.toHaveBeenCalled()
      expect(celebrate).not.toHaveBeenCalled()
    })
  })
})
