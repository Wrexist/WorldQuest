import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { courseStanding, type CourseProgress } from '@worldquest/engines'
import { loadCourse } from '../course.js'
import { toPathView } from '../pathView.js'
import { CoursePath } from './CoursePath.js'

const loaded = loadCourse()
if (!loaded.ok) throw new Error('the shipped course must parse')
const COURSE = loaded.course

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
    expect(steps(container)).toEqual([
      'Step 1 of 7, done. Match 6 flags to their countries.',
      'Start step 2 of 7. Find where 6 countries are in the world. Lesson 1 of 2.',
      'Step 3 of 7, not open yet. Match 6 countries to their capitals.',
      'Step 4 of 7, not open yet. Recognise 6 new countries by flag and place.',
      'Step 5 of 7, not open yet. Match all 12 countries to their capitals.',
      'Step 6 of 7, not open yet. Mix flags, places and capitals for all 12 countries.',
      "Step 7 of 7, not open yet. Check what stayed with you, starting with what's due.",
    ])
  })

  it('counts which lesson of the step comes next', () => {
    const { container } = renderPath({ 'node.first-week.flags': 1 })
    expect(container.textContent).toContain('Lesson 2 of 2')
  })

  it('opens a card under a done step offering practice, rather than starting a lesson', () => {
    const { onPractise, onStart } = renderPath({ 'node.first-week.flags': 2 })
    const done = screen.getByRole('button', { name: /^Step 1 of 7, done/ })
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
    const closed = screen.getByRole('button', { name: /^Step 3 of 7, not open yet/ })
    fireEvent.click(closed)
    expect(screen.getByText('Not open yet. It opens when you finish the steps before it.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Practise' })).toBeNull()
    // A second tap puts it away again.
    fireEvent.click(closed)
    expect(screen.queryByTestId('path-card')).toBeNull()
  })

  it('opens one card at a time', () => {
    renderPath()
    fireEvent.click(screen.getByRole('button', { name: /^Step 2 of 7/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Step 5 of 7/ }))
    expect(screen.getAllByTestId('path-card')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /^Step 5 of 7/ }).getAttribute('aria-expanded')).toBe('true')
  })

  it('heads each unit with its number and title, for moving by heading', () => {
    renderPath()
    expect(screen.getByRole('heading', { name: 'Unit 1: First countries' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Unit 2: Across the continents' })).toBeTruthy()
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
    for (const button of screen.getAllByRole('button', { name: /not open yet/ })) fireEvent.click(button)
    expect(container.textContent).not.toMatch(/locked out|you must|can't|failed|behind/i)
  })

  it('renders every string through the catalogues, with every placeholder filled', () => {
    const { container } = renderPath({ 'node.first-week.flags': 2 })
    fireEvent.click(screen.getByRole('button', { name: /^Step 1 of 7/ }))
    const words = [container.textContent ?? '', ...steps(container)].join(' ')
    expect(words).not.toMatch(/\b(course|home):[a-z][a-zA-Z0-9.]+/)
    expect(words).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})
