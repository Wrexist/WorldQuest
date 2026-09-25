import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    const onSend = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    render(<ReportSheet onSend={onSend} onClose={() => {}} />)
    fireEvent.click(screen.getByLabelText('It\'s out of date'))
    fireEvent.click(screen.getByText('Send report'))
    // Longer than the one-second default: two rejected-then-resolved round trips, and on
    // a machine running e2e alongside, the first re-render alone has taken over a second.
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 5_000 })
    fireEvent.click(screen.getByText('Send report'))
    await waitFor(() => expect(screen.getByText('Thank you')).toBeTruthy(), { timeout: 5_000 })
    expect(onSend).toHaveBeenLastCalledWith('outdated')
  })

  it('can be left without sending anything', () => {
    const onClose = vi.fn()
    render(<ReportSheet onSend={async () => {}} onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
