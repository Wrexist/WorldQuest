import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AccessibilityInfo } from 'react-native'
import { GrownUpGate, newQuestion } from './GrownUpGate.js'

/** The field, found the way a screen reader finds it: by the question it answers. */
const field = () => screen.getByLabelText(/^What is \d × \d\?$/) as HTMLInputElement
const answer = (value: string) => fireEvent.change(field(), { target: { value } })

describe('the grown-up gate', () => {
  it('lets the right answer through, and nothing else', () => {
    const onPass = vi.fn()
    render(<GrownUpGate onPass={onPass} onCancel={() => {}} question={{ a: 7, b: 8 }} />)
    expect(screen.getByRole('heading', { name: 'What is 7 × 8?' })).toBeTruthy()
    answer('54')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onPass).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('asks a new question after a wrong answer, so numbers cannot be tried in turn', () => {
    render(<GrownUpGate onPass={() => {}} onCancel={() => {}} question={{ a: 7, b: 8 }} />)
    answer('1')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    // A new random question, which may happen to be the same; the field is cleared either way.
    expect(field().value).toBe('')
  })

  it('says the new question out loud, because it appears without a sound', () => {
    const spoken = vi.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    render(<GrownUpGate onPass={() => {}} onCancel={() => {}} question={{ a: 7, b: 8 }} />)
    answer('1')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    const next = field().getAttribute('aria-label')?.replace(/^What/, 'what')
    expect(spoken).toHaveBeenCalledWith(`That's not it. Here's another one: ${next}`)
    spoken.mockRestore()
  })

  it('passes on the product', () => {
    const onPass = vi.fn()
    render(<GrownUpGate onPass={onPass} onCancel={() => {}} question={{ a: 6, b: 9 }} />)
    answer('54')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onPass).toHaveBeenCalledOnce()
  })

  it('keeps its questions to products an adult knows at a glance', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const q = newQuestion(() => r)
      expect(q.a).toBeGreaterThanOrEqual(6)
      expect(q.a * q.b).toBeLessThanOrEqual(81)
    }
  })
})
