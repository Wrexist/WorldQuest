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

describe('Lesson — the locator map', () => {
  it('never shows a map on a question whose answer is the country', () => {
    // The composer decides this (packages/engines), but the screen is where a
    // regression would actually reach a user, so it is asserted here too. A map beside
    // "Which country's flag is this?" answers it — for sighted users only, which is
    // the worst way to leak an answer.
    render(<LessonScreen onExit={() => {}} />)
    const prompt = screen.getByRole('heading').textContent ?? ''
    const answersWithCountry = /which country|flag is this/i.test(prompt)
    if (answersWithCountry) expect(screen.queryByTestId('prompt-locator')).toBeNull()
  })

  it('draws real artwork when it does show one', () => {
    // Composed from the shipped packs, so whichever question comes up, a locator that
    // renders must resolve to a file we actually bundle rather than a placeholder.
    const { container } = render(<LessonScreen onExit={() => {}} />)
    const locator = screen.queryByTestId('prompt-locator')
    if (locator === null) return
    const layers = Array.from(locator.querySelectorAll('img'))
    // Two layers: the continent, and the country inside it.
    expect(layers).toHaveLength(2)
    for (const layer of layers) expect(layer.getAttribute('src')).toBeTruthy()
    void container
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

describe('Lesson — correctness reaches a screen reader', () => {
  it('names which option was right and which was chosen', () => {
    // The gap this closes: the tick and the wrong-mark are BOTH `aria-hidden`
    // artwork, and the surface colour is invisible to a reader — so the entire
    // correct/wrong signal on an answered question was unavailable non-visually.
    // `AnswerOption` has carried an `accessibilityLabel` prop documented with the
    // example "Japan, correct answer" since it was written, and nothing passed it.
    render(<LessonScreen onExit={() => {}} />)
    // Answer, wrongly or rightly — either way BOTH labels must appear, because the
    // correct option is revealed in green whichever was chosen.
    fireEvent.click(answerButtons()[1]!)

    const labels = answerButtons().map((o) => o.getAttribute('aria-label') ?? '')
    expect(labels.some((l) => /correct answer$/.test(l))).toBe(true)
    // Only the chosen option is marked wrong; the untouched distractors stay bare.
    expect(labels.filter((l) => /not the answer$/.test(l)).length).toBeLessThanOrEqual(1)
    expect(labels.every((l) => l.length > 0)).toBe(true)
  })

  it('never shouts at the user in the label a reader hears', () => {
    // The visible copy is "That's Berlin. The answer is Paris." — plain, no
    // exclamation, no "Oops". The spoken label has to keep the same register: a
    // screen-reader user is the one person who cannot see how gentle the screen is.
    const { container } = render(<LessonScreen onExit={() => {}} />)
    fireEvent.click(answerButtons()[1]!)
    const spoken = container.innerHTML
    expect(spoken).not.toMatch(/wrong answer|incorrect|oops|try again/i)
  })
})
