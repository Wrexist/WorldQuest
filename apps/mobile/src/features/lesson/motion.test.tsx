/**
 * The branch 435 tests never took.
 *
 * jsdom has no `matchMedia`, and react-native-web answers `isReduceMotionEnabled()` with
 * `true` when it cannot query one — so every component test in this suite has always run
 * the reduced-motion path. `src/test/setup.ts` documents that and argues, correctly, that
 * it is the right default to have landed on by accident.
 *
 * What it did not do is enter the other branch at all. Not assert on it — enter it. A
 * component whose animated path threw on first render, referenced a hook conditionally,
 * or divided by an undefined duration would have passed the entire suite, because nothing
 * had ever mounted it that way.
 *
 * These do exactly that much and no more. They mount the screens that move, with motion
 * on, and assert the content is still there. jsdom finishes `Animated.timing` in one
 * frame, so this cannot tell you an animation looked right, and claiming otherwise would
 * be the "a function was called" test the setup file warns about twice. Whether it looks
 * right is the device pass (docs/plan/device-pass.md).
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { withFullMotion } from '../../test/setup.js'
import { LessonScreen } from './LessonScreen.js'
import { LessonSummary } from './LessonSummary.js'

vi.mock('../../lib/sync.js', () => ({ enqueueLesson: vi.fn(), flush: vi.fn() }))
vi.mock('../../lib/analytics.js', () => ({ track: vi.fn() }))

describe('the animated branch mounts', () => {
  it('is genuinely a different branch — the default is still reduced motion', () => {
    // Without this the three tests below could be passing because nothing changed, which
    // is the guard-that-cannot-fail shape this repo has been bitten by repeatedly.
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true)
    withFullMotion(() => {
      expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false)
    })
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true)
  })

  it('renders the lesson with motion on', () => {
    withFullMotion(() => {
      render(<LessonScreen onExit={() => {}} />)
      expect(screen.getAllByTestId('answer-option').length).toBeGreaterThanOrEqual(4)
    })
  })

  it('renders the summary — the screen with the XP tally on it — with motion on', () => {
    // The tally is the one thing in this app that counts up, so it is the component with
    // the most to get wrong on the animated path.
    withFullMotion(() => {
      const { container } = render(
        <LessonSummary
          result={{
            lessonId: 'l1',
            items: 10,
            correct: 9,
            accuracy: 0.9,
            xpAwarded: 124,
            coinsAwarded: 50,
            reviews: [],
            updatedMemory: new Map(),
            masteryChanges: [],
            perfect: false,
            rejected: 0,
          }}
          wasAbandoned={false}
          isOffline={false}
          onExit={() => {}}
        />,
      )
      expect(container.textContent).toContain('124')
    })
  })
})
