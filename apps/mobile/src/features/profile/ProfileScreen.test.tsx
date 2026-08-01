import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { WorldProgress } from '@worldquest/engines'
import { ProfileScreen, type ProfileStats } from './ProfileScreen.js'

const stats: ProfileStats = {
  xpTotal: 4820,
  coins: 430,
  streak: 12,
  longestStreak: 31,
  factsMastered: 7,
}

const world: WorldProgress = {
  regions: [
    {
      region: 'EU',
      entitiesTotal: 4,
      entitiesComplete: 2,
      entitiesStarted: 4,
      factsTotal: 8,
      factsLearned: 6,
      factsDue: 1,
      fraction: 0.75,
    },
    {
      region: 'AF',
      entitiesTotal: 0,
      entitiesComplete: 0,
      entitiesStarted: 0,
      factsTotal: 0,
      factsLearned: 0,
      factsDue: 0,
      fraction: 0,
    },
  ],
  entitiesTotal: 4,
  entitiesComplete: 2,
  factsTotal: 8,
  factsLearned: 6,
  factsDue: 1,
  fraction: 0.75,
}

describe('Profile — the five states', () => {
  it('renders real numbers', () => {
    render(<ProfileScreen stats={stats} world={world} loading={false} />)
    expect(screen.getByLabelText('Total XP, 4.8K')).toBeTruthy()
    expect(screen.getByLabelText('Day streak, 12')).toBeTruthy()
    expect(screen.getByLabelText('Best streak, 31')).toBeTruthy()
  })

  it('shows a skeleton while loading', () => {
    const { container } = render(<ProfileScreen stats={null} world={null} loading />)
    expect(container.querySelector('[aria-label="Loading"]')).toBeTruthy()
  })

  it('shows an empty state rather than a wall of zeros on a first launch', () => {
    // "0 XP, 0 coins, 0 streak, 0 mastered" is a worse first impression than a
    // sentence saying where the numbers will come from.
    render(<ProfileScreen stats={null} world={null} loading={false} />)
    expect(screen.getByText('Nothing to show yet')).toBeTruthy()
    expect(screen.queryByLabelText(/Total XP/)).toBeNull()
  })

  it('treats a zeroed user as empty too', () => {
    render(
      <ProfileScreen
        stats={{ xpTotal: 0, coins: 0, streak: 0, longestStreak: 0, factsMastered: 0 }}
        world={null}
        loading={false}
      />,
    )
    expect(screen.getByText('Nothing to show yet')).toBeTruthy()
  })
})

describe('Profile — the level curve', () => {
  it('shows the distance to the next level from the real curve', () => {
    // The mockup shows `12,850 / 15,000 XP`, which corresponds to no coherent
    // progression. This uses `50·n^1.9`.
    render(<ProfileScreen stats={stats} world={world} loading={false} />)
    expect(screen.getByText(/XP to level 12/)).toBeTruthy()
  })
})

describe('Profile — the world section', () => {
  it('omits continents with no content', () => {
    // Explore is the map of what exists; Profile is the record of what the user has
    // done. An empty bar is not a record of anything.
    render(<ProfileScreen stats={stats} world={world} loading={false} />)
    expect(screen.getByText('Europe')).toBeTruthy()
    expect(screen.queryByText('Africa')).toBeNull()
  })

  it('is absent entirely when there is no local progress to show', () => {
    // Rendering it from empty memory would put "7 facts mastered" from the server
    // directly above "0 of 10 learned" from here — two truths on one screen.
    render(<ProfileScreen stats={stats} world={null} loading={false} />)
    expect(screen.queryByText('Your world')).toBeNull()
    expect(screen.getByLabelText('Total XP, 4.8K')).toBeTruthy()
  })
})

describe('Profile — the account prompt', () => {
  it('says what an account is FOR', () => {
    // "Sign up to continue" treats a user's progress as leverage against them.
    render(
      <ProfileScreen stats={stats} world={world} loading={false} onCreateAccount={() => {}} />,
    )
    expect(screen.getByText(/keeps your streak safe/)).toBeTruthy()
  })

  it('disappears once there is nothing to prompt about', () => {
    render(<ProfileScreen stats={stats} world={world} loading={false} />)
    expect(screen.queryByText('Save your progress')).toBeNull()
  })

  it('calls back when taken up', () => {
    const onCreateAccount = vi.fn()
    render(
      <ProfileScreen stats={stats} world={world} loading={false} onCreateAccount={onCreateAccount} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    expect(onCreateAccount).toHaveBeenCalledOnce()
  })
})

describe('Profile — copy', () => {
  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = render(<ProfileScreen stats={stats} world={world} loading={false} />)
    expect(container.textContent).not.toMatch(/\b[a-z]+:[a-z][a-zA-Z0-9.]+/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})
