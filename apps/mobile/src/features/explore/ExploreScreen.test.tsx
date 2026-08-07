import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { WorldProgress } from '@worldquest/engines'
import { ExploreScreen } from './ExploreScreen.js'

const world = (overrides: Partial<WorldProgress> = {}): WorldProgress => ({
  regions: [
    {
      region: 'EU',
      entitiesTotal: 4,
      entitiesComplete: 1,
      entitiesStarted: 3,
      factsTotal: 8,
      factsLearned: 3,
      factsDue: 2,
      fraction: 3 / 8,
    },
    {
      region: 'AS',
      entitiesTotal: 1,
      entitiesComplete: 0,
      entitiesStarted: 0,
      factsTotal: 2,
      factsLearned: 0,
      factsDue: 0,
      fraction: 0,
    },
  ],
  entitiesTotal: 5,
  entitiesComplete: 1,
  factsTotal: 10,
  factsLearned: 3,
  factsDue: 2,
  fraction: 0.3,
  ...overrides,
})

describe('Explore', () => {
  it('shows all seven continents, including ones with no content yet', () => {
    // Hiding Africa until we have written Africa reads as a smaller world, and a user
    // who never sees the gap never learns that more is coming.
    render(<ExploreScreen world={world()} loading={false} onSelectRegion={() => {}} />)
    for (const name of [
      'Europe',
      'Asia',
      'Africa',
      'North America',
      'South America',
      'Oceania',
      'Antarctica',
    ]) {
      expect(screen.getByText(name)).toBeTruthy()
    }
  })

  it('disables a continent with nothing in it rather than pretending it is tappable', () => {
    render(<ExploreScreen world={world()} loading={false} onSelectRegion={() => {}} />)
    const africa = screen.getByRole('button', { name: 'Africa, 0% complete' })
    expect(africa.getAttribute('aria-disabled')).toBe('true')
  })

  it('opens a continent that has content', () => {
    const onSelectRegion = vi.fn()
    render(<ExploreScreen world={world()} loading={false} onSelectRegion={onSelectRegion} />)
    fireEvent.click(screen.getByRole('button', { name: 'Europe, 38% complete' }))
    expect(onSelectRegion).toHaveBeenCalledWith('EU')
  })

  it('counts facts rather than countries, so the bar moves every session', () => {
    render(<ExploreScreen world={world()} loading={false} onSelectRegion={() => {}} />)
    expect(screen.getByText('3 of 8 learned')).toBeTruthy()
  })

  it('says how many reviews are waiting, and says so plainly when none are', () => {
    render(<ExploreScreen world={world()} loading={false} onSelectRegion={() => {}} />)
    expect(screen.getByText('2 reviews due')).toBeTruthy()
  })

  it('does not tell a user they are up to date on a continent they have never opened', () => {
    // This test previously asserted the bug. Asia in the fixture is 0 of 2 learned with
    // 0 due, and "no reviews waiting" rendered as "Up to date" — which beside "0 of 2
    // learned" reads as "you have finished this", on the one screen whose entire job is
    // to invite. Zero due only means "caught up" once something has been started.
    //
    // The replacement for that was "Not started yet", which was the third line on the
    // tile to mean zero. It now names the continent's size — the only number here the
    // user does not already have from the two lines above it.
    render(<ExploreScreen world={world()} loading={false} onSelectRegion={() => {}} />)
    expect(screen.getByText('1 country to meet')).toBeTruthy()
    expect(screen.queryByText('Up to date')).toBeNull()
    expect(screen.queryByText('Not started yet')).toBeNull()
  })

  it('still says "up to date" once there is something to be up to date on', () => {
    // The other half, so the fix cannot be "delete the caught-up state". A continent
    // with facts learned and nothing due is genuinely caught up and should say so.
    const caughtUp = world({
      regions: [
        {
          region: 'EU',
          entitiesTotal: 4,
          entitiesComplete: 2,
          entitiesStarted: 4,
          factsTotal: 8,
          factsLearned: 8,
          factsDue: 0,
          fraction: 1,
        },
      ],
    })
    render(<ExploreScreen world={caughtUp} loading={false} onSelectRegion={() => {}} />)
    expect(screen.getByText('Up to date')).toBeTruthy()
  })

  it('shows a skeleton while loading', () => {
    const { container } = render(<ExploreScreen world={null} loading onSelectRegion={() => {}} />)
    expect(container.querySelector('[aria-label="Loading"]')).toBeTruthy()
  })

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = render(
      <ExploreScreen world={world()} loading={false} onSelectRegion={() => {}} />,
    )
    expect(container.textContent).not.toMatch(/\b[a-z]+:[a-z][a-zA-Z0-9.]+/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})
