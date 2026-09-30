import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccessibilityInfo, Animated, AppState } from 'react-native'
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react'
import { setAppReducedMotion, useReducedMotion } from '@worldquest/design'
import { AtlasCharacter, type AtlasMood } from './AtlasCharacter.js'
import { withFullMotion } from '../test/setup.js'
import { usePreferences, initializeMotionPreference } from '../features/settings/usePreferences.js'
import { writeJson } from '../lib/storage.js'

afterEach(() => { setAppReducedMotion(false); vi.restoreAllMocks() })

describe('Atlas and motion preferences', () => {
  it('holds the film at rest until its sheet has decoded, and cleans up after itself', async () => {
    // jsdom never finishes loading an image (react-native-web reports onLoad from its own
    // loader), so this proves the half a test can reach: nothing plays against an image
    // that is not there yet, and every listener goes when he does. The playing half is
    // the device pass's, as for the treasure chest.
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const remove = vi.fn()
    const start = vi.fn(), stop = vi.fn()
    vi.spyOn(Animated, 'timing').mockReturnValue({ start, stop, reset: vi.fn() })
    vi.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove }))
    await withFullMotion(async () => {
      const view = render(<AtlasCharacter size={160} />)
      await act(async () => { await Promise.resolve() })
      expect(view.getByTestId('mascot-film')).toBeTruthy()
      expect(start).not.toHaveBeenCalled()
      view.unmount()
      expect(remove).toHaveBeenCalled()
    })
  })

  it.each<AtlasMood>(['welcome', 'celebrate', 'thinking', 'resting', 'encouraging', 'laughing', 'surprised', 'proud', 'sleepy', 'wink'])(
    'shows the complete %s still, decorative, with motion reduced', mood => {
      setAppReducedMotion(true)
      const view = render(<AtlasCharacter size={140} mood={mood} />)
      const still = view.getByTestId('mascot-still')
      const image = still.querySelector('img') ?? still
      expect(image.getAttribute('src')).toContain(`atlas-globe/${mood}`)
      expect(view.queryByTestId('mascot-film')).toBeNull()
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




describe('Booping Atlas', () => {
  it('is a named button only where a screen opts in, and laughs when tapped', async () => {
    const { WorldMascot } = await import('./WorldMascot.js')
    const decorative = render(<WorldMascot style={{ width: 120, height: 120 }} />)
    expect(decorative.queryByRole('button')).toBeNull()
    decorative.unmount()

    // Reduced motion, where the laughing still is HELD for a moment (jsdom would finish
    // the film in a frame and end the laugh before it could be seen).
    setAppReducedMotion(true)
    const view = render(<WorldMascot style={{ width: 120, height: 120 }} onBoopLabel="Atlas, your guide. Tap for a giggle." />)
    const button = view.getByRole('button', { name: 'Atlas, your guide. Tap for a giggle.' })
    expect(view.getByTestId('mascot-pose-welcome')).toBeTruthy()
    act(() => { fireEvent.click(button) })
    expect(view.getByTestId('mascot-pose-laughing')).toBeTruthy()
  })
})
