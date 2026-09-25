/**
 * One badge, one card: the medal, what it is called, its tier in words, and what it took.
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { withFullMotion } from '../../test/setup.js'
import { AchievementUnlocked } from './AchievementUnlocked.js'
import { CATALOGUE } from './useAchievements.js'

const flags = CATALOGUE.find((def) => def.id === 'ach.flags.collector')!
const unlock = { achievementId: flags.id, tier: 'bronze' as const }

describe('AchievementUnlocked', () => {
  it('names the badge as the heading, with its tier in words and what it took', () => {
    render(<AchievementUnlocked unlock={unlock} onContinue={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Flag Collector' })).toBeTruthy()
    expect(screen.getByText('New badge')).toBeTruthy()
    // The tier as a WORD — its colour is the second signal, never the only one.
    expect(screen.getByText('Bronze')).toBeTruthy()
    expect(
      screen.getByText(`Master the flag of ${flags.tiers[0]!.threshold} countries.`),
    ).toBeTruthy()
  })

  it('never shows a raw key where a name belongs', () => {
    const { container } = render(<AchievementUnlocked unlock={unlock} onContinue={() => {}} />)
    expect(container.textContent).not.toMatch(/achievements:|ach\./)
  })

  it('leads with one button, live from the first frame', () => {
    const onContinue = vi.fn()
    render(<AchievementUnlocked unlock={unlock} onContinue={onContinue} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('counts the badges past the last card, and says where to find them', () => {
    render(<AchievementUnlocked unlock={unlock} more={2} onContinue={() => {}} />)
    expect(screen.getByTestId('achievement-more').textContent).toBe(
      'And 2 more badges — find them in Achievements',
    )
  })

  it('says nothing about more when there are none', () => {
    render(<AchievementUnlocked unlock={unlock} onContinue={() => {}} />)
    expect(screen.queryByTestId('achievement-more')).toBeNull()
  })

  it('makes no claim about XP or coins it cannot promise were paid', () => {
    const { container } = render(<AchievementUnlocked unlock={unlock} onContinue={() => {}} />)
    expect(container.textContent).not.toMatch(/XP|coin/i)
  })

  it('mounts on the animated path too', () => {
    withFullMotion(() => {
      const onContinue = vi.fn()
      render(<AchievementUnlocked unlock={unlock} onContinue={onContinue} />)
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
      expect(onContinue).toHaveBeenCalledOnce()
    })
  })
})
