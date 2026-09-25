import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BALANCE } from '@worldquest/engines'
import { StreakExtended } from './StreakExtended.js'

const week = Array.from({ length: 7 }, (_, i) => ({ day: 'MTWTFSS'[i]!, count: i === 6 ? 1 : 0 }))

describe('StreakExtended', () => {
  it('names the streak once for a screen reader and leads with one button', () => {
    const onContinue = vi.fn()
    render(<StreakExtended streak={4} week={week} onContinue={onContinue} />)
    expect(screen.getByLabelText('4 day streak')).toBeTruthy()
    expect(screen.getByText('Today counts. Nice work.')).toBeTruthy()
    fireEvent.click(screen.getByText('Continue'))
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('explains the rule on day one and never threatens tomorrow', () => {
    const { container } = render(<StreakExtended streak={1} week={week} onContinue={() => {}} />)
    expect(container.textContent).toMatch(/You started a streak/)
    expect(container.textContent).not.toMatch(/lose|don't break|tomorrow or/i)
  })

  it('shows the milestone only when the server pays one', () => {
    const plain = render(<StreakExtended streak={3} week={week} onContinue={() => {}} />)
    expect(plain.container.textContent).not.toMatch(/milestone/i)
    render(
      <StreakExtended streak={7} week={week} milestoneXp={BALANCE.xp.streakMilestones[7]} onContinue={() => {}} />,
    )
    expect(screen.getByText(`7 days — milestone! +${BALANCE.xp.streakMilestones[7]} XP`)).toBeTruthy()
  })
})
