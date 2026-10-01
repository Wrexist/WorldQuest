import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Question } from '@worldquest/engines'
import { PairsBoard } from './PairsBoard.js'

const PAIRS: [string, string, string][] = [['SE', 'Sweden', 'Stockholm'], ['NO', 'Norway', 'Oslo'], ['DK', 'Denmark', 'Copenhagen'], ['FI', 'Finland', 'Helsinki']]

// The same four cards, in the same order, on every member — as `pairUp` builds them.
const cards = PAIRS.map(([id, , city]) => ({ id, label: city }))
const members: Question[] = PAIRS.map(([id, country], position) => ({
  item: { id: `geo.${id}.capital@t`, factId: `geo.${id}.capital`, templateId: 't', entityId: id, difficulty: 1, screenReaderSafe: true },
  promptKey: 'lesson:prompt.capital_of', promptParams: { entityName: country },
  options: cards.map((c) => ({ ...c, isCorrect: c.id === id })),
  modality: 'text', timeLimitMs: null, isNew: false,
  group: { id: 'pairs.x', size: 4, position },
}))

const left = (name: string): HTMLElement => screen.getAllByTestId('pairs-left').find((el) => el.textContent?.includes(name))!
const right = (name: string): HTMLElement => screen.getAllByTestId('pairs-right').find((el) => el.textContent?.includes(name))!
const join = (country: string, city: string): void => {
  fireEvent.click(left(country))
  fireEvent.click(right(city))
}
/** The beat a wrong pairing stays muted for. */
const afterTheBeat = (): void => {
  act(() => {
    vi.advanceTimersByTime(5000)
  })
}

import { afterEach, beforeEach } from 'vitest'
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const renderBoard = () => {
  const onDone = vi.fn()
  render(<PairsBoard members={members} onDone={onDone} />)
  return onDone
}

describe('PairsBoard', () => {
  it('shows four things on the left and their four partners on the right, with a heading', () => {
    renderBoard()
    expect(screen.getAllByTestId('pairs-left')).toHaveLength(4)
    expect(screen.getAllByTestId('pairs-right')).toHaveLength(4)
    expect(screen.getByRole('heading', { name: 'Match the pairs' })).toBeTruthy()
  })

  it('says nothing to the lesson until the last pair is made', () => {
    const onDone = renderBoard()
    join('Sweden', 'Stockholm')
    join('Norway', 'Oslo')
    join('Denmark', 'Copenhagen')
    expect(onDone).not.toHaveBeenCalled()
    join('Finland', 'Helsinki')
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('reports the right partner for every card when every first try was right', () => {
    const onDone = renderBoard()
    for (const [, country, city] of PAIRS) join(country, city)
    expect(onDone).toHaveBeenCalledWith({
      'geo.SE.capital@t': 'SE', 'geo.NO.capital@t': 'NO', 'geo.DK.capital@t': 'DK', 'geo.FI.capital@t': 'FI',
    })
  })

  it('reports what was tried FIRST for a card, so a pair found on the second go is still a miss', () => {
    const onDone = renderBoard()
    join('Sweden', 'Oslo') // wrong first try
    afterTheBeat() // the two muted cards take presses again
    join('Sweden', 'Stockholm') // found it
    join('Norway', 'Oslo')
    join('Denmark', 'Copenhagen')
    join('Finland', 'Helsinki')
    const choices = onDone.mock.calls[0]![0] as Record<string, string>
    expect(choices['geo.SE.capital@t']).toBe('NO')
    expect(choices['geo.NO.capital@t']).toBe('NO')
  })

  it('takes a pairing from either side first', () => {
    const onDone = renderBoard()
    for (const [, country, city] of PAIRS) {
      fireEvent.click(right(city))
      fireEvent.click(left(country))
    }
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0]![0]).toMatchObject({ 'geo.SE.capital@t': 'SE' })
  })

  it('locks a made pair: tapping it again changes nothing', () => {
    const onDone = renderBoard()
    join('Sweden', 'Stockholm')
    fireEvent.click(left('Sweden'))
    fireEvent.click(right('Oslo'))
    // Sweden is made, so that tap on Oslo is just a pick; nothing was reported or mis-paired.
    expect(onDone).not.toHaveBeenCalled()
  })

  it('says a pair is made in words as well as with a tick', () => {
    renderBoard()
    join('Sweden', 'Stockholm')
    expect(left('Sweden').getAttribute('aria-label')).toBe('Sweden and Stockholm, matched')
  })
})

describe('PairsBoard after a wrong pairing', () => {
  it('lets go by itself, so a muted card is never a dead end', () => {
    renderBoard()
    join('Sweden', 'Oslo')
    expect(left('Sweden').getAttribute('aria-disabled')).toBe('true')
    afterTheBeat()
    expect(left('Sweden').getAttribute('aria-disabled')).not.toBe('true')
  })

  it('lets go on the next tap elsewhere too', () => {
    renderBoard()
    join('Sweden', 'Oslo')
    fireEvent.click(left('Denmark'))
    expect(left('Sweden').getAttribute('aria-disabled')).not.toBe('true')
  })
})
