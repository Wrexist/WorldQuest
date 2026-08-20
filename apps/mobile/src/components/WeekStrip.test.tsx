/**
 * The week strip, now that two screens draw it.
 *
 * It had no test while it was a local function inside `ProfileScreen` — the screen's own
 * tests covered whether a week rendered, not what the bars said. That was survivable with
 * one caller. With two it is not: the whole reason this was extracted rather than copied
 * is that two implementations of "which days did I learn on" can come to disagree about
 * one fact, and a shared component with no test is that risk with an extra import.
 *
 * The three things worth pinning are the ones a reader would get wrong from the numbers:
 * heights are relative to the user's own best day, a day with any activity is never
 * invisible, and a day with none is drawn rather than skipped.
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeekStrip } from './WeekStrip.js'

const week = (...counts: readonly number[]) =>
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => ({ day, count: counts[i] ?? 0 }))

/** The filled bar inside each day — the only node with a percentage height. */
const bars = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('*'))
    .map((node) => (node as HTMLElement).style.height)
    .filter((height) => height.endsWith('%'))

describe('WeekStrip', () => {
  it('scales heights to the best day of the week, not to a goal', () => {
    // A chart scaled to a target makes a five-lesson day look like a failure next to a
    // ten-lesson one. Scaled to the week, it shows the shape of the week — the only thing
    // seven bars can honestly say.
    const { container } = render(<WeekStrip week={week(5, 10)} />)
    expect(bars(container).slice(0, 2)).toEqual(['50%', '100%'])
  })

  it('never renders a day with activity as an invisible sliver', () => {
    // 1 against 12 rounds to 8 %, which reads as "you did nothing" — the opposite of the
    // truth, on the screen least able to afford saying it.
    const { container } = render(<WeekStrip week={week(1, 12)} />)
    expect(bars(container)[0]).toBe('12%')
  })

  it('draws a day with no activity as an empty channel, not as nothing', () => {
    // Seven slots, always. A chart of "days with activity" that hides the days without
    // any flatters the user by lying about the shape of their week — and the first
    // version of this drew a single green rectangle beside six invisible columns.
    const { container } = render(<WeekStrip week={week(0, 4, 0)} />)
    expect(bars(container)).toEqual(['0%', '100%', '0%', '0%', '0%', '0%', '0%'])
  })

  it('keys seven days by position, not by a name that repeats', () => {
    // `weekday: 'narrow'` is M T W T F S S in English — two Ts and two Ss. Keying a
    // seven-item list on that gave React duplicate keys, which is undefined behaviour:
    // it may reuse the wrong node across a re-render, so a bar animates into the wrong
    // column. The bug was inherited from the version of this that lived inside
    // `ProfileScreen`, and nothing saw it until this file rendered the strip on its own.
    const warnings: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      warnings.push(String(args[0]))
    })
    render(<WeekStrip week={week(1, 2, 3, 4, 5, 6, 7)} />)
    spy.mockRestore()
    expect(warnings.filter((w) => /same key/.test(w))).toEqual([])
  })

  it('names every day for a screen reader, including the empty ones', () => {
    render(<WeekStrip week={week(0, 3)} />)
    expect(screen.getAllByLabelText(/lesson/i)).toHaveLength(7)
  })

  it('shows the empty label instead of a flat week, when given one', () => {
    // Profile says "Nothing this week yet". The streak screen passes nothing, because the
    // heading above it already reads "No days yet" and a second sentence saying the same
    // thing is the third statement of one nothing.
    const { container } = render(<WeekStrip week={week()} emptyLabel="Nothing this week yet" />)
    expect(screen.getByText('Nothing this week yet')).toBeDefined()
    expect(bars(container)).toHaveLength(0)
  })

  it('renders nothing at all for a flat week with no label', () => {
    const { container } = render(<WeekStrip week={week()} />)
    expect(container.textContent).toBe('')
  })
})
