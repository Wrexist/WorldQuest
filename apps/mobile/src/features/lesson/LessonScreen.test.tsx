/**
 * The lesson screen, mounted for real.
 *
 * Unlike every other screen here, this one is NOT presentational — it owns the
 * machine, the content index and the sync queue. That is deliberate (the runner is
 * the one place the state machine meets React), so these tests drive it the way a
 * user does: mount it, read what is on screen, click an answer.
 *
 * The content is the real shipped pack. A lesson composed from fixtures would test
 * the fixtures.
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LessonScreen } from './LessonScreen.js'

// The sync queue writes to MMKV and would try to reach Supabase. The queue's own
// rules are unit-tested in the engines; here it only has to not explode.
vi.mock('../../lib/sync.js', () => ({ enqueueLesson: vi.fn(), flush: vi.fn() }))
vi.mock('../../lib/analytics.js', () => ({ track: vi.fn() }))

/** Every button except the footer's Continue. */
const answerButtons = (): HTMLElement[] => screen.getAllByTestId('answer-option')

describe('Lesson', () => {
  it('asks a real question composed from the shipped packs', () => {
    render(<LessonScreen onExit={() => {}} />)
    // Four options, from the real distractor strategy — not a fixture.
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(4)
  })

  it('renders the prompt through the catalogue, not as a raw key', () => {
    // `promptKey` comes from a content pack, so it goes through `tContent` and is
    // validated by `pnpm content:validate` rather than by the compiler. A missing
    // entry surfaces here as the key itself on screen.
    const { container } = render(<LessonScreen onExit={() => {}} />)
    expect(container.textContent).not.toMatch(/lesson:prompt\./)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })

  it('shows the hearts remaining as a spoken phrase', () => {
    render(<LessonScreen onExit={() => {}} />)
    expect(screen.getByLabelText(/hearts? (left|remaining)/i)).toBeTruthy()
  })

  it('reveals the answer only after one is chosen', () => {
    const { container } = render(<LessonScreen onExit={() => {}} />)
    // Nothing that looks like feedback before an answer.
    expect(container.textContent).not.toMatch(/Perfect|That's/)

    const options = answerButtons()
    expect(options.length).toBeGreaterThan(0)
    fireEvent.click(options[0]!)

    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
  })

  it('never punishes a wrong answer', () => {
    // No "Wrong!", no shame. The voice guide forbids it and the i18n gate bans the
    // words; this asserts the rendered screen too.
    const { container } = render(<LessonScreen onExit={() => {}} />)
    for (const option of answerButtons()) fireEvent.click(option)

    expect(container.textContent).not.toMatch(/wrong!|incorrect|oops|failed/i)
  })

  it('labels every answer with the country it names', () => {
    // The prompt supplies the context, so the button announces "Finland, button" —
    // not "Answer: Finland", which a reader would repeat four times in a row.
    render(<LessonScreen onExit={() => {}} />)
    const options = answerButtons()
    expect(options.length).toBeGreaterThanOrEqual(4)
    for (const option of options) {
      expect(option.getAttribute('aria-label')).toBe(option.textContent)
      expect(option.getAttribute('aria-label')).toBeTruthy()
    }
  })
})

describe('Lesson — pausing', () => {
  it('offers a way out of the lesson at all', () => {
    // The catalogue lists a close control first (§5) and it had never been built. The
    // route disables the back gesture on purpose, so before this the only exits from
    // a started lesson were answering ten questions or killing the app.
    render(<LessonScreen onExit={() => {}} />)
    expect(screen.getByRole('button', { name: 'Pause the lesson' })).toBeTruthy()
  })

  it('pauses rather than quitting, so a mis-tap is recoverable', () => {
    render(<LessonScreen onExit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pause the lesson' }))

    expect(screen.getByText('Paused')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep going' }))
    expect(screen.queryByText('Paused')).toBeNull()
  })

  it('covers the question while paused', () => {
    // A pause that leaves the prompt readable is a free look at an item the
    // scheduler is about to score.
    render(<LessonScreen onExit={() => {}} />)
    const prompt = screen.getByRole('heading').textContent
    fireEvent.click(screen.getByRole('button', { name: 'Pause the lesson' }))

    // The paused heading is now the only one on screen.
    expect(screen.getByRole('heading').textContent).toBe('Paused')
    expect(screen.getByRole('heading').textContent).not.toBe(prompt)
  })
})
