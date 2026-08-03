/**
 * The gate exists because `useContent()` could return `status === 'error'` and every
 * browse screen ignored it — so these tests are mostly about the branch existing at
 * all, which is the thing that was missing.
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Text } from 'react-native'
import { ContentGate } from './ContentGate.js'

const child = <Text>the real content</Text>

describe('ContentGate', () => {
  it('renders the content when everything is fine', () => {
    render(
      <ContentGate status="ready" onRetry={() => {}}>
        {child}
      </ContentGate>,
    )
    expect(screen.getByText('the real content')).toBeTruthy()
  })

  it('replaces the content with an explanation and a way out when loading failed', () => {
    render(
      <ContentGate status="error" onRetry={() => {}}>
        {child}
      </ContentGate>,
    )
    // The old behaviour was to render the screen anyway, with no data in it — an empty
    // grid that looked like an empty collection rather than a failure.
    expect(screen.queryByText('the real content')).toBeNull()
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('retries when asked', () => {
    const onRetry = vi.fn()
    render(
      <ContentGate status="error" onRetry={onRetry}>
        {child}
      </ContentGate>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('keeps the content visible offline, and says so', () => {
    render(
      <ContentGate status="ready" onRetry={() => {}} isOffline>
        {child}
      </ContentGate>,
    )
    // Offline is reassurance, not a failure: everything here is local, so the screen
    // must still work. A gate that hid the content offline would be a worse bug than
    // the one it was built to fix.
    expect(screen.getByText('the real content')).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('shows a skeleton while loading only when the screen has none of its own', () => {
    const { rerender } = render(
      <ContentGate status="loading" onRetry={() => {}}>
        {child}
      </ContentGate>,
    )
    // Default: the screen owns its skeleton, so the gate must not steal the render.
    expect(screen.getByText('the real content')).toBeTruthy()

    rerender(
      <ContentGate status="loading" onRetry={() => {}} showLoading>
        {child}
      </ContentGate>,
    )
    expect(screen.queryByText('the real content')).toBeNull()
  })
})
