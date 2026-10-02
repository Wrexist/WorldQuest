import type { ContextType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { AccessibilityInfo, Animated, AppState, type AppStateStatus } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { setAppReducedMotion } from '@worldquest/design'
import type { DailyQuest } from '@worldquest/engines'
import { withFullMotion } from '../../test/setup.js'
import { QuestScreen } from './QuestScreen.js'
import { QuestTreasureCard } from './QuestTreasureCard.js'

afterEach(() => { setAppReducedMotion(false); vi.restoreAllMocks() })

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
  it('describes activity tasks without implying a specific flag, capital or map is required', () => {
    const current = quest()
    render(<QuestScreen quest={{ ...current, tasks: current.tasks.map(task => ({ ...task,
      ...(task.slot === 'perform' ? {} : { activity: task.slot === 'discover' ? 'new' as const : task.slot === 'locate' ? 'review' as const : 'practice' as const }),
    })) }} loading={false} onStart={() => {}} />)
    expect(screen.getByText('Discover new facts')).toBeTruthy()
    expect(screen.getByText('Refresh your memory')).toBeTruthy()
    expect(screen.getByText('Practice round 2')).toBeTruthy()
    expect(screen.getByText('Practice round 3')).toBeTruthy()
    expect(screen.getByLabelText('Practice round 3. Answer 4 different facts correctly. Progress: 0 of 4.')).toBeTruthy()
    expect(screen.queryByText('Know the flag')).toBeNull()
  })
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
    const steps = Array.from(container.querySelectorAll('[data-testid="quest-step"]'))
      .map((el) => el.textContent?.trim())
      .filter((s) => s !== undefined && s !== '')
    // The done step draws an icon rather than a character, so it contributes no
    // text — which is the point: `✓` was a glyph whose presence depended on the
    // system font having it.
    expect(steps).toEqual(['1', '3', '4', '5'])
    // Scoped to the STEPS, not to the task list. It counted images across the whole
    // screen until the header grew an Atlas, then across the task list until each task
    // grew a subject glyph and an XP bolt — twice over, a test about how a done step is
    // drawn failed because of a picture somewhere else in the row. Asking the step
    // itself is the assertion that was always meant, and it cannot rot that way again.
    const drawn = Array.from(container.querySelectorAll('[data-testid="quest-step"]')).filter(
      (step) => step.querySelector('img') !== null,
    )
    expect(drawn).toHaveLength(1)
  })

  it('announces aggregate progress while showing which actual quest milestone is complete', () => {
    render(<QuestScreen quest={quest()} loading={false} onStart={() => {}} />)
    const progress = screen.getByRole('progressbar', { name: '1 of 5 done' })
    expect(progress).toBe(screen.getByTestId('quest-progress'))
    expect(progress.getAttribute('aria-valuemin')).toBe('0')
    expect(progress.getAttribute('aria-valuemax')).toBe('5')
    expect(progress.getAttribute('aria-valuenow')).toBe('1')

    // Tasks may finish out of order: one completed task does not mean task 1 is done.
    for (const step of [1, 3, 4, 5]) {
      const milestone = screen.getByTestId(`quest-milestone-${step}`)
      expect(milestone.textContent?.trim()).toBe(String(step))
      expect(milestone.querySelector('img')).toBeNull()
    }
    const finished = screen.getByTestId('quest-milestone-2')
    expect(finished.querySelector('img')).not.toBeNull()
    expect(finished.textContent?.trim()).toBe('')
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
    expect(screen.queryByRole('button', { name: 'Continue quest →' })).toBeNull()
  })
})

describe('Quests — behaviour', () => {
  it('lets the treasure chest react without starting a lesson or awarding progress', () => {
    const onStart = vi.fn()
    render(<QuestScreen quest={quest()} loading={false} onStart={onStart} />)
    const treasure = within(screen.getByTestId('quest-treasure-card'))
    const chest = treasure.getByRole('button', { name: 'Give the treasure chest a nudge' })
    expect(treasure.getByText('+50 XP')).toBeTruthy()

    fireEvent.click(chest)

    expect(onStart).not.toHaveBeenCalled()
    expect(screen.getByTestId('quest-progress').getAttribute('aria-valuenow')).toBe('1')
    expect(treasure.getByText('+50 XP')).toBeTruthy()
    expect(screen.getByTestId('quest-milestone-1').textContent?.trim()).toBe('1')
    expect(screen.getByTestId('quest-milestone-2').querySelector('img')).not.toBeNull()
  })

  it('lets Atlas respond to actual progress and welcomes a stopping point', () => {
    const fresh = quest({ tasks: quest().tasks.map((task) => ({ ...task, progress: 0, complete: false })) })
    const { rerender } = render(<QuestScreen quest={fresh} loading={false} onStart={() => {}} />)
    expect(screen.getByText('Ready for a little adventure? Take it one step at a time.')).toBeTruthy()

    rerender(<QuestScreen quest={quest()} loading={false} onStart={() => {}} />)
    expect(screen.getByText('Look at you go. Every discovery counts.')).toBeTruthy()
    expect(screen.queryByText('Ready for a little adventure? Take it one step at a time.')).toBeNull()

    const finished = quest({ complete: true, tasks: quest().tasks.map((task) => ({ ...task, progress: task.target, complete: true })) })
    rerender(<QuestScreen quest={finished} loading={false} onStart={() => {}} />)
    expect(screen.getByText("Today's adventure is complete. Enjoy the view!")).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue quest →' })).toBeNull()
  })

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
    fireEvent.click(screen.getByRole('button', { name: 'Continue quest →' }))
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

describe('Quest treasure motion lifecycle', () => {
  it('stamps only a newly completed checkpoint and announces progress before motion finishes', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const sequence = vi.spyOn(Animated, 'sequence').mockImplementation(() => ({
      start: vi.fn(), stop: vi.fn(), reset: vi.fn(),
    }))
    const current = quest()
    const advanced = quest({ tasks: current.tasks.map(task => task.slot === 'recall'
      ? { ...task, progress: task.target, complete: true } : task) })
    await withFullMotion(async () => {
      const view = render(<QuestTreasureCard quest={current} />)
      await act(async () => { await Promise.resolve() })
      expect(sequence).not.toHaveBeenCalled()

      view.rerender(<QuestTreasureCard quest={advanced} />)
      expect(sequence).toHaveBeenCalledOnce()
      expect(screen.getByTestId('quest-progress').getAttribute('aria-valuenow')).toBe('2')
      expect(screen.getByTestId('quest-milestone-3').querySelector('img')).not.toBeNull()
      expect(screen.getByTestId('quest-milestone-1').textContent?.trim()).toBe('1')
      sequence.mockClear()

      view.rerender(<QuestTreasureCard quest={{ ...advanced }} />)
      view.rerender(<QuestTreasureCard quest={current} />)
      expect(sequence).not.toHaveBeenCalled()
      view.unmount()
      render(<QuestTreasureCard quest={advanced} />)
      expect(sequence).not.toHaveBeenCalled()
    })
  })

  it('shows a newly earned checkpoint immediately with reduced motion', () => {
    setAppReducedMotion(true)
    const sequence = vi.spyOn(Animated, 'sequence')
    const current = quest()
    const view = render(<QuestTreasureCard quest={current} />)
    view.rerender(<QuestTreasureCard quest={quest({ tasks: current.tasks.map(task => task.slot === 'recall'
      ? { ...task, progress: task.target, complete: true } : task) })} />)
    expect(sequence).not.toHaveBeenCalled()
    expect(screen.getByTestId('quest-progress').getAttribute('aria-valuenow')).toBe('2')
    expect(screen.getByTestId('quest-milestone-3').querySelector('img')).not.toBeNull()
  })

  it('settles an active nudge when reduced motion is enabled and keeps the chest usable', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const timing = vi.spyOn(Animated, 'timing').mockImplementation(() => ({
      start: vi.fn(), stop: vi.fn(), reset: vi.fn(),
    }))
    await withFullMotion(async () => {
      render(<QuestTreasureCard quest={quest()} />)
      await act(async () => { await Promise.resolve() })
      timing.mockClear()
      fireEvent.click(screen.getByRole('button', { name: 'Give the treasure chest a nudge' }))
      expect(timing).toHaveBeenCalledTimes(1)
      const nudge = timing.mock.results[0]!.value

      act(() => setAppReducedMotion(true))
      expect(nudge.stop).toHaveBeenCalled()
      timing.mockClear()
      fireEvent.click(screen.getByRole('button', { name: 'Give the treasure chest a nudge' }))
      expect(timing).not.toHaveBeenCalled()
      expect(screen.getByText('+50 XP')).toBeTruthy()
      expect(screen.getByTestId('quest-progress').getAttribute('aria-valuenow')).toBe('1')
    })
  })

  it.each(['blur', 'background'] as const)('cancels a chest nudge on %s and removes its listeners', async cause => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const timing = vi.spyOn(Animated, 'timing').mockImplementation(() => ({
      start: vi.fn(), stop: vi.fn(), reset: vi.fn(),
    }))
    const blurListeners = new Set<() => void>()
    const stateListeners = new Set<(state: AppStateStatus) => void>()
    vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      stateListeners.add(callback)
      return { remove: () => { stateListeners.delete(callback) } }
    })
    const navigation = {
      isFocused: () => true,
      addListener: (event: string, callback: () => void) => {
        if (event === 'blur') blurListeners.add(callback)
        return () => { blurListeners.delete(callback) }
      },
    } as unknown as ContextType<typeof NavigationContext>

    await withFullMotion(async () => {
      const view = render(<NavigationContext.Provider value={navigation}>
        <QuestTreasureCard quest={quest()} />
      </NavigationContext.Provider>)
      await act(async () => { await Promise.resolve() })
      timing.mockClear()
      fireEvent.click(screen.getByRole('button', { name: 'Give the treasure chest a nudge' }))
      expect(timing).toHaveBeenCalledTimes(1)
      const nudge = timing.mock.results[0]!.value
      act(() => {
        if (cause === 'blur') blurListeners.forEach(listener => listener())
        else stateListeners.forEach(listener => listener('background'))
      })
      expect(nudge.stop).toHaveBeenCalled()
      view.unmount()
      expect(blurListeners.size).toBe(0)
      expect(stateListeners.size).toBe(0)
    })
  })
})
