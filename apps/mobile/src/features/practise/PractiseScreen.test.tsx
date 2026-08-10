import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { PractiseScreen } from './PractiseScreen.js'
import { useContent } from '../../lib/content.js'

/**
 * The real shipped index, not a fixture.
 *
 * This screen's whole job is to report how much content a choice leaves, so a fixture
 * would test the fixture's arithmetic. Composed from the same packs the app ships, which
 * is also what makes the "Currencies · Oceania is small" assertion below meaningful.
 */
const realIndex = () => renderHook(() => useContent()).result.current.index!.index

const mount = (onStart = vi.fn()) => {
  render(<PractiseScreen index={realIndex()} onStart={onStart} />)
  return onStart
}

const chooseIn = (group: string, option: string) => {
  // Radios carry their label as the accessible name, and several groups share option
  // names ("Everything" appears twice), so the group is found first and searched within.
  const heading = screen.getAllByRole('heading', { name: group })[0]!
  const row = heading.parentElement!
  const radio = Array.from(row.querySelectorAll('[role="radio"]')).find(
    (el) => el.getAttribute('aria-label') === option,
  )
  expect(radio, `no "${option}" option under "${group}"`).toBeTruthy()
  fireEvent.click(radio!)
}

describe('Practise — nothing is compulsory', () => {
  it('opens with every choice unset, so Start means the usual lesson', () => {
    // The property that keeps this screen from being a tax on the people who wanted the
    // default. If it opened with a topic pre-selected, tapping Start would silently give
    // a narrower lesson than the one Home gives.
    const onStart = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Start practising' }))

    expect(onStart).toHaveBeenCalledOnce()
    expect(onStart.mock.calls[0]![0]).toEqual({ focus: {}, length: undefined })
  })

  it('sends only the dimensions that were narrowed', () => {
    const onStart = mount()
    chooseIn('Topic', 'Capitals')
    fireEvent.click(screen.getByRole('button', { name: 'Start practising' }))

    const { focus, length } = onStart.mock.calls[0]![0]
    expect(focus.attributes).toEqual(['capital'])
    // Untouched controls contribute nothing rather than an "all" sentinel the engine
    // would then have to understand.
    expect(focus.entities).toBeUndefined()
    expect(focus.difficulty).toBeUndefined()
    expect(length).toBeUndefined()
  })

  it('turns a continent into entity ids, because the engine cannot', () => {
    // `packages/engines` does not know what a continent is and must not learn. This
    // screen holds the index, so it answers WHICH countries rather than asking the
    // engine HOW to find them.
    const onStart = mount()
    chooseIn('Where', 'Europe')
    fireEvent.click(screen.getByRole('button', { name: 'Start practising' }))

    const { focus } = onStart.mock.calls[0]![0]
    expect(focus.entities.length).toBeGreaterThan(1)
    expect(focus.entities).toContain('SE')
    expect(focus.entities).not.toContain('JP')
  })

  it('passes a chosen length through as a number', () => {
    const onStart = mount()
    chooseIn('How many', '5')
    fireEvent.click(screen.getByRole('button', { name: 'Start practising' }))

    expect(onStart.mock.calls[0]![0].length).toBe(5)
  })

  it('passes a difficulty band', () => {
    const onStart = mount()
    chooseIn('Difficulty', 'Easier')
    fireEvent.click(screen.getByRole('button', { name: 'Start practising' }))

    expect(onStart.mock.calls[0]![0].focus.difficulty).toEqual({ min: 1, max: 2 })
  })
})

describe('Practise — it says what the choice leaves', () => {
  it('counts the content behind the current choice', () => {
    const { container } = render(<PractiseScreen index={realIndex()} onStart={() => {}} />)
    expect(container.textContent).toMatch(/\d+ questions to draw from/)
  })

  it('the count falls when the choice narrows', () => {
    // The whole point of showing it. A picker that reports the same number however you
    // narrow is a picker that is not reading its own filter.
    const { container } = render(<PractiseScreen index={realIndex()} onStart={() => {}} />)
    const before = Number(container.textContent!.match(/(\d+) questions/)![1])

    chooseIn('Topic', 'Capitals')
    const after = Number(container.textContent!.match(/(\d+) questions/)![1])

    expect(after).toBeLessThan(before)
    expect(after).toBeGreaterThan(0)
  })

  it('refuses to start a lesson with nothing in it, and says how to fix it', () => {
    // Antarctica ships in `REGIONS` and has no countries in the pack, which is the same
    // decision Explore's grid makes: a list that hides a continent until we have written
    // it reads as a smaller world. So this combination is reachable, and it must not
    // hand the user an empty lesson.
    render(<PractiseScreen index={realIndex()} onStart={() => {}} />)
    chooseIn('Where', 'Antarctica')

    expect(screen.getByText(/Try widening one of the choices/)).toBeTruthy()
    const start = screen.getByRole('button', { name: 'Start practising' })
    expect(start.getAttribute('aria-disabled')).toBe('true')
  })
})

describe('Practise — copy', () => {
  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = render(<PractiseScreen index={realIndex()} onStart={() => {}} />)
    expect(container.textContent).not.toMatch(/\b[a-z]+:[a-z][a-zA-Z0-9.]+/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})
