import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CHILD_AGE, OnboardingScreen } from './OnboardingScreen.js'

/** 2026 keeps the arithmetic obvious; the component never reads a clock itself. */
const YEAR = 2026

const advanceToAgeStep = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
}

/**
 * One tap, on the year itself.
 *
 * This used to be two — a decade chip, then a year chip — because a grid cannot show a
 * hundred options and the step was built out of chips. It is a wheel now (see
 * `WheelPicker`), and every row of a wheel is a real radio precisely so that this stays
 * a click rather than a simulated fling: jsdom has no momentum, so
 * `onMomentumScrollEnd` never fires here and a test that drove the gesture would be
 * testing nothing at all.
 */
const pickYear = (year: number): void => {
  fireEvent.click(screen.getByRole('radio', { name: String(year) }))
}

describe('OnboardingScreen', () => {
  it('opens on the value slides, not on a sign-up wall', () => {
    // The conversion decision the whole flow is built around: teach first, ask later.
    render(<OnboardingScreen currentYear={YEAR} onFinish={vi.fn()} />)
    expect(screen.getByText(/five minutes a day/i)).toBeTruthy()
    expect(screen.queryByText(/sign up|create account/i)).toBeNull()
  })

  it('lets a user skip the carousel rather than trapping them in it', () => {
    render(<OnboardingScreen currentYear={YEAR} onFinish={vi.fn()} />)
    advanceToAgeStep()
    expect(screen.getByText(/When were you born/i)).toBeTruthy()
  })

  it('asks for a birth year and never asks whether the user is over 13', () => {
    // A yes/no gate teaches a ten-year-old that lying gets them in. It is useless as
    // compliance and a bad first thing to teach a child.
    const { container } = render(<OnboardingScreen currentYear={YEAR} onFinish={vi.fn()} />)
    advanceToAgeStep()
    expect(container.textContent).not.toMatch(/over 13|13\+|are you over/i)
  })

  it('cannot continue past the age gate without an answer', () => {
    render(<OnboardingScreen currentYear={YEAR} onFinish={vi.fn()} />)
    advanceToAgeStep()
    const next = screen.getByRole('button', { name: 'Continue' })
    expect(next.getAttribute('aria-disabled')).toBe('true')
  })

  it('explains the child experience as something we do for them', () => {
    const { container } = render(<OnboardingScreen currentYear={YEAR} onFinish={vi.fn()} />)
    advanceToAgeStep()
    pickYear(YEAR - (CHILD_AGE - 3)) // comfortably a child
    expect(screen.getByText(/keep things simple/i)).toBeTruthy()
    // No shame words, no "not allowed", no "restricted".
    expect(container.textContent).not.toMatch(/not allowed|restricted|too young/i)
  })

  it('does not offer sign-in to a child', () => {
    // There is no account for them to already have, and offering one offers a flow
    // we would have to refuse.
    render(<OnboardingScreen currentYear={YEAR} onFinish={vi.fn()} onSignIn={vi.fn()} />)
    advanceToAgeStep()
    pickYear(YEAR - (CHILD_AGE - 3))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // → goal
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // → taster
    expect(screen.queryByRole('button', { name: /already have an account/i })).toBeNull()
  })

  it('offers sign-in to an adult', () => {
    render(<OnboardingScreen currentYear={YEAR} onFinish={vi.fn()} onSignIn={vi.fn()} />)
    advanceToAgeStep()
    pickYear(YEAR - 30)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('button', { name: /already have an account/i })).toBeTruthy()
  })

  it('reports the birth year, the child flag and the goal exactly once', () => {
    const onFinish = vi.fn()
    render(<OnboardingScreen currentYear={YEAR} onFinish={onFinish} />)
    advanceToAgeStep()
    pickYear(YEAR - 30)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('radio', { name: '20 min' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: /Start learning/i }))

    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(onFinish).toHaveBeenCalledWith({
      birthYear: YEAR - 30,
      isChild: false,
      dailyGoalMinutes: 20,
    })
  })

  it('defaults the goal rather than demanding a choice', () => {
    // A required choice this early is a wall. Ten minutes is the documented default.
    const onFinish = vi.fn()
    render(<OnboardingScreen currentYear={YEAR} onFinish={onFinish} />)
    advanceToAgeStep()
    pickYear(YEAR - 30)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: /Start learning/i }))
    expect(onFinish.mock.calls[0]![0].dailyGoalMinutes).toBe(10)
  })

  it('reaches every year in one gesture, with no second step in the way', () => {
    // The chip grid needed a decade before it would show a year, because twenty-one
    // buttons was already more than a 320 pt screen could hold — and at 320 the oldest
    // two decades rendered behind the Continue button anyway. A wheel has no such
    // ceiling: every row exists from the moment the step opens.
    render(<OnboardingScreen currentYear={YEAR} onFinish={vi.fn()} />)
    advanceToAgeStep()
    for (const year of [YEAR, 1996, 1985, YEAR - 100]) {
      expect(screen.getByRole('radio', { name: String(year) })).toBeTruthy()
    }
  })

  it('pre-selects no year, because that would nudge the one answer that must not be', () => {
    // The birth year decides whether a child gets the child experience. A wheel always
    // shows SOMETHING, so the row it opens on is an explicit empty one rather than a
    // plausible year the user never chose.
    render(<OnboardingScreen currentYear={YEAR} onFinish={vi.fn()} />)
    advanceToAgeStep()
    expect(screen.getByRole('radio', { name: 'Choose a year' }).getAttribute('aria-checked')).toBe(
      'true',
    )
    for (const year of [YEAR, 1996, 1985]) {
      expect(screen.getByRole('radio', { name: String(year) }).getAttribute('aria-checked')).toBe(
        'false',
      )
    }
  })

  it('never offers a year in the future', () => {
    render(<OnboardingScreen currentYear={YEAR} onFinish={vi.fn()} />)
    advanceToAgeStep()
    expect(screen.getByRole('radio', { name: String(YEAR) })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: String(YEAR + 1) })).toBeNull()
  })

  it('reaches back far enough for a real person to answer honestly', () => {
    // A picker that cannot express a user's age is a picker that makes them lie. The
    // oldest verified people alive are past 115.
    render(<OnboardingScreen currentYear={YEAR} onFinish={vi.fn()} />)
    advanceToAgeStep()
    expect(screen.getByRole('radio', { name: String(YEAR - 100) })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: String(YEAR - 101) })).toBeNull()
  })

  it('lets the answer be taken back without stranding Continue on a stale year', () => {
    // The chip version had to drop a chosen year when the decade changed underneath it,
    // or Continue stayed enabled carrying a year the user could no longer see. The
    // wheel cannot get into that state — but returning to the empty row must still
    // disable Continue, which is the same invariant from the other side.
    render(<OnboardingScreen currentYear={YEAR} onFinish={vi.fn()} />)
    advanceToAgeStep()
    pickYear(1996)
    // Absent, not "false" — an enabled control simply carries no aria-disabled.
    expect(screen.getByRole('button', { name: 'Continue' }).getAttribute('aria-disabled')).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: 'Choose a year' }))
    expect(screen.getByRole('button', { name: 'Continue' }).getAttribute('aria-disabled')).toBe(
      'true',
    )
  })

  it('names the wheel, so it does not announce as "radiogroup"', () => {
    render(<OnboardingScreen currentYear={YEAR} onFinish={vi.fn()} />)
    advanceToAgeStep()
    expect(screen.getByRole('radiogroup', { name: 'Year' })).toBeTruthy()
  })

  it('keeps every slide reachable by swipe as well as by tap', () => {
    // The carousel used to advance only on a tap: three slides, page dots underneath,
    // and no gesture at all. All three pages are mounted in the pager, which is what
    // makes a swipe possible — and is why this asserts on presence rather than on
    // visibility, since jsdom has no viewport to be outside of.
    render(<OnboardingScreen currentYear={YEAR} onFinish={vi.fn()} />)
    expect(screen.getByText(/five minutes a day/i)).toBeTruthy()
    expect(screen.getByText(/Remembers what you forget/i)).toBeTruthy()
    expect(screen.getByText(/Collect the whole world/i)).toBeTruthy()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = render(<OnboardingScreen currentYear={YEAR} onFinish={vi.fn()} />)
    expect(container.textContent).not.toMatch(/\bonboarding:[a-z]/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})
