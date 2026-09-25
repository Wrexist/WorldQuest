import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { courseStanding, type CourseProgress } from '@worldquest/engines'
import { HomeScreen, type HomeProgress, type HomeScreenProps } from './HomeScreen.js'
import { loadCourse } from '../course/course.js'
import { toPathView } from '../course/pathView.js'

const RETURNING: HomeProgress = {
  xpTotal: 4820,
  coins: 430,
  streak: 12,
  questDone: 7,
  questTotal: 10,
  challengeIn: '14:22:18',
  friendsOnline: 12,
}

const COLD: HomeProgress = {
  xpTotal: 0,
  coins: 0,
  streak: 0,
}

const loaded = loadCourse()
if (!loaded.ok) throw new Error('the shipped course must parse')
const COURSE = loaded.course

/** The course section Home is handed by its route, at a given progress. */
const course = (progress: CourseProgress = {}, handlers: Partial<NonNullable<HomeScreenProps['course']>> = {}) => ({
  path: toPathView({ status: 'ready', course: COURSE, standing: courseStanding(COURSE, progress) }),
  onStart: vi.fn(),
  onPractise: vi.fn(),
  onReview: vi.fn(),
  onPractiseAnyway: vi.fn(),
  ...handlers,
})

const home = (props: Partial<HomeScreenProps> = {}) =>
  render(
    <HomeScreen progress={RETURNING} loading={false} isOffline={false} course={course()} {...props} />,
  )

describe('Home — the five states', () => {
  it('renders content: the facts about today, and the path', () => {
    home({ quest: { done: 2, total: 5, complete: false } })
    expect(screen.getByLabelText('Day streak, 12 days')).toBeTruthy()
    expect(screen.getByText('Wanderer')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Start step 1 of 7/ })).toBeTruthy()
    expect(screen.getByText('Five challenges at your own pace')).toBeTruthy()
  })

  it('never renders a placeholder dash where a value belongs', () => {
    // Home shipped "New challenge in —" and "League —" for every user on every day. The
    // fact row's quest tile counts a quest that does not exist until the content index
    // has built; rendering a dash there would be the same bug in the redesign's clothes.
    const { container } = home({ progress: COLD })
    expect(container.textContent).not.toMatch(/—/)
    expect(screen.queryByLabelText(/^Quests,/)).toBeNull()
  })

  it('counts the quest in the fact row once there is one', () => {
    home({ quest: { done: 2, total: 5, complete: false } })
    expect(screen.getByLabelText('Quests, 2 / 5')).toBeTruthy()
  })

  it('shows a skeleton, not a spinner, while loading — and no path to press yet', () => {
    const { container } = home({ progress: null, loading: true })
    expect(container.querySelector('[aria-label="Loading"]')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Start step/ })).toBeNull()
    expect(screen.queryByText('Five challenges at your own pace')).toBeNull()
  })

  it('opens a first launch on the first step of the course, with no streak at zero', () => {
    home({ progress: COLD, course: course({}) })
    // The empty state IS the course's first step: "a new user always sees a meaningful
    // next task" (L08), rather than an invitation with nothing behind it.
    expect(
      screen.getByRole('button', {
        name: 'Start step 1 of 7. Match 6 flags to their countries. Lesson 1 of 2.',
      }),
    ).toBeTruthy()
    // "0 day streak" is a worse first impression than none.
    expect(screen.queryByLabelText(/^Day streak,/)).toBeNull()
  })

  it('shows the course error card, which still leads to a lesson', () => {
    const onPractiseAnyway = vi.fn()
    home({ course: { ...course(), path: { status: 'error' }, onPractiseAnyway } })
    expect(screen.getByText("The course didn't load")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Practise now' }))
    expect(onPractiseAnyway).toHaveBeenCalledOnce()
  })

  it('announces offline as an alert, and says what still works', () => {
    home({ isOffline: true })
    const banner = screen.getByRole('alert')
    // "You're offline" alone reads as "stop trying".
    expect(banner.textContent).toContain('lessons still work')
  })

  it('has no offline banner when online', () => {
    home()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('Home — the path is the one primary action', () => {
  it('starts the current step', () => {
    const onStart = vi.fn()
    home({ course: course({}, { onStart }) })
    fireEvent.click(screen.getByRole('button', { name: /^Start step 1 of 7/ }))
    expect(onStart).toHaveBeenCalledWith('node.first-week.flags')
  })

  it('has no second primary: the quest offers a secondary button, and nothing says Continue', () => {
    const onPlayQuest = vi.fn()
    home({ quest: { done: 0, total: 5, complete: false }, onPlayQuest })
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Start quest' }))
    expect(onPlayQuest).toHaveBeenCalledOnce()
  })

  it('puts the path before the quest, so the step you are on is the first thing to press', () => {
    const { container } = home({ quest: { done: 0, total: 5, complete: false }, onPlayQuest: vi.fn() })
    const buttons = Array.from(container.querySelectorAll('[role="button"]')).map(
      (b) => b.getAttribute('aria-label') ?? b.textContent,
    )
    const step = buttons.findIndex((name) => name?.startsWith('Start step') === true)
    const quest = buttons.findIndex((name) => name === 'Start quest')
    expect(step).toBeGreaterThanOrEqual(0)
    expect(quest).toBeGreaterThan(step)
  })

  it('offers review once the course is walked', () => {
    const onReview = vi.fn()
    const all = Object.fromEntries(COURSE.units.flatMap((u) => u.nodes.map((n) => [n.id, n.lessons])))
    home({ course: course(all, { onReview }) })
    fireEvent.click(screen.getByRole('button', { name: 'Keep reviewing' }))
    expect(onReview).toHaveBeenCalledOnce()
  })

  it('renders every string through the catalogue', () => {
    // A raw key on screen means a missing entry. This catches the whole class at once.
    const { container } = home({ quest: { done: 1, total: 5, complete: false } })
    expect(container.textContent).not.toMatch(/\b[a-z]+:[a-z][a-zA-Z0-9.]+/)
  })

  it('leaves no unformatted ICU placeholder on screen', () => {
    const { container } = home({ quest: { done: 1, total: 5, complete: false } })
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })

  it('labels the streak for a screen reader with a full phrase', () => {
    home()
    expect(screen.getByLabelText('Day streak, 12 days')).toBeTruthy()
  })

  it('gives the avatar and the inbox real labels, not icon names', () => {
    home()
    expect(screen.getByLabelText('Your profile')).toBeTruthy()
    expect(screen.getByLabelText('Inbox')).toBeTruthy()
  })
})

describe('Home — today’s quest, secondary', () => {
  const withQuest = (
    quest: { done: number; total: number; complete: boolean },
    offerMore = true,
  ) => home({ quest, offerMore, onPlayQuest: vi.fn() })

  it('says how much of the quest is left, in tasks', () => {
    // `textContent`, not `getByText`: the bar's label styles its digits apart from its
    // words, so the line is several nodes. What is asserted is what the user reads.
    const { container } = withQuest({ done: 2, total: 5, complete: false })
    expect(container.textContent).toContain('2 of 5 done')
  })

  it('invites in the title and counts in the bar, rather than doing either twice', () => {
    const { container } = withQuest({ done: 0, total: 5, complete: false })
    expect(container.textContent).toContain('Five challenges at your own pace')
    expect(container.textContent).toContain('0 of 5 done')
  })

  it('says the day is discharged, and that more is optional', () => {
    const { container } = withQuest({ done: 5, total: 5, complete: true })
    expect(container.textContent).toContain('Your streak is safe')
    expect(screen.getByRole('button', { name: 'Practise anyway' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start quest' })).toBeNull()
  })

  it('offers nothing further to somebody who has already hit their own goal', () => {
    withQuest({ done: 5, total: 5, complete: true }, false)
    expect(screen.queryByRole('button', { name: 'Practise anyway' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start quest' })).toBeNull()
  })

  it('never frames an unfinished quest as failure', () => {
    const { container } = withQuest({ done: 0, total: 5, complete: false })
    expect(container.textContent).not.toMatch(/behind|missed|failed|you haven'?t|at risk|only/i)
  })

  it('shows the bar at zero rather than hiding it', () => {
    const { container } = withQuest({ done: 0, total: 5, complete: false })
    expect(container.querySelector('[data-testid="home-quest"] [role="progressbar"]')).toBeTruthy()
  })

  it('says nothing about a quest when there is none yet', () => {
    const { container } = home()
    expect(container.textContent).not.toMatch(/of 5 done/)
    expect(screen.queryByTestId('home-quest')).toBeNull()
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
    home({ world, ...(onOpenWorld ? { onOpenWorld } : {}) })

  it('shows how much of the world is covered', () => {
    const { container } = withWorld()
    expect(container.textContent).toContain('4 of 65 countries')
    expect(container.textContent).toContain('31 of 259 facts')
  })

  it('surfaces what is due, which was previously two taps into Explore', () => {
    const { container } = withWorld()
    expect(container.textContent).toContain('7 facts ready to review')
  })

  it('says nothing at all when nothing is due', () => {
    const { container } = withWorld({ ...WORLD, factsDue: 0 })
    expect(container.textContent).not.toMatch(/ready to review/)
  })

  it('never frames the gap as a debt', () => {
    const { container } = withWorld()
    expect(container.textContent).not.toMatch(/overdue|behind|owe|catch up|late/i)
  })

  it('is absent rather than empty when the content index has not loaded', () => {
    const { container } = home()
    expect(container.textContent).not.toMatch(/Your world/)
  })

  it('opens Explore rather than duplicating it', () => {
    const onOpenWorld = vi.fn()
    withWorld(WORLD, onOpenWorld)
    fireEvent.click(screen.getByRole('button', { name: 'Explore the world' }))
    expect(onOpenWorld).toHaveBeenCalledOnce()
  })

  it('renders no control when there is nowhere to go', () => {
    withWorld()
    expect(screen.queryByRole('button', { name: 'Explore the world' })).toBeNull()
  })
})
