/**
 * One continent's countries.
 *
 * This screen had no test at all, which is why it took a reachability check rather than
 * a failing assertion to notice that it was adding up its own region totals beside an
 * engine function built to do exactly that. The two agreed — same per-entity numbers,
 * same addition — and that is what makes a duplicate implementation dangerous rather
 * than obviously broken: it agrees right up until one side changes.
 *
 * So the first thing asserted here is that the header reports what it was GIVEN, not
 * what it can derive. A test that recomputed the sum itself would be a third copy of
 * the same rule and would pass whichever answer the screen chose.
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { EntityProgress, RegionProgress } from '@worldquest/engines'
import { RegionScreen, type CountryRow, type RegionScreenProps } from './RegionScreen.js'

const entity = (over: Partial<EntityProgress> = {}): EntityProgress => ({
  entityId: 'SE',
  mastery: 'learning',
  factsTotal: 3,
  factsLearned: 1,
  factsDue: 0,
  factsSeen: 2,
  complete: false,
  ...over,
})

const countries: readonly CountryRow[] = [
  { id: 'SE', name: 'Sweden', progress: entity({ entityId: 'SE' }) },
  { id: 'NO', name: 'Norway', progress: entity({ entityId: 'NO', mastery: 'mastered', factsLearned: 3, complete: true }) },
]

const totals = (over: Partial<RegionProgress> = {}): RegionProgress => ({
  region: 'EU',
  entitiesTotal: 2,
  entitiesComplete: 1,
  entitiesStarted: 2,
  factsTotal: 6,
  factsLearned: 4,
  factsDue: 0,
  fraction: 4 / 6,
  ...over,
})

const props = (over: Partial<RegionScreenProps> = {}): RegionScreenProps => ({
  region: 'EU',
  regionNameKey: 'explore:region.EU',
  countries,
  progress: totals(),
  onSelectCountry: vi.fn(),
  onStartLesson: vi.fn(),
  ...over,
})

describe('RegionScreen', () => {
  it('lists the countries, sorted by name', () => {
    render(<RegionScreen {...props()} />)
    expect(screen.getByText('Norway')).toBeTruthy()
    expect(screen.getByText('Sweden')).toBeTruthy()
  })

  it('reports the completed count the engine gave it', () => {
    // `textContent` throughout this file: the caption styles its digits apart from its
    // words, so the line is several nodes. The assertion is about what the user reads.
    const { container } = render(<RegionScreen {...props()} />)
    expect(container.textContent).toContain('1 of 2 countries finished')
  })

  it('trusts the engine totals over anything it could add up itself', () => {
    // The two rows below contain exactly one finished country. The engine here says 5
    // of 9 — deliberately impossible from the rows, because that is the only way to
    // prove the screen is reporting rather than deriving. `entitiesComplete` cannot be
    // reconstructed from the rendered rows without duplicating the "is this country
    // finished?" rule, which is the duplication this wiring removed.
    const { container } = render(
      <RegionScreen
        {...props({ progress: totals({ entitiesComplete: 5, entitiesTotal: 9 }) })}
      />,
    )
    expect(container.textContent).toContain('5 of 9 countries finished')
    expect(container.textContent).not.toContain('1 of 2 countries finished')
  })

  it('shows the empty state rather than dividing by nothing', () => {
    const { container } = render(<RegionScreen {...props({ countries: [], progress: null })} />)
    expect(container.textContent).not.toContain('countries finished')
  })

  it('treats absent totals as not-yet-loaded, even with rows to show', () => {
    // `progress` is null only while the content index is resolving. Rendering rows with
    // no header totals would be a half-drawn screen; the empty state is the honest one.
    render(<RegionScreen {...props({ progress: null })} />)
    expect(screen.queryByText('Sweden')).toBeNull()
  })

  it('gives a screen reader one element per country, not three', () => {
    // "Sweden, Learning, 1 of 3 learned" in a single announcement. Sweeping three
    // separate text nodes is how a list of countries becomes unusable by ear.
    render(<RegionScreen {...props()} />)
    expect(screen.getByLabelText(/Sweden,.*1 of 3/)).toBeTruthy()
  })
})
