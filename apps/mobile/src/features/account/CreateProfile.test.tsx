/**
 * "Create a profile": says what a profile is for, never what you would lose without one.
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { withFullMotion } from '../../test/setup.js'
import { CreateProfile } from './CreateProfile.js'

describe('CreateProfile', () => {
  it('says what a profile is for, starting from the truth that nothing is at risk', () => {
    render(<CreateProfile onCreate={() => {}} onLater={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Create a profile' })).toBeTruthy()
    expect(screen.getByText(/saved on this phone/)).toBeTruthy()
    expect(screen.getByText(/keep it on a new one/)).toBeTruthy()
  })

  it('never frames the ask as a loss, a deadline or a threat', () => {
    const { container } = render(<CreateProfile onCreate={() => {}} onLater={() => {}} />)
    expect(container.textContent).not.toMatch(
      /lose|lost|gone|forever|too late|hurry|last chance|don'?t miss|before it|risk/i,
    )
  })

  it('offers the profile and a way past it, and nothing else', () => {
    const onCreate = vi.fn()
    const onLater = vi.fn()
    render(<CreateProfile onCreate={onCreate} onLater={onLater} />)
    expect(screen.getAllByRole('button')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Create a profile' }))
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(onCreate).toHaveBeenCalledOnce()
    expect(onLater).toHaveBeenCalledOnce()
  })

  it('offline, says why the offer is paused and still lets the learner leave', () => {
    const onCreate = vi.fn()
    const onLater = vi.fn()
    render(<CreateProfile offline onCreate={onCreate} onLater={onLater} />)
    const create = screen.getByRole('button', { name: 'Create a profile' })
    expect(create.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(create)
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/needs a connection/)
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(onLater).toHaveBeenCalledOnce()
  })

  it('mounts on the animated path too, with both buttons live from the first frame', () => {
    withFullMotion(() => {
      const onLater = vi.fn()
      render(<CreateProfile onCreate={() => {}} onLater={onLater} />)
      fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
      expect(onLater).toHaveBeenCalledOnce()
    })
  })
})
