import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Text } from 'react-native'
import { ErrorBoundary } from './ErrorBoundary.js'

/**
 * React logs caught errors to console.error regardless of the boundary, which floods
 * the run with stack traces for tests that are passing. Silenced per-test rather than
 * globally, so a genuine error elsewhere still surfaces.
 */
let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  consoleError.mockRestore()
})

function Boom({ throws }: { throws: boolean }) {
  if (throws) throw new Error('the map exploded')
  return <Text>the app</Text>
}

describe('ErrorBoundary', () => {
  it('renders its children when nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <Boom throws={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('the app')).toBeTruthy()
  })

  it('catches a render crash instead of unmounting the tree', () => {
    // Without this, an uncaught error is a red box in development and a WHITE
    // SCREEN in production, with no way out but force-quitting. A user who has to
    // force-quit once usually does not open the app twice.
    render(
      <ErrorBoundary>
        <Boom throws />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something broke on our side')).toBeTruthy()
  })

  it('tells the user their progress is safe', () => {
    // The single most useful sentence on a crash screen. Everything is on device.
    render(
      <ErrorBoundary>
        <Boom throws />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/nothing you have learned is lost/)).toBeTruthy()
  })

  it('offers a way out that remounts rather than reloads', () => {
    function Flaky() {
      if (!recovered) throw new Error('once')
      return <Text>recovered</Text>
    }
    let recovered = false

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something broke on our side')).toBeTruthy()

    recovered = true
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('recovered')).toBeTruthy()
  })

  it('logs the crash so it can be fixed', () => {
    render(
      <ErrorBoundary>
        <Boom throws />
      </ErrorBoundary>,
    )
    expect(consoleError).toHaveBeenCalledWith(
      '[crash]',
      expect.objectContaining({ message: 'the map exploded' }),
      expect.anything(),
    )
  })

  it('shows the technical detail in development only', () => {
    // A user is not helped by a stack trace, and shipping one leaks file paths and
    // sometimes data into a screenshot they post publicly. `__DEV__` is true here.
    render(
      <ErrorBoundary>
        <Boom throws />
      </ErrorBoundary>,
    )
    expect(screen.getByText('the map exploded')).toBeTruthy()
  })

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = render(
      <ErrorBoundary>
        <Boom throws />
      </ErrorBoundary>,
    )
    expect(container.textContent).not.toMatch(/\berrors:[a-z]/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})
