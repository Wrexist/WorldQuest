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
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AccessibilityInfo, Animated, Text } from 'react-native'
import { motion, setAppReducedMotion } from '@worldquest/design'
import { BALANCE } from '@worldquest/engines'
import { withFullMotion } from '../../test/setup.js'
import { SceneEntrance } from '../../components/SceneEntrance.js'
import { LessonScreen, WrongFeedback } from './LessonScreen.js'
import { setLocale } from '../../lib/i18n.js'
import { track } from '../../lib/analytics.js'
import { enqueueLesson } from '../../lib/sync.js'

// The sync queue writes to MMKV and would try to reach Supabase. The queue's own
// rules are unit-tested in the engines; here it only has to not explode.
vi.mock('../../lib/sync.js', () => ({ enqueueLesson: vi.fn(), flush: vi.fn() }))
vi.mock('../../lib/analytics.js', () => ({ track: vi.fn() }))
// The difficulty ramp reads the account's XP through TanStack Query, and these tests mount the
// screen without a provider. A learner with no progress yet is what they have always assumed.
vi.mock('../home/useOptimisticProgress.js', () => ({ useOptimisticProgress: () => ({ shown: null }) }))

/** Every button except the footer's Continue. */
const answerButtons = (): HTMLElement[] => screen.getAllByTestId('answer-option')

/** A single activation commits the answer. */
function choose(option: HTMLElement): void {
  fireEvent.click(option)
}

/**
 * Which option of the (deterministic) first question is right, from ONE throwaway
 * render: whatever was chosen, grading labels the correct option "…, correct answer".
 */
function correctIndex(): number {
  render(<LessonScreen onExit={() => {}} />)
  choose(answerButtons()[0]!)
  const index = answerButtons().findIndex((o) =>
    /correct answer$/.test(o.getAttribute('aria-label') ?? ''),
  )
  cleanup()
  expect(index, 'no option was labelled as the correct answer').toBeGreaterThanOrEqual(0)
  return index
}

/**
 * Click the right answer and return what the screen then said.
 *
 * The screen composes from the real shipped packs, so the test cannot know the answer
 * key — and must not be given one, or it would be testing a fixture. It finds it the
 * way a user would: try one, look at the feedback, and try the next if it was wrong.
 * Deterministic composition is what makes that safe rather than flaky.
 */
function answerCorrectly(): string {
  for (let index = 0; index < 4; index++) {
    const { container } = render(<LessonScreen onExit={() => {}} />)
    const options = answerButtons()
    if (index >= options.length) break
    choose(options[index]!)
    const shown = container.textContent ?? ''
    if (shown.includes('Perfect!')) return shown
    cleanup()
  }
  throw new Error('no option produced the correct-answer card')
}

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
    expect(screen.getByTestId('answer-sheet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
  })

  it('shows the reward it is actually going to award', () => {
    // The card rendered the string literals "+10" and "+5". That broke the rule that
    // reward numbers live only in the balance table, and it was also false: the real
    // figure is 2 for a known fact the scheduler did not ask for, 12 for one it did, 14
    // with the speed bonus, a quarter of any of those past the daily cap.
    //
    // Asserted against BALANCE rather than against "10", so changing a reward number in
    // the one place it is allowed to change does not fail this test — and hardcoding one
    // back into the screen does.
    // The reward figures render only on the CORRECT branch, and this test used to pick
    // its option with `options.find(o => o.getAttribute('aria-label') !== null)` — a
    // heuristic for "the right one" that had nothing to do with which one is right. It
    // reliably clicked a wrong answer, rendered the wrong-answer card, matched zero `+N`
    // figures, and then looped over an empty array. Every assertion below was vacuously
    // true; the test had never once checked a reward.
    //
    // The composed lesson is deterministic — same seed, same pack, same first question
    // on every mount, verified — so trying each option in a fresh render finds the
    // correct one without the test needing to know the answer key.
    const shown = answerCorrectly()
    const rewards = [...shown.matchAll(/\+(\d+)/g)].map((m) => Number(m[1]))
    // Every figure on the card is a value the balance table can produce for one answer.
    const possibleXp = [
      0,
      BALANCE.xp.repeatKnownNotDue,
      BALANCE.xp.correctAnswer,
      BALANCE.xp.correctAnswer + BALANCE.xp.speedBonus,
      BALANCE.xp.correctAnswer + BALANCE.xp.overdueReviewBonus,
      BALANCE.xp.correctAnswer + BALANCE.xp.overdueReviewBonus + BALANCE.xp.speedBonus,
    ]
    // The loop below is vacuously true over an empty array, so a card that rendered no
    // reward at all — or a selector that stopped matching — would pass this test while
    // proving nothing. Assert there is something to check before checking it.
    expect(rewards.length, 'the summary card showed no reward figure at all').toBeGreaterThan(0)
    for (const value of rewards) {
      expect(
        possibleXp.includes(value) || value === BALANCE.coins.correctAnswer,
        `"+${value}" is not a reward this economy can pay for one answer`,
      ).toBe(true)
    }
  })

  it('never punishes a wrong answer', () => {
    // No "Wrong!", no shame. The voice guide forbids it and the i18n gate bans the
    // words; this asserts the rendered screen too — on a GRADED wrong answer, which
    // clicking every option in one lesson never produced: only the first click graded.
    const wrong = correctIndex() === 0 ? 1 : 0
    const { container } = render(<LessonScreen onExit={() => {}} />)
    choose(answerButtons()[wrong]!)
    expect(container.textContent).toMatch(/You picked/)
    expect(container.textContent).not.toMatch(/wrong!|incorrect|oops|failed/i)
  })

  it('says one short line after a wrong picture answer, shows the right picture, and the whole of it to a reader', () => {
    // Flag answers are labelled with full descriptions, so "You picked …" and "The answer
    // is …" ran to five lines. The sheet says one line and SHOWS the right picture: it lies
    // over the lesson, and on a short phone it covers the marked options. A screen reader
    // still hears both sentences, and not the picture, which the words already name.
    const { container, getByTestId } = render(
      <WrongFeedback titleRef={null} title="You picked three stripes." body="The answer is a red disc." short="The right one:"
        picture={<Text>red disc</Text>} />,
    )
    expect(container.textContent).toBe('The right one:red disc')
    expect(container.querySelector('[aria-label="You picked three stripes. The answer is a red disc."]')).not.toBeNull()
    expect(getByTestId('wrong-feedback-picture').getAttribute('aria-hidden')).toBe('true')
  })

  it('names both answers in words when there is no picture to point at', () => {
    const { container } = render(
      <WrongFeedback titleRef={null} title="You picked Oslo." body="The answer is Stockholm." short={undefined} />,
    )
    expect(container.textContent).toBe('You picked Oslo.The answer is Stockholm.')
  })

  it('claims no run after one right answer', () => {
    // The "3 in a row!" badge states a fact. After a single correct answer that fact is
    // not true yet, so the badge is not there — the same rule as the "on a roll" line.
    answerCorrectly()
    expect(screen.queryByTestId('lesson-combo')).toBeNull()
  })

  it('labels every answer with the country it names, and never with its badge letter', () => {
    // The prompt supplies the context, so the button announces "Finland, button" —
    // not "Answer: Finland", which a reader would repeat four times in a row.
    //
    // The A/B/C/D badge is a VISUAL rail: it gives the eye a fixed column to scan and
    // gives the answer state a second non-colour carrier, and it is `aria-hidden`
    // because "A, Rome" is a letter of noise in front of every option. jsdom's
    // `textContent` does not honour aria-hidden, so the badge shows up here even though
    // no reader will ever say it — which is why this compares against the label with a
    // single leading badge letter stripped rather than against the raw text.
    //
    // Stated as a strip rather than a `toContain`, deliberately: `toContain` would pass
    // for "Answer: Finland" too, and the whole point of the original assertion was that
    // the accessible name is EXACTLY what is on screen and nothing more.
    render(<LessonScreen onExit={() => {}} />)
    const options = answerButtons()
    expect(options.length).toBeGreaterThanOrEqual(4)
    for (const option of options) {
      const visible = (option.textContent ?? '').replace(/^[ABCD]/, '')
      // A PICTURE option (the flag questions) has no visible words: its accessible name is the
      // written description of the picture, and is exactly what a screen reader should get. The
      // lesson now opens with whichever question suits the learner, not always a capital, so
      // this meets those too.
      if (visible !== '') expect(option.getAttribute('aria-label')).toBe(visible)
      expect(option.getAttribute('aria-label')).toBeTruthy()
      // And the badge really is decorative — a reader must not receive the letter.
      expect(option.getAttribute('aria-label')).not.toMatch(/^[ABCD][A-Z]/)
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

  it('leads back from a lesson that never started, instead of trapping the learner', () => {
    // A focus with nothing in it composes no lesson. The route is a full-screen modal
    // with the back gesture off, so this screen needs its own way out — as do the
    // offline and failure screens, which share the same button.
    const onLeave = vi.fn()
    render(<LessonScreen onExit={() => {}} onLeave={onLeave} focus={{ entities: [] }} />)
    expect(screen.getByText("You're all caught up")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onLeave).toHaveBeenCalledOnce()
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
    choose(answerButtons()[1]!)

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
    choose(answerButtons()[1]!)
    const spoken = container.innerHTML
    expect(spoken).not.toMatch(/wrong answer|incorrect|oops|try again/i)
  })
})

describe('immediate answer feedback', () => {
  const disabled = (el: HTMLElement): boolean => el.getAttribute('aria-disabled') === 'true'

  it('does not show a Check button for answer choices', () => {
    render(<LessonScreen onExit={() => {}} />)
    expect(screen.queryByTestId('lesson-check')).toBeNull()
    expect(screen.queryByTestId('answer-sheet')).toBeNull()
  })

  it('grades a correct choice immediately and locks every option', () => {
    const right = correctIndex()
    const { container } = render(<LessonScreen onExit={() => {}} />)
    choose(answerButtons()[right]!)
    expect(container.textContent).toContain('Perfect!')
    expect(screen.getByTestId('answer-sheet')).toBeTruthy()
    expect(answerButtons().every(disabled)).toBe(true)
  })

  it('keeps the first incorrect verdict when another answer is tapped', () => {
    const right = correctIndex()
    render(<LessonScreen onExit={() => {}} />)
    const choices = answerButtons()
    choose(choices[right === 0 ? 1 : 0]!)
    const verdict = screen.getByTestId('answer-sheet').textContent
    choose(choices[right]!)
    expect(screen.getByTestId('answer-sheet').textContent).toBe(verdict)
    expect(screen.getAllByTestId('answer-sheet')).toHaveLength(1)
  })

  it('waits for Continue, then accepts a fresh answer without Check', () => {
    render(<LessonScreen onExit={() => {}} />)
    choose(answerButtons()[0]!)
    expect(screen.getByTestId('answer-sheet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.queryByTestId('answer-sheet')).toBeNull()
    expect(screen.queryByTestId('lesson-check')).toBeNull()
    expect(answerButtons().some(disabled)).toBe(false)
    choose(answerButtons()[0]!)
    expect(screen.getByTestId('answer-sheet')).toBeTruthy()
  })
})

describe('optional study before the quiz', () => {
  it('opens the question directly without showing the study answers', () => {
    render(<LessonScreen onExit={() => {}} />)
    expect(screen.queryByTestId('lesson-introduction')).toBeNull()
    expect(answerButtons()).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Learn first' })).toBeTruthy()
  })

  it('studies only on request, then resumes the same unanswered question without restarting', () => {
    vi.mocked(track).mockClear()
    const exit = vi.fn()
    const leave = vi.fn()
    render(<LessonScreen onExit={exit} onLeave={leave} />)
    const choices = answerButtons().map(option => option.getAttribute('aria-label'))
    fireEvent.click(screen.getByRole('button', { name: 'Learn first' }))
    expect(screen.getByTestId('lesson-introduction')).toBeTruthy()
    expect(screen.queryByTestId('answer-option')).toBeNull()
    expect(screen.queryByTestId('lesson-check')).toBeNull()
    const firstDiscovery = screen.getByTestId('study-card').textContent
    expect(screen.getAllByTestId('study-card')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Previous' }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Next discovery' }))
    expect(screen.getByTestId('study-card').textContent).not.toBe(firstDiscovery)
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByTestId('study-card').textContent).toBe(firstDiscovery)
    const nextDiscovery = screen.getByRole('button', { name: 'Next discovery' })
    for (let step = 0; step < 30 && nextDiscovery.getAttribute('aria-disabled') !== 'true'; step++) {
      fireEvent.click(nextDiscovery)
    }
    expect(nextDiscovery.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getAllByTestId('study-card')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Back to quiz' }))
    expect(screen.queryByTestId('lesson-introduction')).toBeNull()
    expect(answerButtons().map(option => option.getAttribute('aria-label'))).toEqual(choices)
    expect(answerButtons().some(option => option.getAttribute('aria-selected') === 'true')).toBe(false)
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0')
    expect(vi.mocked(track).mock.calls.filter(([event]) => event === 'lesson_started')).toHaveLength(1)
    expect(exit).not.toHaveBeenCalled()
    expect(leave).not.toHaveBeenCalled()
  })

  it('removes the study action after the first answer', () => {
    render(<LessonScreen onExit={() => {}} />)
    choose(answerButtons()[0]!)
    expect(screen.queryByTestId('lesson-study')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.queryByTestId('lesson-study')).toBeNull()
  })

  it('does not submit anything for studying or count study time as answering time', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
    vi.mocked(enqueueLesson).mockClear()
    try {
      render(<LessonScreen onExit={() => {}} />)
      fireEvent.click(screen.getByTestId('lesson-study'))
      clock.mockReturnValue(1_800_000_600_000)
      fireEvent.click(screen.getByTestId('lesson-begin'))
      expect(enqueueLesson).not.toHaveBeenCalled()
      clock.mockReturnValue(1_800_000_600_250)
      choose(answerButtons()[0]!)
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
      fireEvent.click(screen.getByRole('button', { name: 'Pause the lesson' }))
      fireEvent.click(screen.getByRole('button', { name: 'Finish here' }))
      expect(enqueueLesson).toHaveBeenCalledOnce()
      expect(vi.mocked(enqueueLesson).mock.calls[0]![0].answers).toEqual([
        expect.objectContaining({ elapsedMs: 250 }),
      ])
    } finally {
      cleanup()
      clock.mockRestore()
    }
  })

  it.each([{ placement: true }, { mode: 'speed' as const }])('does not reveal study answers in an assessment or speed round: %j', (props) => {
    render(<LessonScreen {...props} onExit={() => {}} />)
    expect(screen.queryByTestId('lesson-study')).toBeNull()
    expect(screen.queryByTestId('lesson-introduction')).toBeNull()
    expect(answerButtons()).toHaveLength(4)
  })

  it('offers the requested Swedish study label and a way back to the quiz', async () => {
    await act(async () => setLocale('sv'))
    try {
      render(<LessonScreen onExit={() => {}} />)
      fireEvent.click(screen.getByRole('button', { name: 'Lär dig först' }))
      expect(screen.getByRole('heading', { name: 'Lär dig först' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Tillbaka till quizet' }))
      expect(answerButtons()).toHaveLength(4)
    } finally {
      cleanup()
      await act(async () => setLocale('en'))
    }
  })
})

describe('question arrivals', () => {
  it('keeps answers usable while arriving, and replays only after Continue', async () => {
    const osMotion = vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const timing = vi.spyOn(Animated, 'timing').mockReturnValue({ start: vi.fn(), stop: vi.fn(), reset: vi.fn() })
    try {
      await withFullMotion(async () => {
        // In the app, earlier screens have already read the OS motion preference.
        // Warm that real hook rather than making an unknown preference animate.
        render(<SceneEntrance />)
        await act(async () => { await Promise.resolve() })
        cleanup()
        timing.mockClear()
        render(<LessonScreen onExit={() => {}} focus={{ attributes: ['capital'], entities: ['ES', 'JP', 'SE', 'FR'] }} />)
        const prompt = screen.getByTestId('lesson-prompt-arrival')
        const options = screen.getByTestId('lesson-options-arrival')
        const atlas = screen.getByTestId('prompt-locator')
        await waitFor(() => expect(timing.mock.calls.filter(([, config]) => config.duration === motion.quick.duration)).toHaveLength(2))
        const arrivals = new Set(timing.mock.calls.filter(([, config]) => config.duration === motion.quick.duration).map(([value]) => value))
        timing.mockClear()

        // Input remains usable during arrival, and one tap grades immediately.
        fireEvent.click(answerButtons()[0]!)
        expect(screen.getByTestId('answer-sheet')).toBeTruthy()
        expect(timing.mock.calls.filter(([value]) => arrivals.has(value))).toHaveLength(0)
        expect(screen.getByTestId('prompt-locator')).toBe(atlas)

        fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
        expect(timing.mock.calls.filter(([value]) => arrivals.has(value))).toHaveLength(2)
        // Native view identity survives: no keyed scene or GL parent remount.
        expect(screen.getByTestId('lesson-prompt-arrival')).toBe(prompt)
        expect(screen.getByTestId('lesson-options-arrival')).toBe(options)
        expect(screen.getByTestId('prompt-locator')).toBe(atlas)
        expect(answerButtons().some(option => option.getAttribute('aria-selected') === 'true')).toBe(false)
      })
    } finally {
      cleanup()
      timing.mockRestore()
      osMotion.mockRestore()
    }
  })

  it('shows a settled, playable next question under reduced motion', () => {
    setAppReducedMotion(true)
    try {
      render(<LessonScreen onExit={() => {}} />)
      choose(answerButtons()[0]!)
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
      for (const id of ['lesson-prompt-arrival', 'lesson-options-arrival']) {
        expect(screen.getByTestId(id).style.transform).toContain('translateY(0px)')
        expect(screen.getByTestId(id).style.transform).toContain('scale(1)')
      }
      choose(answerButtons()[0]!)
      expect(screen.getByTestId('answer-sheet')).toBeTruthy()
    } finally {
      cleanup()
      setAppReducedMotion(false)
    }
  })
})
