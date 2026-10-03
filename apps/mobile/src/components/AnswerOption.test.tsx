/**
 * `AnswerOption`, rendered — the half of it that a source-reading test cannot see.
 *
 * It lives here rather than in `packages/design` because that package has no renderer:
 * its own suite reads token files and component SOURCE. What broke on a device was the
 * DOM — where the correct/wrong mark sits relative to the artwork — so the test has to
 * be somewhere React Native for web actually runs.
 */

import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { AppState, type AppStateStatus } from 'react-native'
import { AnswerOption } from '@worldquest/design'

const FLAG = <img src="flags/SE.png" alt="" data-testid="art" />

/** The card itself — the row that lays the badge, the answer and the mark out. */
const card = (container: HTMLElement): HTMLElement =>
  container.querySelector('[role="button"]') as HTMLElement
const face = (container: HTMLElement): HTMLElement => card(container).firstElementChild as HTMLElement

describe('AnswerOption with a picture for an answer', () => {
  it('does not move the artwork when the mark appears', () => {
    // The bug, exactly: the mark was a sibling in the card's row, so answering added a
    // fifth box to a row whose artwork is CENTRED in what is left. The flag shifted
    // sideways at the moment the user was looking at it, and the answered cell sat
    // visibly off-axis from the three that were not.
    //
    // Asserted as "the row has the same number of children before and after", which is
    // the layout property that caused it — jsdom computes no geometry, so a test that
    // read positions here would be reading zeroes and passing on anything.
    const idle = render(
      <AnswerOption label="Sweden" art={FLAG} badge="A" state="idle" onPress={() => {}} />,
    )
    const before = face(idle.container).childElementCount

    const answered = render(
      <AnswerOption
        label="Sweden"
        art={FLAG}
        badge="A"
        state="correct"
        mark={<span data-testid="mark">✓</span>}
        onPress={() => {}}
      />,
    )
    expect(face(answered.container).childElementCount).toBe(before)
  })

  it('puts the mark inside the artwork rather than beside it', () => {
    const { getByTestId } = render(
      <AnswerOption
        label="Sweden"
        art={FLAG}
        state="correct"
        mark={<span data-testid="mark">✓</span>}
        onPress={() => {}}
      />,
    )
    // The frame that wraps the flag is the mark's ancestor. That is what makes it land
    // on the picture's corner instead of the cell's, whatever size the caller drew the
    // flag at.
    const frame = getByTestId('art').parentElement!
    expect(frame.contains(getByTestId('mark'))).toBe(true)
  })

  it('still draws the mark in the row when the answer is words', () => {
    // A text option has a `flex: 1` label, so a mark at the end takes its space from the
    // label and nothing moves. The overlay is for pictures only — over a country name it
    // would be a tick floating on top of the word.
    const { getByTestId, container } = render(
      <AnswerOption
        label="Sweden"
        state="correct"
        mark={<span data-testid="mark">✓</span>}
        onPress={() => {}}
      />,
    )
    expect(getByTestId('mark').closest('[role="button"]')).toBe(card(container))
    expect(container.querySelector('[data-testid="art"]')).toBeNull()
  })

  it('shows the mark on a render with no effects at all', () => {
    // The entrance animates from nothing, and `pnpm design:shots` renders statically —
    // effects never run there. Seeded at its target, the tick is present anyway; seeded
    // at zero, every screenshot of a graded question would show no tick and nobody would
    // know whether that was the harness or the app.
    const { getByTestId } = render(
      <AnswerOption
        label="Sweden"
        state="correct"
        mark={<span data-testid="mark">✓</span>}
        onPress={() => {}}
      />,
    )
    expect(getByTestId('mark')).toBeTruthy()
  })
})

describe('AnswerOption press feedback', () => {
  it('keeps the target still and activates immediately through repeated keyboard presses', () => {
    const onPress = vi.fn()
    const { container } = render(<AnswerOption label="Sweden" onPress={onPress} />)
    const target = card(container)
    target.focus()
    for (let press = 0; press < 2; press++) {
      fireEvent.keyDown(target, { key: ' ' })
      expect(target.style.transform).toBe('')
      // Reduced motion still acknowledges the press, while the face stays at rest.
      expect(getComputedStyle(face(container)).opacity).toBe('0.7')
      expect(face(container).style.transform).toBe('scale(1)')
      fireEvent.keyUp(target, { key: ' ' })
      // The native HTML button receives a browser click after keyboard activation.
      fireEvent.click(target)
      expect(onPress).toHaveBeenCalledTimes(press + 1)
      expect(getComputedStyle(face(container)).opacity).not.toBe('0.7')
    }
  })

  it('preserves the picture-grid width and disables a matched answer without another action', () => {
    const onPress = vi.fn()
    const { container, rerender } = render(<AnswerOption label="Sweden" art={FLAG} style={{ width: '48%' }} onPress={onPress} />)
    expect(card(container).style.width).toBe('48%')
    expect(face(container).style.width).toBe('')
    rerender(<AnswerOption label="Sweden, matched" state="correct" art={FLAG} style={{ width: '48%' }} onPress={onPress} />)
    fireEvent.click(card(container))
    expect(onPress).not.toHaveBeenCalled()
    expect(card(container).getAttribute('aria-disabled')).toBe('true')
    expect(face(container).style.transform).toBe('scale(1)')
  })

  it('releases a held press when the app backgrounds without a pointer release', () => {
    const listeners = new Set<(state: AppStateStatus) => void>()
    const subscription = vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      listeners.add(callback)
      return { remove: () => { listeners.delete(callback) } }
    })
    try {
      const onPress = vi.fn()
      const view = render(<AnswerOption label="Sweden" onPress={onPress} />)
      const target = card(view.container)
      target.focus()
      fireEvent.keyDown(target, { key: ' ' })
      expect(getComputedStyle(face(view.container)).opacity).toBe('0.7')
      act(() => { [...listeners].forEach(listener => listener('background')) })
      expect(getComputedStyle(face(view.container)).opacity).not.toBe('0.7')
      expect(face(view.container).style.transform).toBe('scale(1)')
      act(() => { [...listeners].forEach(listener => listener('active')) })
      expect(getComputedStyle(face(view.container)).opacity).not.toBe('0.7')
      expect(onPress).not.toHaveBeenCalled()
      view.unmount()
      expect(listeners.size).toBe(0)
    } finally {
      subscription.mockRestore()
    }
  })
})
