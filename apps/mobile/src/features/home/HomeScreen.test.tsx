import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HomeScreen, type HomeProgress } from './HomeScreen.js'

const RETURNING: HomeProgress = {
  xpTotal: 4820,
  coins: 430,
  streak: 12,
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
    // The card names the QUEST now, not whichever task came next. `questTitle` was a
    // prop nothing ever passed, so this used to assert a fixture value that only ever
    // appeared in this file.
    expect(screen.getByText('Five things, about ten minutes')).toBeTruthy()
    // The three facts under the greeting: streak, rank, and today's quest. The rank is
    // the earned TITLE and not a league position — leagues are v2.0, and the tile that
    // used to claim one is gone with the rest of the unbuilt furniture.
    expect(screen.getByLabelText('Day streak, 12 days')).toBeTruthy()
    expect(screen.getByText('Wanderer')).toBeTruthy()
  })

  it('never renders a placeholder dash where a value belongs', () => {
    // What this caught: Home shipped "New challenge in —" and "League —" for every
    // user on every day, because nothing produced either value. A dash is not an empty
    // state, it is a missing one, and on the screen users open daily it read as broken.
    //
    // Both cards are gone now rather than defended: the challenge had no producer, and
    // the Friends and League tiles were two unbuilt features occupying half the cards a
    // new user sees. What is left has to keep the rule, and the fact row is where it
    // could break next — its quest tile counts a quest that does not exist until the
    // content index has built, and rendering a dash there would be the same bug wearing
    // the redesign's clothes. It renders nothing instead.
    const { container } = render(
      <HomeScreen progress={COLD} loading={false} isOffline={false} onStartLesson={() => {}} />,
    )
    expect(container.textContent).not.toMatch(/—/)
    expect(screen.queryByLabelText(/^Quests,/)).toBeNull()
  })

  it('counts the quest in the fact row once there is one', () => {
    render(
      <HomeScreen
        progress={RETURNING}
        loading={false}
        isOffline={false}
        onStartLesson={() => {}}
        quest={{ done: 2, total: 5, complete: false }}
      />,
    )
    expect(screen.getByLabelText('Quests, 2 / 5')).toBeTruthy()
  })

  it('shows a skeleton, not a spinner, while loading', () => {
    // A spinner on primary content means a layout shift when the data lands. The
    // skeleton is the same shape as the content it replaces.
    const { container } = render(
      <HomeScreen progress={null} loading isOffline={false} onStartLesson={() => {}} />,
    )
    expect(screen.queryByText('Five things, about ten minutes')).toBeNull()
    expect(container.querySelector('[aria-label="Loading"]')).toBeTruthy()
  })

  it('shows the empty state on a first launch rather than zeros everywhere', () => {
    render(<HomeScreen progress={COLD} loading={false} isOffline={false} onStartLesson={() => {}} />)
    // A first launch keeps the warmer line. It is genuinely a different moment from a
    // Tuesday — and the one the whole funnel turns on — so "Five things, about ten
    // minutes", which is right for somebody who already knows what the quest is, is the
    // wrong first sentence in the product.
    expect(screen.getByText('Start your first lesson')).toBeTruthy()
    // No streak at zero: "0 day streak" is a worse first impression than none. The rule
    // outlived the control it was written for — it was a badge in the header and is now
    // a tile in the fact row — which is exactly why it is asserted on the LABEL rather
    // than on any one component.
    expect(screen.queryByLabelText(/^Day streak,/)).toBeNull()
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
    // sentence rather than a number — and it names the QUANTITY as well as the unit,
    // because the tile's own words are split across two lines that a reader would
    // otherwise announce as fragments.
    expect(screen.getByLabelText('Day streak, 12 days')).toBeTruthy()
  })

  it('gives the avatar and the inbox real labels, not icon names', () => {
    render(
      <HomeScreen progress={RETURNING} loading={false} isOffline={false} onStartLesson={() => {}} />,
    )
    expect(screen.getByLabelText('Your profile')).toBeTruthy()
    expect(screen.getByLabelText('Inbox')).toBeTruthy()
  })
})

describe('Home — today’s quest', () => {
  const withQuest = (
    quest: { done: number; total: number; complete: boolean },
    offerMore = true,
  ) =>
    render(
      <HomeScreen
        progress={RETURNING}
        loading={false}
        isOffline={false}
        onStartLesson={() => {}}
        quest={quest}
        offerMore={offerMore}
      />,
    )

  it('says how much of the quest is left, in tasks', () => {
    // Tasks, not lessons and not facts. "Five things, about ten minutes" is the promise
    // the Quests tab makes, and this card used to count a different quantity — lessons
    // against a target derived from the user's measured pace, which MOVED when the pace
    // estimate did. One card, one number.
    //
    // `textContent`, not `getByText`: the bar's label styles its digits apart from its
    // words, so the line is several nodes. What is asserted is what the user reads.
    const { container } = withQuest({ done: 2, total: 5, complete: false })
    expect(container.textContent).toContain('2 of 5 done')
  })

  it('invites in the title and counts in the bar, rather than doing either twice', () => {
    // Three lines, three jobs: the label says what this is ("Today's Quest"), the title
    // says what to do, the bar says how far. The first attempt made the title "Today's
    // quest" as well, which printed the card's own name twice six pixels apart — the
    // defect this repo has now fixed on four separate cards.
    const { container } = withQuest({ done: 0, total: 5, complete: false })
    expect(container.textContent).toContain('Five things, about ten minutes')
    expect(container.textContent).toContain('0 of 5 done')
  })

  it('says the day is discharged, and that more is optional', () => {
    // The finish has to mean something. A primary green CONTINUE still shouting at
    // somebody who has finished would make finishing meaningless — so the copy says the
    // streak is safe and what is left is a secondary offer.
    const { container } = withQuest({ done: 5, total: 5, complete: true })
    expect(container.textContent).toContain('Your streak is safe')
    expect(screen.getByRole('button', { name: 'Practise anyway' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  })

  it('offers nothing further to somebody who has already hit their own goal', () => {
    // The one job the daily-goal setting still has. Five minutes a day, quest finished,
    // goal met — handing that person another button turns a completed day back into an
    // unfinished one, which is the exact thing this card was rebuilt to stop.
    withQuest({ done: 5, total: 5, complete: true }, false)
    expect(screen.queryByRole('button', { name: 'Practise anyway' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  })

  it('never frames an unfinished quest as failure', () => {
    // The rule from quests-and-liveops.md §1: a missed quest is never mentioned again,
    // and an unfinished one is not a reprimand.
    const { container } = withQuest({ done: 0, total: 5, complete: false })
    expect(container.textContent).not.toMatch(/behind|missed|failed|you haven'?t|at risk|only/i)
  })

  it('shows the bar at zero rather than hiding it', () => {
    // An empty bar says "there is a shape to fill", and the user it scaffolds for is
    // exactly the one on their first launch. This was gated on `!isNewUser`, which hid
    // it from the only person who needed it.
    const { container } = withQuest({ done: 0, total: 5, complete: false })
    expect(container.querySelector('[role="progressbar"]')).toBeTruthy()
  })

  it('says nothing about a quest when there is none yet', () => {
    const { container } = render(
      <HomeScreen progress={RETURNING} loading={false} isOffline={false} onStartLesson={() => {}} />,
    )
    expect(container.textContent).not.toMatch(/of 5 done/)
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
