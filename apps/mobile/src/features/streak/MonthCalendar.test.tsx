import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MonthCalendar } from './MonthCalendar.js'
import { monthActivity } from './monthActivity.js'

const TODAY = new Date(2026, 8, 25, 12)
const month = (log: Record<string, number> = {}) => monthActivity(log, TODAY, 2, 'en-US')

describe('MonthCalendar', () => {
  it('names the month and how many days were learned in it', () => {
    const { container } = render(
      <MonthCalendar month={month({ '2026-09-24': 1, '2026-09-25': 2 })} />,
    )
    expect(screen.getByRole('heading').textContent).toBe('September 2026')
    expect(container.textContent).toContain('2 days this month')
  })

  it('fills the learned days and nothing else', () => {
    render(<MonthCalendar month={month({ '2026-09-02': 1, '2026-09-24': 1, '2026-09-25': 2 })} />)
    expect(screen.getAllByTestId('calendar-day-learned')).toHaveLength(3)
  })

  it('says nothing about a month with no lessons in it yet', () => {
    // The streak screen's heading already reads "No days yet".
    const { container } = render(<MonthCalendar month={month()} />)
    expect(container.textContent).not.toMatch(/days? this month/)
    expect(screen.queryAllByTestId('calendar-day-learned')).toHaveLength(0)
  })

  it('hides the thirty cells from a screen reader, which has the count instead', () => {
    const { container } = render(<MonthCalendar month={month({ '2026-09-25': 1 })} />)
    const hidden = container.querySelector('[aria-hidden="true"]')
    expect(hidden?.textContent).toContain('25')
    expect(hidden?.textContent).not.toContain('September')
  })
})
