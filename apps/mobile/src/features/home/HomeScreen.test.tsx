import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HomeScreen, type HomeProgress } from './HomeScreen.js'

const RETURNING: HomeProgress = {
  xpTotal: 4820,
  coins: 430,
  streak: 12,
  factsMastered: 7,
  factsTotal: 10,
  questTitle: 'Europe II',
  questDone: 7,
  questTotal: 10,
  challengeIn: '14:22:18',
  friendsOnline: 12,
  leagueTier: 'Gold I',
  leaguePercentile: 'Top 15%',
}

const COLD: HomeProgress = {
  xpTotal: 0,
  coins: 0,
  streak: 0,
  factsMastered: 0,
  factsTotal: 10,
}

describe('Home — the five states', () => {
  it('renders content', () => {
    render(
      <HomeScreen progress={RETURNING} loading={false} isOffline={false} onStartLesson={() => {}} />,
    )
    expect(screen.getByText('Europe II')).toBeTruthy()
    expect(screen.getByText('Gold I')).toBeTruthy()
    expect(screen.getByText('14:22:18')).toBeTruthy()
  })

  it('shows a skeleton, not a spinner, while loading', () => {
    // A spinner on primary content means a layout shift when the data lands. The
    // skeleton is the same shape as the content it replaces.
    const { container } = render(
      <HomeScreen progress={null} loading isOffline={false} onStartLesson={() => {}} />,
    )
    expect(screen.queryByText('Europe II')).toBeNull()
    expect(container.querySelector('[aria-label="Loading"]')).toBeTruthy()
  })

  it('shows the empty state on a first launch rather than zeros everywhere', () => {
    render(<HomeScreen progress={COLD} loading={false} isOffline={false} onStartLesson={() => {}} />)
    expect(screen.getByText('Start your first lesson')).toBeTruthy()
    // No streak badge at zero: "0 day streak" is a worse first impression than none.
    expect(screen.queryByText('Day streak')).toBeNull()
  })

  it('announces offline as an alert, and says what still works', () => {
    render(<HomeScreen progress={RETURNING} loading={false} isOffline onStartLesson={() => {}} />)
    const banner = screen.getByRole('alert')
    // The copy has to state what the user CAN still do. "You're offline" alone reads
    // as "stop trying".
    expect(banner.textContent).toContain('lessons still work')
  })

  it('has no offline banner when online', () => {
    render(
      <HomeScreen progress={RETURNING} loading={false} isOffline={false} onStartLesson={() => {}} />,
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('Home — behaviour', () => {
  it('starts a lesson from the primary action', () => {
    const onStartLesson = vi.fn()
    render(
      <HomeScreen progress={RETURNING} loading={false} isOffline={false} onStartLesson={onStartLesson} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onStartLesson).toHaveBeenCalledOnce()
  })

  it('renders every string through the catalogue', () => {
    // A raw key on screen means a missing entry. This catches the whole class in one
    // assertion rather than one test per label.
    const { container } = render(
      <HomeScreen progress={RETURNING} loading={false} isOffline={false} onStartLesson={() => {}} />,
    )
    expect(container.textContent).not.toMatch(/\b[a-z]+:[a-z][a-zA-Z0-9.]+/)
  })

  it('leaves no unformatted ICU placeholder on screen', () => {
    // The bug we shipped once: a missing param renders the literal text `{count}`.
    const { container } = render(
      <HomeScreen progress={RETURNING} loading={false} isOffline={false} onStartLesson={() => {}} />,
    )
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })

  it('labels the streak for a screen reader with a full phrase', () => {
    render(
      <HomeScreen progress={RETURNING} loading={false} isOffline={false} onStartLesson={() => {}} />,
    )
    // "12" alone tells a screen-reader user nothing. The label is spoken, so it is a
    // sentence rather than a number.
    expect(screen.getByLabelText('12 day streak')).toBeTruthy()
  })

  it('gives the avatar and the inbox real labels, not icon names', () => {
    render(
      <HomeScreen progress={RETURNING} loading={false} isOffline={false} onStartLesson={() => {}} />,
    )
    expect(screen.getByLabelText('Your profile')).toBeTruthy()
    expect(screen.getByLabelText('Inbox')).toBeTruthy()
  })
})

describe('Home — the daily goal', () => {
  it('shows the goal in lessons, the unit the user experiences', () => {
    render(
      <HomeScreen
        progress={RETURNING}
        loading={false}
        isOffline={false}
        onStartLesson={() => {}}
        goal={{ done: 1, target: 3 }}
      />,
    )
    expect(screen.getByText('1 of 3 lessons today')).toBeTruthy()
  })

  it('congratulates on reaching it without telling the user to stop', () => {
    // Passing the goal is a good thing, not an end. Nothing here may read as
    // "you're done, go away".
    const { container } = render(
      <HomeScreen
        progress={RETURNING}
        loading={false}
        isOffline={false}
        onStartLesson={() => {}}
        goal={{ done: 3, target: 3 }}
      />,
    )
    expect(screen.getByText(/goal met/i)).toBeTruthy()
    expect(container.textContent).not.toMatch(/come back tomorrow|that'?s enough|stop now|finished for today/i)
  })

  it('never frames an unmet goal as failure', () => {
    const { container } = render(
      <HomeScreen
        progress={RETURNING}
        loading={false}
        isOffline={false}
        onStartLesson={() => {}}
        goal={{ done: 0, target: 3 }}
      />,
    )
    expect(container.textContent).not.toMatch(/behind|missed|failed|you haven'?t|at risk/i)
  })

  it('says nothing when there is no goal to show', () => {
    const { container } = render(
      <HomeScreen progress={RETURNING} loading={false} isOffline={false} onStartLesson={() => {}} />,
    )
    expect(container.textContent).not.toMatch(/lessons today/)
  })
})
