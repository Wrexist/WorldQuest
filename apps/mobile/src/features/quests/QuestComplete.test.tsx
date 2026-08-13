import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BALANCE } from '@worldquest/engines'
import { QuestComplete } from './QuestComplete.js'

/**
 * The screen that tells a user their day is done.
 *
 * Two things about it are worth a test and neither is visible in a screenshot: that the
 * reward figures come from the balance table rather than from this file, and that the two
 * optional lines are ABSENT rather than zeroed. Both are rules this repo has broken before
 * — an invented reward number on one screen, and "0 day streak" as a first impression.
 */
describe('QuestComplete', () => {
  it('states the score and the bonus the server actually pays', () => {
    render(<QuestComplete done={5} total={5} onDone={() => {}} />)

    expect(screen.getByText('5 of 5 done')).toBeTruthy()
    // The figures, not a copy of them. If someone retunes the daily quest in
    // `balance.ts`, this screen has to move with it or the test fails — which is the
    // whole point of `xp-economy.md` §5 naming one source of truth.
    expect(screen.getByLabelText(`Bonus: ${BALANCE.xp.dailyQuest} XP`)).toBeTruthy()
    expect(screen.getByLabelText(`Bonus: ${BALANCE.coins.dailyQuest} coins`)).toBeTruthy()
  })

  it('says nothing about a streak it does not have', () => {
    // Absent, not zero. A lesson finished offline has not moved the server's streak yet,
    // and "0 days in a row" on the screen celebrating a finished quest is the same
    // verdict-instead-of-a-fact this app refuses on Home.
    const { container } = render(<QuestComplete done={5} total={5} onDone={() => {}} />)
    expect(container.textContent).not.toMatch(/in a row/)

    render(<QuestComplete done={5} total={5} streak={0} onDone={() => {}} />)
    expect(screen.queryByText(/in a row/)).toBeNull()
  })

  it('shows the milestone only on a day that hits one', () => {
    const plain = render(<QuestComplete done={5} total={5} streak={3} onDone={() => {}} />)
    expect(plain.container.textContent).toMatch(/3 days in a row/)
    // No milestone at 3. `streakMilestones` pays at 7, 30, 100 and 365 and nothing in
    // between, so a bonus line on every other day would be a reward that does not exist.
    expect(plain.container.textContent).not.toMatch(/milestone/i)

    render(
      <QuestComplete
        done={5}
        total={5}
        streak={7}
        milestoneXp={BALANCE.xp.streakMilestones[7]}
        onDone={() => {}}
      />,
    )
    expect(screen.getByText(/Streak milestone/)).toBeTruthy()
  })

  it('offers a way out that does not pretend to hand over a reward', () => {
    // Never "Claim". The bonus is granted by the server while it grades the lesson, so by
    // the time this draws it is already in the wallet — a claim button would be a lie
    // about who did what, and the kind of dead shell this repo has removed twice.
    const { container } = render(<QuestComplete done={5} total={5} onDone={() => {}} />)
    expect(container.textContent).not.toMatch(/claim/i)
    expect(screen.getByText('Nice')).toBeTruthy()
  })
})
