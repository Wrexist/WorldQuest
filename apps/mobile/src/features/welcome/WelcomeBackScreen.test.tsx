import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { WelcomeBackScreen, type WelcomeBackScreenProps } from './WelcomeBackScreen.js'

const props = (over: Partial<WelcomeBackScreenProps> = {}): WelcomeBackScreenProps => ({
  daysAway: 12,
  factsLearned: 47,
  countriesMet: 18,
  dueCount: 9,
  onStart: vi.fn(),
  onDismiss: vi.fn(),
  ...over,
})

describe('WelcomeBackScreen', () => {
  it('says the progress is still there, which is the fear the user arrives with', () => {
    render(<WelcomeBackScreen {...props()} />)
    expect(screen.getByText(/still here/i)).toBeTruthy()
    expect(screen.getByText(/47 facts learned/)).toBeTruthy()
    expect(screen.getByText(/18 countries/)).toBeTruthy()
  })

  it('is about us missing them, never about what they failed to do', () => {
    // No guilt. Not "you haven't practised in 12 days", not "your streak is at risk".
    const { container } = render(<WelcomeBackScreen {...props()} />)
    expect(screen.getByText(/world missed you/i)).toBeTruthy()
    expect(container.textContent).not.toMatch(
      /you haven'?t|you missed|you failed|at risk|don'?t lose|come back or/i,
    )
  })

  it('calls due facts ready for review, never overdue', () => {
    // A user who lived their life for two weeks has done nothing wrong, and a
    // scheduler is not a debt collector.
    const { container } = render(<WelcomeBackScreen {...props({ dueCount: 9 })} />)
    expect(screen.getByText(/9 facts are ready for review/i)).toBeTruthy()
    expect(container.textContent).not.toMatch(/overdue|late|behind|expired/i)
  })

  it('offers a way onward when nothing is due', () => {
    render(<WelcomeBackScreen {...props({ dueCount: 0 })} />)
    expect(screen.getByText(/Nothing is waiting/i)).toBeTruthy()
    expect(screen.getByText(/Start wherever you like/i)).toBeTruthy()
  })

  it('lets a user who is not ready to study leave without one', () => {
    // Trapping a returning user behind a lesson is how they become a former user.
    const onDismiss = vi.fn()
    render(<WelcomeBackScreen {...props({ onDismiss })} />)
    fireEvent.click(screen.getByRole('button', { name: /Just looking around/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('continues rather than restarting', () => {
    // A returning user has not lost their place, and the button must not imply it.
    const onStart = vi.fn()
    render(<WelcomeBackScreen {...props({ onStart })} />)
    const button = screen.getByRole('button', { name: /Pick up where you left off/i })
    fireEvent.click(button)
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('handles the singular day without reading like a template', () => {
    render(<WelcomeBackScreen {...props({ daysAway: 1 })} />)
    expect(screen.getByText(/It's been a day/)).toBeTruthy()
  })

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = render(<WelcomeBackScreen {...props()} />)
    expect(container.textContent).not.toMatch(/\bwelcome:[a-z]/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})
