/**
 * The streak card on Home — what it says, and everything it is careful not to.
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { REPAIR_PRICE } from '@worldquest/engines'
import { HomeScreen } from '../home/HomeScreen.js'
import { StreakNoticeCard } from './StreakNoticeCard.js'

const freeze = { kind: 'freeze', id: 'freeze:2026-09-24', streak: 12 } as const
const repairable = { kind: 'repair', id: 'repair:2026-09-24', streak: 10, price: REPAIR_PRICE } as const

/** Words whose only job is anxiety, and every shape a countdown takes. */
const PRESSURE = /lose|lost|missed|hurry|last chance|too late|expires|hours?\b|minutes?\b|left\b|don'?t/i

describe('StreakNoticeCard — the freeze', () => {
  it('says what the freeze did, and offers only a way to put the card away', () => {
    const onDismiss = vi.fn()
    render(<StreakNoticeCard notice={freeze} onDismiss={onDismiss} onOpenStreak={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Your streak freeze kept your 12 day streak' })).toBeTruthy()
    expect(screen.getByText('It covered yesterday for you.')).toBeTruthy()
    // No purchase is suggested on the back of a freeze being used.
    expect(screen.queryByRole('button', { name: 'Bring it back' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('carries no pressure', () => {
    const { container } = render(<StreakNoticeCard notice={freeze} onDismiss={() => {}} />)
    expect(container.textContent).not.toMatch(PRESSURE)
  })
})

describe('StreakNoticeCard — the repair', () => {
  it('names the streak and the price, and opens the streak screen rather than buying', () => {
    const onOpenStreak = vi.fn()
    render(<StreakNoticeCard notice={repairable} onDismiss={() => {}} onOpenStreak={onOpenStreak} />)
    expect(screen.getByRole('heading', { name: 'You can bring back your 10 day streak' })).toBeTruthy()
    expect(screen.getByText('A repair costs ' + REPAIR_PRICE + ' coins.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Bring it back' }))
    expect(onOpenStreak).toHaveBeenCalledOnce()
  })

  it('carries no countdown and no loss words', () => {
    const { container } = render(
      <StreakNoticeCard notice={repairable} onDismiss={() => {}} onOpenStreak={() => {}} />,
    )
    expect(container.textContent).not.toMatch(PRESSURE)
  })

  it('can always be put away', () => {
    const onDismiss = vi.fn()
    render(<StreakNoticeCard notice={repairable} onDismiss={onDismiss} onOpenStreak={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})

describe('Home, with and without the card', () => {
  const home = { progress: { xpTotal: 40, coins: 700, streak: 12 }, loading: false, isOffline: false }

  it('draws the card when the route hands one over', () => {
    render(
      <HomeScreen
        {...home}
        onPlayQuest={() => {}}
        streakNotice={{ notice: freeze, onDismiss: () => {} }}
      />,
    )
    expect(screen.getByTestId('streak-notice-freeze')).toBeTruthy()
  })

  it('is simply absent otherwise — no placeholder, no empty card', () => {
    render(<HomeScreen {...home} onPlayQuest={() => {}} />)
    expect(screen.queryByTestId('streak-notice-freeze')).toBeNull()
    expect(screen.queryByTestId('streak-notice-repair')).toBeNull()
  })
})
