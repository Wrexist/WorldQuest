import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { courseStanding, type CourseProgress } from '@worldquest/engines'
import { loadCourse } from '../course.js'
import { toPathView } from '../pathView.js'
import { JourneyReady } from './JourneyReady.js'

const loaded = loadCourse()
if (!loaded.ok) throw new Error('Course must load')
const course = loaded.course
function show(progress: CourseProgress) {
  const actions = { onStart: vi.fn(), onReview: vi.fn(), onHome: vi.fn() }
  render(<JourneyReady path={toPathView({ status: 'ready', course, standing: courseStanding(course, progress) })} {...actions} />)
  return actions
}
describe('next-challenge reveal', () => {
  it('continues the same step until its required lessons are finished', () => {
    const actions = show({ 'node.first-week.flags': 1 })
    expect(screen.getByText('Lesson 2 of 2')).toBeTruthy()
    fireEvent.click(screen.getByTestId('journey-start'))
    expect(actions.onStart).toHaveBeenCalledWith('node.first-week.flags')
  })
  it('reveals the next unlocked step from saved progress', () => {
    const actions = show({ 'node.first-week.flags': 2 })
    expect(screen.getByText('Find where 6 countries are in the world.')).toBeTruthy()
    fireEvent.click(screen.getByTestId('journey-start'))
    expect(actions.onStart).not.toHaveBeenCalledWith('node.first-week.flags')
    expect(actions.onStart).toHaveBeenCalledOnce()
  })
  it('offers review after completing the course, never a fake next challenge', () => {
    const actions = show(Object.fromEntries(course.units.flatMap(u => u.nodes.map(n => [n.id, n.lessons]))))
    expect(screen.queryByTestId('journey-start')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Keep reviewing' }))
    expect(actions.onReview).toHaveBeenCalledWith(course.id)
  })
  it('lets the learner return without starting another lesson', () => {
    const actions = show({ 'node.first-week.flags': 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Back to my journey' }))
    expect(actions.onHome).toHaveBeenCalledOnce()
    expect(actions.onStart).not.toHaveBeenCalled()
  })
})
