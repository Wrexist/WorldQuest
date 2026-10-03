/**
 * The atlas inside a real lesson: a renderer that fails must cost the learner a picture,
 * never an answer, a heart or their progress.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { fakeGl } from '../../test/fakeGl.js'
import { LessonScreen } from '../lesson/LessonScreen.js'
import { __resetLessonAtlasFailure } from './LessonAtlas.js'
import { atlasEnabled } from './atlasAvailability.js'

vi.mock('../../lib/sync.js', () => ({ enqueueLesson: vi.fn(), flush: vi.fn() }))
vi.mock('../../lib/analytics.js', () => ({ track: vi.fn() }))
vi.mock('../home/useOptimisticProgress.js', () => ({ useOptimisticProgress: () => ({ shown: null }) }))

beforeEach(() => {
  __resetLessonAtlasFailure()
  ;(globalThis as { __wqFakeGl?: unknown }).__wqFakeGl = fakeGl({ failCompile: true })
})
afterEach(() => {
  cleanup()
  delete (globalThis as { __wqFakeGl?: unknown }).__wqFakeGl
})

/** Walk forward until a capital question with a map is on screen. */
async function toCapitalMap(): Promise<boolean> {
  for (let i = 0; i < 10; i++) {
    if (screen.queryByTestId('prompt-locator') !== null && /capital/i.test(screen.getByRole('heading').textContent ?? '')) return true
    const options = screen.queryAllByTestId('answer-option')
    if (options.length === 0) return false
    fireEvent.click(options[0]!)
    fireEvent.click(screen.getByTestId('lesson-check'))
    const next = screen.queryByRole('button', { name: 'Continue' })
    if (next === null) return false
    fireEvent.click(next)
  }
  return false
}

describe('the atlas in a lesson', () => {
  it('falls back to the flat map when the renderer fails, and the lesson still grades', async () => {
    render(<LessonScreen onExit={() => {}} focus={{ attributes: ['capital'], entities: ['ES', 'JP', 'SE', 'FR'] }} />)
    expect(await toCapitalMap()).toBe(true)
    await waitFor(() => expect(screen.getByTestId('atlas-fallback')).toBeTruthy())

    // Before grading the fallback names no capital either.
    expect(screen.queryByText(/^Capital: /)).toBeNull()
    const options = screen.getAllByTestId('answer-option')
    const order = options.map((o) => o.textContent)
    fireEvent.click(options[1]!)
    fireEvent.click(screen.getByTestId('lesson-check'))

    // Graded as ever: the sheet is up, the options kept their order, and the capital is
    // now shown as text — the fallback draws no pin it cannot place honestly.
    expect(screen.getByTestId('answer-sheet')).toBeTruthy()
    expect(screen.getAllByTestId('answer-option').map((o) => o.textContent)).toEqual(order)
    expect(screen.getByText(/^Capital: /)).toBeTruthy()
  })

  it('does not retry a failed renderer on every later question', async () => {
    render(<LessonScreen onExit={() => {}} focus={{ attributes: ['capital'], entities: ['ES', 'JP', 'SE', 'FR'] }} />)
    expect(await toCapitalMap()).toBe(true)
    await waitFor(() => expect(screen.getByTestId('atlas-fallback')).toBeTruthy())
    const compiles = ((globalThis as { __wqFakeGl?: { calls: Record<string, number> } }).__wqFakeGl!.calls['compileShader'] ?? 0)
    fireEvent.click(screen.getAllByTestId('answer-option')[0]!)
    fireEvent.click(screen.getByTestId('lesson-check'))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await toCapitalMap()).toBe(true)
    expect(screen.getByTestId('atlas-fallback')).toBeTruthy()
    expect((globalThis as { __wqFakeGl?: { calls: Record<string, number> } }).__wqFakeGl!.calls['compileShader'] ?? 0).toBe(compiles)
  })
})

describe('rollout', () => {
  it('uses the live atlas on supported platforms, with renderer failure covered above', () => {
    expect(atlasEnabled(false, 'ios', false)).toBe(true)
    expect(atlasEnabled(false, 'android', false)).toBe(true)
    expect(atlasEnabled(true, 'ios', false)).toBe(true) // remote flag
    expect(atlasEnabled(false, 'ios', true)).toBe(true) // development build
    expect(atlasEnabled(false, 'web', false)).toBe(true) // verified in Chromium
  })
})
