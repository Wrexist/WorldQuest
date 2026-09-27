import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccessibilityInfo, Animated, AppState, type AppStateStatus } from 'react-native'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import { setAppReducedMotion, useReducedMotion } from '@worldquest/design'
import { AtlasCharacter, type AtlasMood } from './AtlasCharacter.js'
import { withFullMotion } from '../test/setup.js'
import { usePreferences, initializeMotionPreference } from '../features/settings/usePreferences.js'
import { writeJson } from '../lib/storage.js'

afterEach(() => { setAppReducedMotion(false); vi.restoreAllMocks() })

describe('Atlas and motion preferences', () => {
  it('stops its movement when the app backgrounds', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    let changed: ((state: AppStateStatus) => void) | undefined
    const remove = vi.fn()
    const start = vi.fn(), stop = vi.fn()
    vi.spyOn(Animated, 'parallel').mockReturnValue({ start, stop, reset: vi.fn() })
    vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      changed = callback
      return { remove }
    })
    await withFullMotion(async () => {
      const view = render(<AtlasCharacter size={160} />)
      await waitFor(() => expect(start).toHaveBeenCalled())
      const starts = start.mock.calls.length
      view.rerender(<AtlasCharacter size={200} />)
      await act(async () => { await Promise.resolve() })
      expect(start.mock.calls.length).toBe(starts)
      stop.mockClear()
      act(() => changed?.('background'))
      expect(stop).toHaveBeenCalled()
      expect(view.getByTestId('mascot-body')).toBeTruthy()
      view.unmount()
      expect(remove).toHaveBeenCalled()
    })
  })

  it.each<AtlasMood>(['welcome', 'celebrate', 'thinking', 'resting', 'encouraging'])('keeps the complete %s character visible and decorative with motion reduced', async mood => {
    setAppReducedMotion(true)
    const view = render(<AtlasCharacter size={140} mood={mood} />)
    expect(view.getByTestId('mascot-body').style.width).toBe('140px')
    expect(view.getByTestId('mascot-body').style.height).toBe('140px')
    const images = view.container.querySelectorAll('img')
    expect(images.length).toBeGreaterThanOrEqual(8)
    for (const image of Array.from(images)) {
      expect(image.getAttribute('src')).toContain('world-mascot/')
      expect(image.getAttribute('alt')).toBe('')
    }
    expect(view.getByTestId('world-mascot').getAttribute('aria-hidden')).toBe('true')
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



