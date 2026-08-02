import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CHILD_AGE, OnboardingScreen } from './OnboardingScreen.js'

/** 2026 keeps the arithmetic obvious; the component never reads a clock itself. */
const YEAR = 2026

const advanceToAgeStep = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
}

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

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = render(<OnboardingScreen currentYear={YEAR} onFinish={vi.fn()} />)
    expect(container.textContent).not.toMatch(/\bonboarding:[a-z]/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})
