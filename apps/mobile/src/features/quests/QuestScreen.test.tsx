import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { DailyQuest } from '@worldquest/engines'
import { QuestScreen } from './QuestScreen.js'

const quest = (overrides: Partial<DailyQuest> = {}): DailyQuest => ({
  id: 'u1:2026-08-01',
  date: '2026-08-01',
  tasks: [
    { slot: 'locate', target: 4, factIds: ['a'], progress: 2, complete: false },
    { slot: 'recognise', target: 4, factIds: ['b'], progress: 4, complete: true },
    { slot: 'recall', target: 4, factIds: ['c'], progress: 0, complete: false },
    { slot: 'discover', target: 2, factIds: ['d'], progress: 0, complete: false },
    { slot: 'perform', target: 1, factIds: [], goal: 'perfect_lesson', progress: 0, complete: false },
  ],
  complete: false,
  bonusClaimed: false,
  ...overrides,
})

describe('Quests — the five states', () => {
  it('renders five tasks', () => {
    render(<QuestScreen quest={quest()} loading={false} onStart={() => {}} />)
    for (const title of [
      'Find it on the map',
      'Know the flag',
      'Name the capital',
      'Learn something new',
      'Finish strong',
    ]) {
      expect(screen.getByText(title)).toBeTruthy()
    }
  })

  it('shows a skeleton while loading', () => {
    const { container } = render(<QuestScreen quest={null} loading onStart={() => {}} />)
    expect(container.querySelector('[aria-label="Loading"]')).toBeTruthy()
  })

  it('explains itself rather than showing an empty list when there is no quest yet', () => {
    // A quest is composed from the user's state, and on a first launch there is none.
    // That is not an error, and a spinner that never resolves is a worse answer.
    render(<QuestScreen quest={null} loading={false} onStart={() => {}} />)
    expect(screen.getByText('Your quest is being built')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
  })

  it('celebrates completion and drops the call to action', () => {
    const done = quest({
      complete: true,
      bonusClaimed: true,
      tasks: quest().tasks.map((t) => ({ ...t, progress: t.target, complete: true })),
    })
    render(<QuestScreen quest={done} loading={false} onStart={() => {}} />)
    expect(screen.getByText('All five. Nice work.')).toBeTruthy()
    // Nothing left to do today — a Continue button here would lead nowhere.
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  })
})

describe('Quests — behaviour', () => {
  it('shows the goal for the performance slot so it is not a mystery', () => {
    render(<QuestScreen quest={quest()} loading={false} onStart={() => {}} />)
    expect(screen.getByText('A lesson with no mistakes')).toBeTruthy()
  })

  it('marks a finished task done and leaves it in the list', () => {
    // Completed tasks recede rather than disappearing, so the list keeps its shape
    // and the sense of "how much is left" does not jump around.
    render(<QuestScreen quest={quest()} loading={false} onStart={() => {}} />)
    expect(screen.getByText('Done')).toBeTruthy()
    expect(screen.getByText('Know the flag')).toBeTruthy()
  })

  it('announces each task as one element with its progress', () => {
    render(<QuestScreen quest={quest()} loading={false} onStart={() => {}} />)
    expect(screen.getByLabelText('Find it on the map, 2 of 4')).toBeTruthy()
  })

  it('starts a lesson from the primary action', () => {
    const onStart = vi.fn()
    render(<QuestScreen quest={quest()} loading={false} onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('never mentions a missed quest', () => {
    // The mechanic that turns a game into an obligation. The engine has no field for
    // it; this asserts the screen has no copy for it either.
    const { container } = render(<QuestScreen quest={quest()} loading={false} onStart={() => {}} />)
    expect(container.textContent).not.toMatch(/missed|yesterday|catch up|make up/i)
  })

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = render(<QuestScreen quest={quest()} loading={false} onStart={() => {}} />)
    expect(container.textContent).not.toMatch(/\b[a-z]+:[a-z][a-zA-Z0-9.]+/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})
