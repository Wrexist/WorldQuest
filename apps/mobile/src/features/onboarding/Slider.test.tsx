/**
 * `Slider`'s accessibility surface, tested where there is a DOM to test it in.
 *
 * The primitive lives in `packages/design`, but that package's vitest runs `**\/*.test.ts`
 * against source and logic — no jsdom, no react-native-web alias — because everything in
 * it until now was token discipline and pure functions. `apps/mobile` is where a
 * component gets rendered, which is why `Art`, `Flag` and `CountryMap` are tested here
 * too.
 *
 * ## What this deliberately does not test
 *
 * The drag. jsdom lays nothing out, so the track measures zero wide and every position on
 * it is the same position; driving the PanResponder against that would assert that
 * arithmetic on zero returns zero. The gesture is exercised in `pnpm e2e`, which moves a
 * real pointer across a real layout and asserts the value followed it — see
 * "the difficulty slider answers to a drag".
 *
 * What IS reachable here is everything a screen reader receives, which is the half most
 * likely to be wrong and the half no screenshot would ever show.
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Slider } from '@worldquest/design'

const STOPS = [{ label: 'Just starting' }, { label: 'I know some' }, { label: 'Bring it on' }]

describe('Slider', () => {
  it('announces the value as its label, not as a number', () => {
    // "1 of 3" tells a listener nothing about what they picked. That is the whole reason
    // the component takes labelled stops rather than a count.
    render(<Slider stops={STOPS} value={1} onChange={vi.fn()} label="How well do you know the world?" />)
    const slider = screen.getByRole('slider')
    expect(slider.getAttribute('aria-valuetext')).toBe('I know some')
    expect(slider.getAttribute('aria-valuenow')).toBe('1')
    expect(slider.getAttribute('aria-valuemin')).toBe('0')
    expect(slider.getAttribute('aria-valuemax')).toBe('2')
  })

  it('is named, because an unnamed slider announces as "slider"', () => {
    render(<Slider stops={STOPS} value={0} onChange={vi.fn()} label="How well do you know the world?" />)
    expect(screen.getByRole('slider', { name: 'How well do you know the world?' })).toBeTruthy()
  })

  it('shows every stop, so the scale is readable before it is touched', () => {
    const { container } = render(<Slider stops={STOPS} value={0} onChange={vi.fn()} label="Level" />)
    for (const stop of STOPS) expect(container.textContent).toContain(stop.label)
  })

  it('keeps the legend out of the accessibility tree', () => {
    // The three labels were Pressables at first, so one could be tapped as well as
    // dragged to. That is three extra controls reporting a value the slider already
    // reports, and hiding them to avoid announcing it four times would have made them
    // controls nobody could reach. The track takes a tap at any position instead.
    render(<Slider stops={STOPS} value={0} onChange={vi.fn()} label="Level" />)
    expect(screen.queryByRole('button', { name: 'Bring it on' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Bring it on' })).toBeNull()
    // Exactly one control for one value.
    expect(screen.getAllByRole('slider')).toHaveLength(1)
  })

  it('does not fire onChange just by being rendered', () => {
    const onChange = vi.fn()
    render(<Slider stops={STOPS} value={2} onChange={onChange} label="Level" />)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('reports the ends correctly, so a reader knows when it can go no further', () => {
    const { rerender } = render(<Slider stops={STOPS} value={0} onChange={vi.fn()} label="Level" />)
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0')
    rerender(<Slider stops={STOPS} value={2} onChange={vi.fn()} label="Level" />)
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('2')
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('Bring it on')
  })

  /**
   * The keyboard, which is the web target's version of `accessibilityActions`.
   *
   * This is the one interaction jsdom CAN drive — a key press needs no layout, where the
   * drag needs a track with a width. It also covers the failure this control shipped
   * with: `clampTo`'s comment claimed to be "shared by the responder and the keyboard
   * path" while no keyboard path existed at all.
   */
  describe('keyboard', () => {
    it.each([
      ['ArrowRight', 1, 2],
      ['ArrowUp', 1, 2],
      ['ArrowLeft', 1, 0],
      ['ArrowDown', 1, 0],
    ])('moves one stop on %s', (key, from, expected) => {
      const onChange = vi.fn()
      render(<Slider stops={STOPS} value={from} onChange={onChange} label="Level" />)
      fireEvent.keyDown(screen.getByRole('slider'), { key })
      expect(onChange).toHaveBeenCalledWith(expected)
    })

    it('stops at the ends rather than wrapping round', () => {
      const onChange = vi.fn()
      const { rerender } = render(<Slider stops={STOPS} value={0} onChange={onChange} label="Level" />)
      fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' })
      expect(onChange).toHaveBeenCalledWith(0)

      rerender(<Slider stops={STOPS} value={2} onChange={onChange} label="Level" />)
      fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
      expect(onChange).toHaveBeenLastCalledWith(2)
    })

    it('ignores keys that are not arrows, so typing does not move the value', () => {
      const onChange = vi.fn()
      render(<Slider stops={STOPS} value={1} onChange={onChange} label="Level" />)
      for (const key of ['a', 'Enter', 'Tab', ' ']) {
        fireEvent.keyDown(screen.getByRole('slider'), { key })
      }
      expect(onChange).not.toHaveBeenCalled()
    })

    it('is reachable by Tab — a slider nobody can focus has no keyboard path at all', () => {
      render(<Slider stops={STOPS} value={1} onChange={vi.fn()} label="Level" />)
      expect(screen.getByRole('slider').getAttribute('tabindex')).toBe('0')
    })
  })
})
