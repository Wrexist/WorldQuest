import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TypedAnswer, type TypedState } from './TypedAnswer.js'

const field = (): HTMLInputElement => screen.getByTestId('typed-answer') as HTMLInputElement

const renderField = (over: Partial<{ value: string; state: TypedState }> = {}) => {
  const onChange = vi.fn()
  const onSubmit = vi.fn()
  const view = render(
    <TypedAnswer value={over.value ?? ''} onChange={onChange} onSubmit={onSubmit} state={over.state ?? 'idle'} maxLength={60} />,
  )
  return { ...view, onChange, onSubmit }
}

describe('TypedAnswer', () => {
  it('is named, so a screen reader landing on it hears what it is', () => {
    renderField()
    expect(field().getAttribute('aria-label')).toBe('Your answer')
    expect(field().getAttribute('placeholder')).toBe('Type your answer')
  })

  it('reports what is typed', () => {
    const { onChange } = renderField()
    fireEvent.change(field(), { target: { value: 'Stockholm' } })
    expect(onChange).toHaveBeenCalledWith('Stockholm')
  })

  it('submits from the keyboard\'s return key, which is the same as pressing Check', () => {
    const { onSubmit } = renderField({ value: 'Oslo' })
    fireEvent.keyDown(field(), { key: 'Enter', code: 'Enter' })
    expect(onSubmit).toHaveBeenCalled()
  })

  it('answers nothing for the learner: no autocorrect, capitals, spell-check or suggestions', () => {
    renderField()
    expect(field().getAttribute('autocorrect')).toBe('off')
    expect(field().getAttribute('autocapitalize')).toBe('none')
    expect(field().getAttribute('spellcheck')).toBe('false')
    expect(field().getAttribute('autocomplete')).toBe('off')
  })

  it('locks once the answer is in, and says how it went in words as well as colour', () => {
    const { rerender } = renderField({ value: 'Oslo' })
    expect(field().readOnly).toBe(false)
    rerender(<TypedAnswer value="Oslo" onChange={() => {}} onSubmit={() => {}} state="wrong" maxLength={60} />)
    expect(field().readOnly).toBe(true)
    expect(field().getAttribute('aria-label')).toBe('Your answer, not quite')
    rerender(<TypedAnswer value="Oslo" onChange={() => {}} onSubmit={() => {}} state="correct" maxLength={60} />)
    expect(field().getAttribute('aria-label')).toBe('Your answer, correct')
  })

  it('never offers a limit past what the engine takes', () => {
    renderField()
    expect(field().maxLength).toBe(60)
  })
})
