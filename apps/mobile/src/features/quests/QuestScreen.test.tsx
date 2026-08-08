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

  it('numbers the steps, and ticks the ones that are done', () => {
    // Mockup screen 4 reads as a numbered checklist. Without the numbers the five
    // rows look like five unrelated meters; without the tick, a bar at 100% and a
    // bar at 95% are the same picture at a glance.
    //
    // The fixture has task 2 complete and the rest not, so this asserts BOTH
    // branches from one render — a test that only ever saw the unfinished state is
    // how the done state would rot.
    const { container } = render(<QuestScreen quest={quest()} loading={false} onStart={() => {}} />)
    // `Array.from`, not spread: a NodeList is not iterable under this tsconfig.
    const steps = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
      .map((el) => el.textContent?.trim())
      .filter((s) => s !== undefined && s !== '')
    // The done step draws an icon rather than a character, so it contributes no
    // text — which is the point: `✓` was a glyph whose presence depended on the
    // system font having it.
    expect(steps).toEqual(['1', '3', '4', '5'])
    // Scoped to the task list. It counted images across the whole screen until the
    // header grew an Atlas, at which point a test about how a DONE STEP is drawn
    // started failing because of an illustration three elements away.
    expect(container.querySelectorAll('[data-testid="quest-tasks"] img')).toHaveLength(1)
  })

  it('keeps the step number out of the screen reader', () => {
    // The row already announces its title and progress. A reader saying "3" before
    // every task is noise, and the number carries no information the label lacks.
    render(<QuestScreen quest={quest()} loading={false} onStart={() => {}} />)
    const row = screen.getByLabelText(/Know the flag/)
    expect(row.textContent).not.toMatch(/^2/)
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
