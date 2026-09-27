import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Animated } from 'react-native'
import { ProgressSparkles } from './ProgressSparkles.js'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('@worldquest/design', async importOriginal => ({
  ...await importOriginal<typeof import('@worldquest/design')>(),
  useReducedMotion: () => preference.reduced,
}))
afterEach(() => { vi.restoreAllMocks(); preference.reduced = false })

describe('earned-progress feedback', () => {
  it('celebrates an increase but never an existing reward, rerender, or daily reset', () => {
    const timing = vi.spyOn(Animated, 'timing')
    const view = render(<ProgressSparkles earned={3} />)
    expect(timing).not.toHaveBeenCalled()
    view.rerender(<ProgressSparkles earned={3} />)
    expect(timing).not.toHaveBeenCalled()
    view.rerender(<ProgressSparkles earned={4} />)
    expect(timing).toHaveBeenCalledTimes(1)
    view.rerender(<ProgressSparkles earned={0} />)
    expect(timing).toHaveBeenCalledTimes(1)
  })

  it('honors reduced motion without replaying the reward when motion returns', () => {
    preference.reduced = true
    const timing = vi.spyOn(Animated, 'timing')
    const view = render(<ProgressSparkles earned={0} />)
    view.rerender(<ProgressSparkles earned={1} />)
    expect(timing).not.toHaveBeenCalled()
    preference.reduced = false
    view.rerender(<ProgressSparkles earned={1} />)
    expect(timing).not.toHaveBeenCalled()
    view.rerender(<ProgressSparkles earned={2} />)
    expect(timing).toHaveBeenCalledTimes(1)
  })
})
