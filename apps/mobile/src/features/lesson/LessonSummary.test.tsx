/**
 * The lesson summary.
 *
 * Presentational, so these tests hand it a `GradeResult` directly rather than driving
 * a whole lesson — the grading path has its own tests in the engines, and composing a
 * lesson that happens to end perfectly is a slow way to test one branch of copy.
 */

import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { factsStrengthened } from '@worldquest/engines'
import type { GradeResult, Mastery } from '@worldquest/engines'
import { LessonSummary, outcomeOf } from './LessonSummary.js'

const move = (factId: string, from: Mastery, to: Mastery) => ({ factId, from, to })

const grade = (over: Partial<GradeResult> = {}): GradeResult => ({
  lessonId: 'l1',
  items: 10,
  correct: 8,
  accuracy: 0.8,
  xpAwarded: 40,
  coinsAwarded: 12,
  reviews: [],
  updatedMemory: new Map(),
  masteryChanges: [],
  perfect: false,
  rejected: 0,
  overdueCleared: 0,
  heartsLost: 0,
  ...over,
})

const summary = (over: Partial<GradeResult> | null = {}, wasAbandoned = false) => {
  const onExit = vi.fn()
  const view = render(
    <LessonSummary
      result={over === null ? null : grade(over)}
      wasAbandoned={wasAbandoned}
      isOffline={false}
      onExit={onExit}
    />,
  )
  return { ...view, onExit }
}

describe('LessonSummary — what it says', () => {
  it('celebrates a perfect lesson', () => {
    summary({ correct: 10, accuracy: 1, perfect: true })
    expect(screen.getByRole('heading').textContent).toBe('Flawless.')
  })

  it('does not celebrate a lesson the user walked out of', () => {
    // A fanfare for leaving is the app failing to read the room. So is a telling-off.
    const { container } = summary({ items: 3, correct: 2 }, true)
    expect(screen.getByRole('heading').textContent).toBe('Stopped there.')
    expect(container.textContent).not.toMatch(/flawless|nice work/i)
  })

  it('never shames a lesson that went badly', () => {
    // Reachable by running out of hearts, which routes here as a finished lesson.
    const { container } = summary({ items: 10, correct: 3, accuracy: 0.3 })
    expect(container.textContent).not.toMatch(
      /keep practi|try harder|better luck|don'?t worry|unfortunately|failed|poor/i,
    )
    expect(screen.getByRole('heading').textContent).toBe('Lesson complete.')
  })

  it('has nothing to total up when the user left before answering', () => {
    // The stock "everything you answered counts" would be a lie with nothing answered.
    const { container } = summary(null, true)
    expect(container.textContent).toMatch(/No answers to count/i)
    expect(screen.queryByTestId('summary-xp')).toBeNull()
    expect(screen.queryByTestId('summary-accuracy')).toBeNull()
  })
})

describe('LessonSummary — the numbers', () => {
  it('gives a screen reader the XP figure outright, never the tally', () => {
    // A reader counting "one, two, three… forty" out loud is worse than no animation.
    // The card carries the final figure; the ticking text is hidden from the tree.
    summary({ xpAwarded: 40 })
    const card = screen.getByTestId('summary-xp')
    expect(card.getAttribute('aria-label')).toBe('40 XP earned')
    for (const child of Array.from(card.querySelectorAll('div'))) {
      expect(child.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('shows the awarded amount, not a frame of the animation', async () => {
    // Worth knowing what this actually covers: jsdom has no `matchMedia`, and
    // react-native-web answers `isReduceMotionEnabled()` with TRUE when it cannot
    // query — so every test in this suite runs the reduced-motion path. That makes
    // this the assertion that the number is right when it does not travel, which is
    // the branch a vestibular-sensitive user gets and the one worth pinning.
    //
    // The travelling branch cannot be observed here at all: `Animated.timing` in jsdom
    // completes in a single frame. Its two failure modes — a native-driven value whose
    // JS listener never fires, and a tally that stops one short of the target — are
    // guarded at the source in packages/design/src/motion.test.ts instead.
    summary({ xpAwarded: 40 })
    await waitFor(() => expect(screen.getByText('+40')).toBeTruthy())
  })

  it('reports accuracy as a count first, because a percentage read aloud is not useful', () => {
    summary({ items: 10, correct: 7, accuracy: 0.7 })
    const tile = screen.getByTestId('summary-accuracy')
    expect(tile.getAttribute('aria-label')).toBe('7 of 10 right — 70 percent')
    expect(tile.textContent).toContain('70%')
  })

  it('does not print a poor score in the colour it uses for good news', () => {
    // The review caught this on a rendered summary: 35 % accuracy in the same green as
    // "Perfect!", a completed bar and every other good thing in the app. Colour means
    // one thing per the design system, and here it meant the opposite of the number.
    //
    // The two sides are asserted against EACH OTHER rather than against a hex literal.
    // The claim is "these differ"; pinning the token's current value would make a
    // theme change look like a regression, which is how a colour test rots.
    summary({ items: 10, correct: 3, accuracy: 0.3 })
    const poor = screen.getByText('30%').getAttribute('style')
    cleanup()

    summary({ items: 10, correct: 9, accuracy: 0.9 })
    const strong = screen.getByText('90%').getAttribute('style')

    expect(poor).not.toBe(strong)
  })

  it('counts only the facts that moved forward', () => {
    // `masteryChanges` records movement in both directions. Counting a fact that fell
    // back to `learning` as progress overstates what someone learned, which is the
    // same class of error as a wrong fact and harder to see.
    summary({
      masteryChanges: [
        move('geo.SE.capital', 'unseen', 'learning'),
        move('geo.NO.capital', 'familiar', 'proficient'),
        move('geo.FI.capital', 'proficient', 'learning'),
      ],
    })
    const tile = screen.getByTestId('summary-stronger')
    expect(tile.textContent).toContain('2')
    expect(tile.getAttribute('aria-label')).toBe('2 facts moved up a level')
  })

  it('shows the learning tile at zero rather than hiding it', () => {
    // A stat that appears only when it flatters is a scoreboard, not a report — and a
    // summary that changes shape between lessons is its own small accessibility bug.
    summary({ masteryChanges: [] })
    const tile = screen.getByTestId('summary-stronger')
    expect(tile.textContent).toContain('0')
    expect(tile.getAttribute('aria-label')).toBe('No facts moved up a level this time')
  })

  it('groups each tile into one spoken element, not two fragments', () => {
    summary()
    for (const id of ['summary-accuracy', 'summary-coins', 'summary-stronger']) {
      const tile = screen.getByTestId(id)
      expect(tile.getAttribute('aria-label')).toBeTruthy()
      for (const child of Array.from(tile.querySelectorAll('div'))) {
        expect(child.getAttribute('aria-hidden')).toBe('true')
      }
    }
  })
})

describe('LessonSummary — where you just were', () => {
  const SE = { id: 'SE', flagPath: 'flags/SE.png', name: 'Sweden' }
  const JP = { id: 'JP', flagPath: 'flags/JP.png', name: 'Japan' }

  const withFlags = (practised: readonly { id: string; flagPath: string | undefined; name: string }[]) =>
    render(
      <LessonSummary
        result={grade()}
        practised={practised}
        wasAbandoned={false}
        isOffline={false}
        onExit={() => {}}
      />,
    )

  it('names every flag, because here the picture is the only thing that does', () => {
    // The opposite of the collection grid, where the tile already says "Sweden" and a
    // labelled flag would make a reader say it twice. There is no other text here.
    withFlags([SE, JP])
    expect(screen.getByLabelText('Sweden')).toBeTruthy()
    expect(screen.getByLabelText('Japan')).toBeTruthy()
  })

  it('disappears rather than showing an empty shelf', () => {
    summary()
    expect(screen.queryByTestId('summary-practised')).toBeNull()
  })

  it('still renders a country whose flag we do not ship', () => {
    // `Flag` falls back to the art slot. Dropping the country instead would quietly
    // shorten the row and misreport where the user actually was.
    withFlags([{ id: 'XK', flagPath: undefined, name: 'Kosovo' }])
    expect(screen.getByTestId('summary-practised')).toBeTruthy()
  })
})

describe('LessonSummary — the way out', () => {
  it('offers exactly one action, and it exits', () => {
    const { onExit } = summary()
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    fireEvent.click(screen.getByTestId('summary-continue'))
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('says so when the result has not reached the server', () => {
    render(
      <LessonSummary result={grade()} wasAbandoned={false} isOffline onExit={() => {}} />,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})

describe('the summary rules, on their own', () => {
  it('ranks mastery in the order the model defines', () => {
    expect(factsStrengthened(grade({ masteryChanges: [move('a', 'mastered', 'burnished')] }))).toBe(1)
    expect(factsStrengthened(grade({ masteryChanges: [move('a', 'burnished', 'mastered')] }))).toBe(0)
    expect(factsStrengthened(grade({ masteryChanges: [move('a', 'unseen', 'learning')] }))).toBe(1)
  })

  it('treats leaving early as its own outcome, whatever the score was', () => {
    expect(outcomeOf(grade({ perfect: true, accuracy: 1 }), true)).toBe('early')
    expect(outcomeOf(null, true)).toBe('early')
  })

  it('separates a perfect lesson from a strong one from a hard one', () => {
    expect(outcomeOf(grade({ perfect: true, accuracy: 1 }), false)).toBe('perfect')
    expect(outcomeOf(grade({ accuracy: 0.8 }), false)).toBe('strong')
    expect(outcomeOf(grade({ accuracy: 0.79 }), false)).toBe('done')
  })
})
