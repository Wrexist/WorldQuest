import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { StreakGemCollection } from './StreakGemCollection.js'

const days = Array.from({ length: 16 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)
describe('streak gem album', () => {
  it('browses every earned day, newest first, without losing older gems', () => {
    render(<StreakGemCollection days={days} />)
    expect(screen.getAllByTestId('collected-streak-gem')).toHaveLength(7)
    expect(screen.getByText('Gems 1–7 of 16')).toBeTruthy()
    expect(screen.getByText('Sep 16, 2026')).toBeTruthy()
    fireEvent.click(screen.getByText('Older gems'))
    expect(screen.getByText('Gems 8–14 of 16')).toBeTruthy()
    fireEvent.click(screen.getByText('Older gems'))
    expect(screen.getAllByTestId('collected-streak-gem')).toHaveLength(2)
    expect(screen.getByText('Sep 1, 2026')).toBeTruthy()
    fireEvent.click(screen.getByText('Newer gems'))
    expect(screen.getByText('Gems 8–14 of 16')).toBeTruthy()
  })
  it('clamps the page if the collection shrinks and offers the empty-state chest', () => {
    const onOpenChest = () => {}
    const { rerender } = render(<StreakGemCollection days={days} />)
    fireEvent.click(screen.getByText('Older gems'))
    rerender(<StreakGemCollection days={[days[0]!]} />)
    expect(screen.getByText('Sep 1, 2026')).toBeTruthy()
    expect(screen.queryByText('Older gems')).toBeNull()
    rerender(<StreakGemCollection days={[]} onOpenChest={onOpenChest} />)
    expect(screen.getByText('Open today’s chest')).toBeTruthy()
    expect(screen.queryByTestId('collected-streak-gem')).toBeNull()
  })
})
