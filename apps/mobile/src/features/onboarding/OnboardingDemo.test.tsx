import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OnboardingDemo } from './OnboardingDemo.js'

afterEach(cleanup)

describe('first discovery', () => {
  it('teaches before testing, locks the first verdict and leaves progression explicit', () => {
    const next = vi.fn()
    render(<OnboardingDemo onContinue={next} onBack={vi.fn()} />)
    expect(screen.getByText('United States')).toBeTruthy()
    expect(screen.queryAllByTestId('answer-option')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Try it' }))
    fireEvent.click(screen.getByRole('button', { name: 'Canada' }))
    expect(screen.getByText('This is United States.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'United States' }))
    expect(screen.getByText('This is United States.')).toBeTruthy()
    expect(next).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(next).toHaveBeenCalledOnce()
  })

  it('gives immediate correct feedback without creating a scored lesson', () => {
    render(<OnboardingDemo onContinue={vi.fn()} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try it' }))
    fireEvent.click(screen.getByRole('button', { name: 'United States' }))
    expect(screen.getByText('Yes, United States!')).toBeTruthy()
    expect(screen.getByText('Just practice. No hearts lost, no score.')).toBeTruthy()
  })
})
