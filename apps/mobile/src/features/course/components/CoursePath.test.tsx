import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BALANCE, courseStanding, type CourseProgress } from '@worldquest/engines'
import { loadCourse } from '../course.js'
import { toPathView } from '../pathView.js'
import { CoursePath } from './CoursePath.js'

const loaded = loadCourse()
if (!loaded.ok) throw new Error('the shipped course must parse')
const COURSE = loaded.course

/** Steps in the whole course: every label counts against it ("Step 3 of 33"). */
const TOTAL = COURSE.units.reduce((n, u) => n + u.nodes.length, 0)

const ALL_DONE: CourseProgress = Object.fromEntries(
  COURSE.units.flatMap((u) => u.nodes.map((n) => [n.id, n.lessons])),
)

function renderPath(progress: CourseProgress = {}) {
  const handlers = {
    onStart: vi.fn(),
    onPractise: vi.fn(),
    onReview: vi.fn(),
    onPractiseAnyway: vi.fn(),
  }
  const path = toPathView({ status: 'ready', course: COURSE, standing: courseStanding(COURSE, progress) })
  const view = render(<CoursePath path={path} {...handlers} />)
  return { ...handlers, ...view }
}

/** Every step's button, in document order — which is the order a reader walks them. */
const steps = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-testid^="path-node-"]')).map((el) => el.getAttribute('aria-label'))

describe('the course path', () => {
  it('shows zero completed unit segments before any lesson is finished', () => {
    const { container } = renderPath()
    const segments = Array.from(container.querySelectorAll('[data-testid^="unit-progress-"]'))
    expect(segments.length).toBeGreaterThan(0)
    expect(segments.every(segment => segment.getAttribute('data-completed') === 'false')).toBe(true)
    expect(screen.getByText('0 of 3 unit steps completed')).toBeTruthy()
  })

  it('keeps platform offsets stable while the explorer follows several completed lessons and the next unit', () => {
    const handlers = { onStart: vi.fn(), onPractise: vi.fn(), onReview: vi.fn(), onPractiseAnyway: vi.fn() }
    const viewFor = (progress: CourseProgress) => <CoursePath {...handlers} path={toPathView({ status: 'ready', course: COURSE, standing: courseStanding(COURSE, progress) })} />
    const view = render(viewFor({}))
    const geometry = () => [1, 2, 3].map(n => screen.getByTestId(`trail-stop-${n}`).getAttribute('style'))
    const original = geometry()
    const progress: Record<string, number> = {}
    const first = COURSE.units[0]!
    progress[first.nodes[0]!.id] = 1
    view.rerender(viewFor(progress))
    expect(screen.getByTestId('trail-guide').getAttribute('data-step')).toBe(first.nodes[0]!.id)
    expect(screen.getByTestId('trail-next').textContent).toContain('Lesson 2 of 2')
    expect(screen.getByTestId('lesson-ring').getAttribute('data-progress')).toBe('0.5')
    for (const [index, node] of first.nodes.entries()) {
      progress[node.id] = node.lessons
      view.rerender(viewFor({ ...progress }))
      const next = first.nodes[index + 1] ?? COURSE.units[1]!.nodes[0]!
      expect(screen.getByTestId('trail-guide').getAttribute('data-step')).toBe(next.id)
      expect(geometry()).toEqual(original)
      expect(screen.getAllByTestId('path-node-current')).toHaveLength(1)
      expect(screen.getByTestId('lesson-ring').getAttribute('data-progress')).toBe('0')
    }
    fireEvent.click(screen.getByTestId('path-node-current'))
    expect(handlers.onStart).toHaveBeenLastCalledWith(COURSE.units[1]!.nodes[0]!.id)
    // Re-renders a thirty-three-step path once per step; vitest's five seconds is for a quick
    // machine, and a CI runner or a busy laptop is neither.
  }, 60_000)
  it('lights exactly one step, and it starts its lesson in one tap', () => {
    const { onStart } = renderPath()
    const start = screen.getAllByRole('button', { name: /^Start step/ })
    expect(start).toHaveLength(1)
    fireEvent.click(start[0]!)
    expect(onStart).toHaveBeenCalledWith('node.first-week.flags')
  })

  it('says what the current step is for, where a new learner will see it', () => {
    const { container } = renderPath()
    // The callout: Start, the objective with the pack's own count, and the lesson.
    expect(container.textContent).toContain('Start')
    expect(container.textContent).toContain('Match 6 flags to their countries.')
    expect(container.textContent).toContain('Lesson 1 of 2')
  })

  it('announces every step, in path order, with its state in the label', () => {
    const { container } = renderPath({ 'node.first-week.flags': 2 })
    const labels = steps(container)
    expect(labels).toHaveLength(TOTAL)
    // The first week, word for word: the brief's seven days.
    expect(labels.slice(0, 7)).toEqual([
      `Step 1 of ${TOTAL}, done. Match 6 flags to their countries.`,
      `Start step 2 of ${TOTAL}. Find where 6 countries are in the world. Lesson 1 of 2.`,
      `Step 3 of ${TOTAL}, not open yet. Match 6 countries to their capitals.`,
      `Step 4 of ${TOTAL}, not open yet. Recognise 6 new countries by flag and place.`,
      `Step 5 of ${TOTAL}, not open yet. Match all 12 countries to their capitals.`,
      `Step 6 of ${TOTAL}, not open yet. Mix flags, places and capitals for all 12 countries.`,
      `Step 7 of ${TOTAL}, not open yet. Check what stayed with you, starting with what's due.`,
    ])
    // And the path goes on past it, still in order, with the pack's own counts.
    expect(labels[7]).toBe(`Step 8 of ${TOTAL}, not open yet. Match 7 flags to their countries.`)
    expect(labels.at(-1)).toBe(`Step ${TOTAL} of ${TOTAL}, not open yet. Check what stayed with you, starting with what's due.`)
  })

  it('counts which lesson of the step comes next', () => {
    const { container } = renderPath({ 'node.first-week.flags': 1 })
    expect(container.textContent).toContain('Lesson 2 of 2')
  })

  it('shows the base XP rule and continues the unfinished challenge', () => {
    const { onStart } = renderPath({ 'node.first-week.flags': 1 })
    expect(screen.getByText(`+${BALANCE.xp.correctAnswer} XP`)).toBeTruthy()
    expect(screen.getByText('Base reward per new correct answer')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue challenge →' }))
    expect(onStart).toHaveBeenCalledWith('node.first-week.flags')
  })

  it('opens a card under a done step offering practice, rather than starting a lesson', () => {
    const { onPractise, onStart } = renderPath({ 'node.first-week.flags': 2 })
    const done = screen.getByRole('button', { name: new RegExp(`^Step 1 of ${TOTAL}, done`) })
    expect(done.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(done)
    expect(done.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('You finished this step. Practise it any time.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Practise' }))
    expect(onPractise).toHaveBeenCalledWith('node.first-week.flags')
    expect(onStart).not.toHaveBeenCalled()
  })

  it('explains a step that is not open yet — no dead tap, and nothing to press', () => {
    renderPath()
    const closed = screen.getByRole('button', { name: new RegExp(`^Step 3 of ${TOTAL}, not open yet`) })
    fireEvent.click(closed)
    expect(screen.getByText('Not open yet. It opens when you finish the steps before it.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Practise' })).toBeNull()
    // A second tap puts it away again.
    fireEvent.click(closed)
    expect(screen.queryByTestId('path-card')).toBeNull()
  })

  it('opens one card at a time', () => {
    renderPath()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Step 2 of ${TOTAL}`) }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Step 5 of ${TOTAL}`) }))
    expect(screen.getAllByTestId('path-card')).toHaveLength(1)
    expect(screen.getByRole('button', { name: new RegExp(`^Step 5 of ${TOTAL}`) }).getAttribute('aria-expanded')).toBe('true')
  })

  it('heads each unit with its number and title, for moving by heading', () => {
    renderPath()
    expect(screen.getByRole('heading', { name: 'Unit 1: First countries' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Unit 2: Across the continents' })).toBeTruthy()
    // After the first week, one unit per continent (course v1.1.0).
    expect(screen.getByRole('heading', { name: 'Unit 3: Europe' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Unit 6: Africa' })).toBeTruthy()
  })

  it('ends: a finished course offers review, and no step is lit', () => {
    const { onReview, container } = renderPath(ALL_DONE)
    expect(screen.queryByRole('button', { name: /^Start step/ })).toBeNull()
    expect(container.textContent).toContain('You finished World foundations.')
    // Honest about the end of new content (L15).
    expect(container.textContent).toContain("There's nothing new on this path.")
    fireEvent.click(screen.getByRole('button', { name: 'Keep reviewing' }))
    expect(onReview).toHaveBeenCalledOnce()
  })

  it('still leads somewhere when the course could not be read', () => {
    const onPractiseAnyway = vi.fn()
    render(
      <CoursePath
        path={{ status: 'error' }}
        onStart={vi.fn()}
        onPractise={vi.fn()}
        onReview={vi.fn()}
        onPractiseAnyway={onPractiseAnyway}
      />,
    )
    expect(screen.getByText("The course didn't load")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Practise now' }))
    expect(onPractiseAnyway).toHaveBeenCalledOnce()
  })

  it('never frames a closed step as a punishment', () => {
    const { container } = renderPath()
    const blame = /locked out|you must|can't|failed|behind/i
    // Every closed step's label, which carries its objective sentence…
    expect(steps(container).join(' ')).not.toMatch(blame)
    // …and the card a closed step opens, which says the same for every one of them.
    const closed = screen.getAllByRole('button', { name: /not open yet/ })
    for (const button of [closed[0]!, closed.at(-1)!]) {
      fireEvent.click(button)
      expect(container.textContent).not.toMatch(blame)
    }
  })

  it('renders every string through the catalogues, with every placeholder filled', () => {
    const { container } = renderPath({ 'node.first-week.flags': 2 })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Step 1 of ${TOTAL}`) }))
    const words = [container.textContent ?? '', ...steps(container)].join(' ')
    expect(words).not.toMatch(/\b(course|home):[a-z][a-zA-Z0-9.]+/)
    expect(words).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})


it('keeps Home focused while retaining access to the whole course', () => {
  const path = toPathView({ status: 'ready', course: COURSE, standing: courseStanding(COURSE, {}) })
  const { container } = render(<CoursePath condensed path={path} onStart={() => {}} onPractise={() => {}} onReview={() => {}} onPractiseAnyway={() => {}} />)
  expect(steps(container).length).toBe(COURSE.units[0]!.nodes.length)
  fireEvent.click(screen.getByTestId('path-expand'))
  expect(steps(container).length).toBe(TOTAL)
  fireEvent.click(screen.getByTestId('path-expand'))
  expect(steps(container).length).toBe(COURSE.units[0]!.nodes.length)
})

describe('the course path — a finished step that is fading', () => {
  const firstId = COURSE.units[0]!.nodes[0]!.id
  const fadingPath = () =>
    toPathView(
      { status: 'ready', course: COURSE, standing: courseStanding(COURSE, { [firstId]: COURSE.units[0]!.nodes[0]!.lessons }) },
      new Set([firstId]),
    )
  const draw = () => {
    const handlers = { onStart: vi.fn(), onPractise: vi.fn(), onReview: vi.fn(), onPractiseAnyway: vi.fn() }
    return render(<CoursePath path={fadingPath()} {...handlers} />)
  }

  it('wears a small clock and says so in words, without a warning', () => {
    const { container } = draw()
    expect(screen.getByTestId('path-fading')).toBeTruthy()
    const label = steps(container)[0]!
    expect(label).toMatch(/getting rusty/)
    expect(label).not.toMatch(/overdue|failing|lost|warning/i)
  })

  it('offers the refresh on the step\'s card, in the same calm voice', () => {
    draw()
    fireEvent.click(screen.getAllByTestId('path-node-done')[0]!)
    expect(screen.getByTestId('path-fading-note').textContent).toBe('Some of these are fading. A short practice brings them back.')
    expect(screen.getByTestId('path-practise')).toBeTruthy()
  })

  it('draws nothing extra for a finished step that is holding', () => {
    const handlers = { onStart: vi.fn(), onPractise: vi.fn(), onReview: vi.fn(), onPractiseAnyway: vi.fn() }
    render(<CoursePath path={toPathView({ status: 'ready', course: COURSE, standing: courseStanding(COURSE, { [firstId]: COURSE.units[0]!.nodes[0]!.lessons }) })} {...handlers} />)
    expect(screen.queryByTestId('path-fading')).toBeNull()
  })
})
