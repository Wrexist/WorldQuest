import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { WorldProgress } from '@worldquest/engines'
import { ExploreScreen } from './ExploreScreen.js'

const sceneSpy = vi.hoisted(() => vi.fn())
vi.mock('../atlas/WorldAtlasView.js', () => ({ WorldAtlasView: ({ onGestureActiveChange, spec }: { onGestureActiveChange?: (active: boolean) => void; spec: unknown }) => {
  sceneSpy(spec)
  return <div data-testid="explore-globe" onMouseDown={() => onGestureActiveChange?.(true)} onMouseUp={() => onGestureActiveChange?.(false)} />
} }))

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
  it('locks only the page during a globe gesture and restores scrolling on release', () => {
    render(<ExploreScreen world={world()} loading={false} onSelectRegion={() => {}} atlas={{ names: { countryName: () => undefined, factValueName: () => undefined } }} />)
    const page = screen.getByTestId('explore-scroll')
    const globe = screen.getByTestId('explore-globe')
    const initialScene = sceneSpy.mock.calls.at(-1)![0]
    expect(getComputedStyle(page).overflowY).not.toBe('hidden')
    fireEvent.mouseDown(globe)
    expect(getComputedStyle(page).overflowY).toBe('hidden')
    expect(sceneSpy.mock.calls.at(-1)![0]).toBe(initialScene)
    fireEvent.mouseUp(globe)
    expect(getComputedStyle(page).overflowY).not.toBe('hidden')
    expect(sceneSpy.mock.calls.at(-1)![0]).toBe(initialScene)
  })
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
    // `container.textContent`, not `getByText`: the caption's digits are styled
    // separately from its words, so the line is several nodes. What matters here is
    // that the user reads "3 of 8 learned" — the DOM shape it arrives in is `Tally`'s
    // business, and asserting it here would make a styling change look like a
    // counting bug.
    const { container } = render(
      <ExploreScreen world={world()} loading={false} onSelectRegion={() => {}} />,
    )
    expect(container.textContent).toContain('3 of 8 learned')
  })

  it('says how many reviews are waiting, and says so plainly when none are', () => {
    // `textContent` for the same reason as the caption above: the digits are styled
    // apart from the words, so the line is more than one node.
    const { container } = render(
      <ExploreScreen world={world()} loading={false} onSelectRegion={() => {}} />,
    )
    expect(container.textContent).toContain('2 reviews due')
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
    const { container } = render(
      <ExploreScreen world={world()} loading={false} onSelectRegion={() => {}} />,
    )
    expect(container.textContent).toContain('1 country to meet')
    expect(container.textContent).not.toContain('Up to date')
    expect(container.textContent).not.toContain('Not started yet')
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
    const { container } = render(
      <ExploreScreen world={caughtUp} loading={false} onSelectRegion={() => {}} />,
    )
    expect(container.textContent).toContain('Up to date')
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


it('searches installed countries and regions, opens real details, and explains no results', () => {
  const onSelectCountry = vi.fn()
  const countries = [{ id: 'SE', name: 'Sweden', region: 'EU', flagPath: 'flags/SE.png', progress: {
    entityId: 'SE', mastery: 'unseen' as const, factsTotal: 3, factsLearned: 0, factsDue: 0, factsSeen: 0, complete: false,
  } }]
  render(<ExploreScreen world={world()} loading={false} countries={countries} onSelectCountry={onSelectCountry} onSelectRegion={() => {}} />)
  fireEvent.change(screen.getByTestId('explore-search'), { target: { value: 'Europe' } })
  expect(screen.getByText('Sweden')).toBeTruthy()
  fireEvent.click(screen.getByText('Sweden'))
  expect(onSelectCountry).toHaveBeenCalledWith('SE')
  fireEvent.change(screen.getByTestId('explore-search'), { target: { value: 'no such country' } })
  expect(screen.getByText('No matching countries. Try another name or region.')).toBeTruthy()
  expect(screen.queryByText('Sweden')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Browse continents' }))
  expect(screen.queryByText('No matching countries. Try another name or region.')).toBeNull()
  expect(screen.getByRole('button', { name: 'Europe, 38% complete' })).toBeTruthy()
})

const country = (id: string, name: string, region = 'EU') => ({
  id, name, region, flagPath: `flags/${id}.png`,
  progress: { entityId: id, mastery: 'unseen' as const, factsTotal: 3, factsLearned: 0, factsDue: 0, factsSeen: 0, complete: false },
})

it('keeps search compact while allowing every match and resets expansion for a new query', () => {
  const countries = [country('ES', 'Spain'), country('FR', 'France'), country('IT', 'Italy'), country('PL', 'Poland'),
    country('SE', 'Sweden'), country('NO', 'Norway'), country('DK', 'Denmark'), country('DE', 'Germany')]
  render(<ExploreScreen world={world()} loading={false} countries={countries} onSelectRegion={() => {}} />)
  const search = screen.getByTestId('explore-search')
  fireEvent.change(search, { target: { value: 'Europe' } })
  expect(screen.queryByRole('button', { name: 'Germany' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Show all 8' }))
  expect(screen.getByRole('button', { name: 'Germany' })).toBeTruthy()
  fireEvent.change(search, { target: { value: 'Germany' } })
  expect(screen.getByRole('button', { name: 'Germany' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Show fewer' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  expect((search as HTMLInputElement).value).toBe('')
  expect(screen.getByText('Your world')).toBeTruthy()
})

it('takes a search selection back to its card, clears a conflicting region and keeps the globe mounted', async () => {
  const onSelectCountry = vi.fn()
  const countries = [country('SE', 'Sweden'), country('JP', 'Japan', 'AS')]
  const names = { countryName: (id: string) => countries.find(row => row.id === id)?.name,
    factValueName: (id: string) => id === 'geo.JP.capital' ? 'Tokyo' : undefined }
  render(<ExploreScreen world={world()} loading={false} countries={countries} atlas={{ names }} onSelectCountry={onSelectCountry} onSelectRegion={() => {}} />)
  const globe = screen.getByTestId('explore-globe')
  fireEvent.click(screen.getByRole('button', { name: 'Europe' }))
  const search = screen.getByTestId('explore-search')
  fireEvent.change(search, { target: { value: 'Japan' } })
  expect(screen.queryByTestId('explore-atlas-browse')).toBeNull()
  const result = screen.getByRole('button', { name: 'Japan' })
  expect(result.compareDocumentPosition(globe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(result)
  expect((search as HTMLInputElement).value).toBe('')
  expect(screen.getByTestId('explore-globe')).toBe(globe)
  expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-selected')).toBe('true')
  expect(screen.getByText('Capital: Tokyo')).toBeTruthy()
  expect(screen.queryByText('Your world')).toBeNull()
  await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('explore-atlas-open')))
  expect(onSelectCountry).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Open Japan' }))
  expect(onSelectCountry).toHaveBeenCalledWith('JP')
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
  expect(screen.getByText('Your world')).toBeTruthy()
})
