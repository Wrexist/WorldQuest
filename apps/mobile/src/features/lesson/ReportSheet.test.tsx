import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ReportSheet } from './ReportSheet.js'

describe('ReportSheet', () => {
  it('sends only a chosen reason, then says thank you', async () => {
    const onSend = vi.fn(async () => {})
    const onClose = vi.fn()
    render(<ReportSheet onSend={onSend} onClose={onClose} />)
    fireEvent.click(screen.getByText('Send report'))
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('The answer is wrong'))
    fireEvent.click(screen.getByText('Send report'))
    await waitFor(() => expect(screen.getByText('Thank you')).toBeTruthy())
    expect(onSend).toHaveBeenCalledWith('wrong')
    fireEvent.click(screen.getByText('Continue'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('offers no text box: a reason is all it collects', () => {
    const { container } = render(<ReportSheet onSend={async () => {}} onClose={() => {}} />)
    expect(container.querySelector('input, textarea')).toBeNull()
  })

  it('says plainly when sending failed and keeps the choice for a retry', async () => {
    let rejectFirst!: (error: Error) => void
    let resolveRetry!: () => void
    const firstRequest = new Promise<void>((_resolve, reject) => { rejectFirst = reject })
    const retryRequest = new Promise<void>((resolve) => { resolveRetry = resolve })
    const onSend = vi.fn().mockReturnValueOnce(firstRequest).mockReturnValueOnce(retryRequest)
    render(<ReportSheet onSend={onSend} onClose={() => {}} />)
    fireEvent.click(screen.getByLabelText('It\'s out of date'))
    fireEvent.click(screen.getByText('Send report'))
    const sendButton = screen.getByRole('button', { name: 'Send report' })
    expect(sendButton.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(sendButton)
    expect(onSend).toHaveBeenCalledTimes(1)
    // Flush the failed request and Pressable's passive configuration effect together.
    // Seeing the alert alone does not mean its disabled event handler has updated yet.
    await act(async () => { rejectFirst(new Error('offline')) })
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByLabelText("It's out of date").getAttribute('aria-checked')).toBe('true')
    expect(sendButton.getAttribute('aria-disabled')).not.toBe('true')
    fireEvent.click(sendButton)
    expect(onSend).toHaveBeenCalledTimes(2)
    expect(onSend).toHaveBeenLastCalledWith('outdated')
    expect(sendButton.getAttribute('aria-disabled')).toBe('true')
    await act(async () => { resolveRetry() })
    expect(screen.getByText('Thank you')).toBeTruthy()
  })

  it('can be left without sending anything', () => {
    const onClose = vi.fn()
    render(<ReportSheet onSend={async () => {}} onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
