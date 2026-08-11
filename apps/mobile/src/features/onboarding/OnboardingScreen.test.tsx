import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { CHILD_AGE, OnboardingScreen } from './OnboardingScreen.js'

/** 2026 keeps the arithmetic obvious; the component never reads a clock itself. */
const YEAR = 2026

/**
 * Answering a question now navigates, after a beat.
 *
 * Every single-select step advances on the tap rather than on a Continue, which means
 * the tests have to let that beat elapse — `ANSWER_BEAT_MS` is a real `setTimeout` and
 * without fake timers these helpers would assert against the step they just left.
 */
const answer = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole('radio', { name }))
  act(() => {
    vi.advanceTimersByTime(400)
  })
}

/**
 * Past the language picker and the carousel, to the first question with a wrong answer.
 *
 * Most of this file is about the age gate, so getting there is one helper rather than
 * three lines in twelve tests.
 */
const advanceToAgeStep = (): void => {
  answer('English') // language → slides
  fireEvent.click(screen.getByRole('button', { name: 'Skip' })) // slides → age
}

/**
 * Age → goal → region → level → taster, accepting the default on every slider.
 *
 * The two slider steps — goal and level — are left where they open. jsdom lays nothing
 * out, so a track measures zero wide and every position on it is the same position; the
 * drag is exercised in `pnpm e2e` against a real layout instead.
 */
const advanceToTaster = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // age → goal
  fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // goal → region
  answer('Europe') // region → level
  fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // level → plan
  fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // plan → taster
}

/**
 * One tap, on the year itself.
 *
 * This used to be two — a decade chip, then a year chip — because a grid cannot show a
 * hundred options and the step was built out of chips. It is a wheel now (see
 * `WheelPicker`), and every row of a wheel is a real radio precisely so that this stays
 * a click rather than a simulated fling: jsdom has no momentum, so
 * `onMomentumScrollEnd` never fires here and a test that drove the gesture would be
 * testing nothing at all.
 */
const pickYear = (year: number): void => {
  fireEvent.click(screen.getByRole('radio', { name: String(year) }))
}

describe('OnboardingScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens on the value slides, not on a sign-up wall', () => {
    // The conversion decision the whole flow is built around: teach first, ask later.
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} />)
    // The language step comes first, and it is still not a wall: one tap, already
    // answered, no account anywhere in sight.
    expect(screen.getByText(/Choose your language/i)).toBeTruthy()
    answer('English')
    expect(screen.getByText(/five minutes a day/i)).toBeTruthy()
    expect(screen.queryByText(/sign up|create account/i)).toBeNull()
  })

  it('applies a language on tap, not on Continue', () => {
    // The step's whole claim is that the app changes language while you are looking at
    // it — `onLanguage` is wired to `set('language', …)`, which calls `setLocale`. Every
    // other test in this file passed `onLanguage={vi.fn()}` and none of them ever tapped
    // a row, so the one behaviour the step exists for was the one thing unasserted.
    const onLanguage = vi.fn()
    render(
      <OnboardingScreen currentYear={YEAR} language="en" onLanguage={onLanguage} onFinish={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Svenska' }))
    expect(onLanguage).toHaveBeenCalledWith('sv')
  })

  it('lets a user skip the carousel rather than trapping them in it', () => {
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} />)
    advanceToAgeStep()
    expect(screen.getByText(/When were you born/i)).toBeTruthy()
  })

  it('asks for a birth year and never asks whether the user is over 13', () => {
    // A yes/no gate teaches a ten-year-old that lying gets them in. It is useless as
    // compliance and a bad first thing to teach a child.
    const { container } = render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} />)
    advanceToAgeStep()
    expect(container.textContent).not.toMatch(/over 13|13\+|are you over/i)
  })

  it('cannot continue past the age gate without an answer', () => {
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} />)
    advanceToAgeStep()
    const next = screen.getByRole('button', { name: 'Continue' })
    expect(next.getAttribute('aria-disabled')).toBe('true')
  })

  it('explains the child experience as something we do for them', () => {
    const { container } = render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} />)
    advanceToAgeStep()
    pickYear(YEAR - (CHILD_AGE - 3)) // comfortably a child
    expect(screen.getByText(/keep things simple/i)).toBeTruthy()
    // No shame words, no "not allowed", no "restricted".
    expect(container.textContent).not.toMatch(/not allowed|restricted|too young/i)
  })

  it('does not offer sign-in to a child', () => {
    // There is no account for them to already have, and offering one offers a flow
    // we would have to refuse.
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} onSignIn={vi.fn()} />)
    advanceToAgeStep()
    pickYear(YEAR - (CHILD_AGE - 3))
    advanceToTaster()
    expect(screen.queryByRole('button', { name: /already have an account/i })).toBeNull()
  })

  it('offers sign-in to an adult', () => {
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} onSignIn={vi.fn()} />)
    advanceToAgeStep()
    pickYear(YEAR - 30)
    advanceToTaster()
    expect(screen.getByRole('button', { name: /already have an account/i })).toBeTruthy()
  })

  it('reports the birth year, the child flag and the goal exactly once', () => {
    const onFinish = vi.fn()
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={onFinish} />)
    advanceToAgeStep()
    pickYear(YEAR - 30)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // age → goal
    // The goal slider announces its value as words, not as an index — the whole reason
    // `Slider` takes labelled stops. Asserted here because this is the step where a
    // number reaching a screen reader instead of "10 min" would be least noticeable.
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toMatch(/10 min/)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // goal → region
    answer('Europe') // region → level
    // Left on the slider's default. Moving it means a drag across a track whose width
    // jsdom reports as zero, so the honest place to exercise the gesture is the e2e run,
    // which drives a real pointer across a real layout and asserts the value changed.
    // `Slider`'s own test covers the index arithmetic.
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // level → plan
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // plan → taster
    fireEvent.click(screen.getByRole('button', { name: /Start learning/i }))

    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(onFinish).toHaveBeenCalledWith({
      birthYear: YEAR - 30,
      isChild: false,
      // Both sliders left where they open, for the reason in `advanceToTaster`.
      dailyGoalMinutes: 10,
      language: 'en',
      // Answered rather than defaulted, because there is no longer a way past these two
      // steps WITHOUT answering: the tap on the answer is the navigation. That is the
      // point of the change — a defaulted region used to mean "they pressed Continue",
      // which is not an opinion about anything.
      startRegion: 'EU',
      level: 'some',
    })
  })

  it('offers the default already chosen, so agreeing costs one tap and no thought', () => {
    // The rule this protects is "a required choice this early is a wall", and the shape
    // of the protection had to change with the flow. There is no Continue on this step
    // any more, so the old spelling — reach the end without expressing a preference —
    // is not available to anybody.
    //
    // It is still not a wall, and the press count is the argument. Agreeing used to cost
    // one press (Continue) and now costs one press (the row that is already ticked).
    // Disagreeing used to cost two and now costs one. Nobody pays more than before, and
    // the pre-selected tick is what still says "ten is fine if you have no opinion"
    // without making anybody form one.
    const onFinish = vi.fn()
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={onFinish} />)
    advanceToAgeStep()
    pickYear(YEAR - 30)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // age → goal

    // Where the track OPENS is the documented default, and it is already the answer.
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toMatch(/10 min/)

    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // the no-opinion path
    answer('Europe')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // level → plan
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // plan → taster
    fireEvent.click(screen.getByRole('button', { name: /Start learning/i }))
    expect(onFinish.mock.calls[0]![0].dailyGoalMinutes).toBe(10)
  })

  it('reaches every year in one gesture, with no second step in the way', () => {
    // The chip grid needed a decade before it would show a year, because twenty-one
    // buttons was already more than a 320 pt screen could hold — and at 320 the oldest
    // two decades rendered behind the Continue button anyway. A wheel has no such
    // ceiling: every row exists from the moment the step opens.
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} />)
    advanceToAgeStep()
    for (const year of [YEAR, 1996, 1985, YEAR - 100]) {
      expect(screen.getByRole('radio', { name: String(year) })).toBeTruthy()
    }
  })

  it('pre-selects no year, because that would nudge the one answer that must not be', () => {
    // The birth year decides whether a child gets the child experience. A wheel always
    // shows SOMETHING, so the row it opens on is an explicit empty one rather than a
    // plausible year the user never chose.
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} />)
    advanceToAgeStep()
    expect(screen.getByRole('radio', { name: 'Choose a year' }).getAttribute('aria-checked')).toBe(
      'true',
    )
    for (const year of [YEAR, 1996, 1985]) {
      expect(screen.getByRole('radio', { name: String(year) }).getAttribute('aria-checked')).toBe(
        'false',
      )
    }
  })

  it('never offers a year in the future', () => {
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} />)
    advanceToAgeStep()
    expect(screen.getByRole('radio', { name: String(YEAR) })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: String(YEAR + 1) })).toBeNull()
  })

  it('reaches back far enough for a real person to answer honestly', () => {
    // A picker that cannot express a user's age is a picker that makes them lie. The
    // oldest verified people alive are past 115.
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} />)
    advanceToAgeStep()
    expect(screen.getByRole('radio', { name: String(YEAR - 100) })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: String(YEAR - 101) })).toBeNull()
  })

  it('lets the answer be taken back without stranding Continue on a stale year', () => {
    // The chip version had to drop a chosen year when the decade changed underneath it,
    // or Continue stayed enabled carrying a year the user could no longer see. The
    // wheel cannot get into that state — but returning to the empty row must still
    // disable Continue, which is the same invariant from the other side.
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} />)
    advanceToAgeStep()
    pickYear(1996)
    // Absent, not "false" — an enabled control simply carries no aria-disabled.
    expect(screen.getByRole('button', { name: 'Continue' }).getAttribute('aria-disabled')).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: 'Choose a year' }))
    expect(screen.getByRole('button', { name: 'Continue' }).getAttribute('aria-disabled')).toBe(
      'true',
    )
  })

  it('names the wheel, so it does not announce as "radiogroup"', () => {
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} />)
    advanceToAgeStep()
    expect(screen.getByRole('radiogroup', { name: 'Year' })).toBeTruthy()
  })

  it('keeps every slide reachable by swipe as well as by tap', () => {
    // The carousel used to advance only on a tap: three slides, page dots underneath,
    // and no gesture at all. All three pages are mounted in the pager, which is what
    // makes a swipe possible — and is why this asserts on presence rather than on
    // visibility, since jsdom has no viewport to be outside of.
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} />)
    // Past the language step, which is now what the flow opens on.
    answer('English')
    expect(screen.getByText(/five minutes a day/i)).toBeTruthy()
    expect(screen.getByText(/Remembers what you forget/i)).toBeTruthy()
    expect(screen.getByText(/Collect the whole world/i)).toBeTruthy()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('can take back an answer that navigated away on its own', () => {
    // The pair that makes auto-advance safe. An answer now commits on the tap that
    // leaves the step, so without a way back the flow is seven irreversible decisions —
    // and the one thing a user does after a mis-tap is look for the way back.
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} />)
    advanceToAgeStep()
    pickYear(YEAR - 30)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // age → goal
    expect(screen.getByRole('slider')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back' })) // goal → age
    expect(screen.getByRole('radiogroup', { name: 'Year' })).toBeTruthy()
    // And the year is still the one they picked, not reset by the round trip.
    expect(screen.getByRole('radio', { name: String(YEAR - 30) }).getAttribute('aria-checked')).toBe(
      'true',
    )
  })

  it('does not push the user forward again after they tap back inside the answer beat', () => {
    // An answer schedules the next step for 260 ms later, and that timer used to be
    // cleared only by the NEXT answer or by unmount. Back navigates through neither, so
    // tapping an answer and then tapping back within the beat moved the user back and
    // then shoved them forward again — the one control whose entire job is to undo,
    // undone by the thing it was undoing.
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} />)
    advanceToAgeStep()
    pickYear(YEAR - 30)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // age → goal
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // goal → region

    // Answer, then change your mind before the beat is over.
    fireEvent.click(screen.getByRole('radio', { name: 'Europe' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' })) // region → goal, immediately
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    // Still on the goal step. The stale timer must not have fired.
    expect(screen.getByRole('slider', { name: 'How much a day?' })).toBeTruthy()
  })

  it('has nothing to go back to on the first step, and says so rather than hiding it', () => {
    // Disabled, not absent. A control that appears on step two teaches the user it
    // might vanish again; one that is visibly dimmed on step one teaches them where it
    // lives before they need it.
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} />)
    const back = screen.getByRole('button', { name: 'Back' })
    expect(back.getAttribute('aria-disabled')).toBe('true')

    answer('English') // → slides
    expect(screen.getByRole('button', { name: 'Back' }).getAttribute('aria-disabled')).toBeNull()
  })

  it('walks all the way back to the first question', () => {
    // One step per press, never out of the flow — the semantics this file's header
    // argued for and never built.
    render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} />)
    advanceToAgeStep()
    expect(screen.getByText(/When were you born/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back' })) // age → slides
    expect(screen.getByText(/five minutes a day/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back' })) // slides → language
    expect(screen.getByText(/Choose your language/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back' }).getAttribute('aria-disabled')).toBe('true')
  })

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = render(<OnboardingScreen currentYear={YEAR} language="en" onLanguage={vi.fn()} onFinish={vi.fn()} />)
    expect(container.textContent).not.toMatch(/\bonboarding:[a-z]/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})
