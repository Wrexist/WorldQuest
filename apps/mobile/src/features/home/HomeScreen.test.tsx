import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HomeScreen, type HomeProgress } from './HomeScreen.js'

const RETURNING: HomeProgress = {
  xpTotal: 4820,
  coins: 430,
  streak: 12,
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
}

describe('Home — the five states', () => {
  it('renders content', () => {
    render(
      <HomeScreen progress={RETURNING} loading={false} isOffline={false} onStartLesson={() => {}} />,
    )
    expect(screen.getByText('Europe II')).toBeTruthy()
    expect(screen.getByText('Gold I')).toBeTruthy()
  })

  it('never renders a placeholder dash where a value belongs', () => {
    // What this caught: Home shipped "New challenge in —" and "League —" for every
    // user on every day, because nothing produced either value. A dash is not an empty
    // state, it is a missing one, and on the screen users open daily it read as broken.
    //
    // The challenge card is gone (no producer — same defect the quests audit found one
    // card over) and the league tile says plainly that it is not open yet.
    const { container } = render(
      <HomeScreen progress={COLD} loading={false} isOffline={false} onStartLesson={() => {}} />,
    )
    expect(container.textContent).not.toMatch(/—/)
    expect(screen.getByText('Not open yet')).toBeTruthy()
  })

  it('shows a real league standing once there is one', () => {
    // The tile is not hardcoded to its closed state — it renders what it is given, so
    // wiring Leagues up later is data rather than a rewrite.
    render(
      <HomeScreen progress={RETURNING} loading={false} isOffline={false} onStartLesson={() => {}} />,
    )
    expect(screen.getByText('Top 15%')).toBeTruthy()
    expect(screen.queryByText('Not open yet')).toBeNull()
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
    // `textContent`, not `getByText`: the bar's label styles its digits apart from its
    // words, so the line is several nodes. What is asserted is what the user reads.
    const { container } = render(
      <HomeScreen
        progress={RETURNING}
        loading={false}
        isOffline={false}
        onStartLesson={() => {}}
        goal={{ done: 1, target: 3 }}
      />,
    )
    expect(container.textContent).toContain('1 of 3 lessons today')
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

describe('Home — your world', () => {
  const WORLD = {
    entitiesTotal: 65,
    entitiesComplete: 4,
    factsTotal: 259,
    factsLearned: 31,
    factsDue: 7,
  }

  const withWorld = (world = WORLD, onOpenWorld?: () => void) =>
    render(
      <HomeScreen
        progress={RETURNING}
        loading={false}
        isOffline={false}
        onStartLesson={() => {}}
        world={world}
        {...(onOpenWorld ? { onOpenWorld } : {})}
      />,
    )

  it('fills the half of the screen that had nothing real on it', () => {
    // Home had ONE real card. Everything under it was a stub or empty, so for a new
    // user the bottom 40% was void. This is the section that is true.
    const { container } = withWorld()
    // `textContent` for both: the world card's counts style their digits apart from
    // their words, so each line is several nodes.
    expect(container.textContent).toContain('4 of 65 countries')
    expect(container.textContent).toContain('31 of 259 facts')
  })

  it('surfaces what is due, which was previously two taps into Explore', () => {
    // The only time-sensitive number in a spaced-repetition app, and Home never said it.
    const { container } = withWorld()
    expect(container.textContent).toContain('7 facts ready to review')
  })

  it('says nothing at all when nothing is due', () => {
    // "0 facts ready to review" is a row that exists to say nothing, and a daily nudge
    // that fires on an empty inbox trains people to ignore it.
    const { container } = withWorld({ ...WORLD, factsDue: 0 })
    expect(container.textContent).not.toMatch(/ready to review/)
  })

  it('never frames the gap as a debt', () => {
    // A review queue is not a backlog and must never read as one — the same rule the
    // streak screen follows. "Overdue" is the word that turns study into homework.
    const { container } = withWorld()
    expect(container.textContent).not.toMatch(/overdue|behind|owe|catch up|late/i)
  })

  it('is absent rather than empty when the content index has not loaded', () => {
    const { container } = render(
      <HomeScreen progress={RETURNING} loading={false} isOffline={false} onStartLesson={() => {}} />,
    )
    expect(container.textContent).not.toMatch(/Your world/)
  })

  it('opens Explore rather than duplicating it', () => {
    const onOpenWorld = vi.fn()
    withWorld(WORLD, onOpenWorld)
    fireEvent.click(screen.getByRole('button', { name: 'Explore the world' }))
    expect(onOpenWorld).toHaveBeenCalledOnce()
  })

  it('renders no control when there is nowhere to go', () => {
    // Same rule as the shop row and the streak badge: absent hides the control rather
    // than drawing a dead one.
    withWorld()
    expect(screen.queryByRole('button', { name: 'Explore the world' })).toBeNull()
  })
})
