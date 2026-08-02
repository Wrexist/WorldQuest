import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Paused } from './Paused.js'

const renderPaused = (answered: number) => {
  const onResume = vi.fn()
  const onFinish = vi.fn()
  const view = render(<Paused answered={answered} onResume={onResume} onFinish={onFinish} />)
  return { ...view, onResume, onFinish }
}

describe('Paused', () => {
  it('never threatens the user with losing progress', () => {
    // ABANDON keeps and submits every answer already given, so there is nothing to
    // lose — and inventing that threat to keep someone in a lesson is exactly the
    // dark pattern this product refuses.
    // Matches the THREAT, not the word "lost" — the empty-state copy is "Nothing is
    // lost", and a blunt keyword ban would reject the reassurance it exists to
    // protect. Both branches are checked, because they say different things.
    const threat = /you'?ll lose|will lose|will be lost|lose your|are you sure|discard|start over|progress will/i
    for (const answered of [0, 4]) {
      const { container, unmount } = renderPaused(answered)
      expect(container.textContent).not.toMatch(threat)
      unmount()
    }
  })

  it('names how many answers are kept, rather than reassuring vaguely', () => {
    // A count can be checked against what the user remembers doing. "Your progress is
    // safe" is what an app says right before losing it.
    renderPaused(4)
    expect(screen.getByText(/4 answers are saved/i)).toBeTruthy()
  })

  it('handles the singular without reading like a template', () => {
    renderPaused(1)
    expect(screen.getByText(/1 answer is saved/i)).toBeTruthy()
  })

  it('says something sensible before anything has been answered', () => {
    renderPaused(0)
    expect(screen.getByText(/Nothing is lost/i)).toBeTruthy()
    expect(screen.queryByText(/0 answers/)).toBeNull()
  })

  it('makes resuming the primary action', () => {
    // Most taps of a close button want this.
    const { onResume } = renderPaused(2)
    fireEvent.click(screen.getByRole('button', { name: 'Keep going' }))
    expect(onResume).toHaveBeenCalledOnce()
  })

  it('lets the user leave, and does not frame it as quitting', () => {
    const { onFinish, container } = renderPaused(2)
    fireEvent.click(screen.getByRole('button', { name: 'Finish here' }))
    expect(onFinish).toHaveBeenCalledOnce()
    expect(container.textContent).not.toMatch(/quit|give up|abandon|really leave/i)
  })

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = renderPaused(3)
    expect(container.textContent).not.toMatch(/\blesson:[a-z]/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})
