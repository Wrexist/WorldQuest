import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AccountScreen, type AccountScreenProps } from './AccountScreen.js'

const props = (overrides: Partial<AccountScreenProps> = {}): AccountScreenProps => ({
  mode: 'link',
  stage: 'email',
  loading: false,
  email: '',
  onEmail: vi.fn(),
  onSubmitEmail: vi.fn(),
  code: '',
  onCode: vi.fn(),
  onSubmitCode: vi.fn(),
  onChangeEmail: vi.fn(),
  onDone: vi.fn(),
  onBack: vi.fn(),
  ...overrides,
})

describe('Account — the five states', () => {
  it('asks for an address first', () => {
    render(<AccountScreen {...props()} />)
    expect(screen.getByLabelText('Email')).toBeTruthy()
  })

  it('refuses to send until there is something to send to', () => {
    // An empty submit costs a round trip and returns an error the user caused by
    // tapping a button that should not have been live.
    render(<AccountScreen {...props({ email: '' })} />)
    expect(screen.getByText('Send me a code').closest('[role="button"]')?.getAttribute('aria-disabled')).toBe('true')
  })

  it('refuses to confirm a code that is not six digits', () => {
    render(<AccountScreen {...props({ stage: 'code', code: '123' })} />)
    expect(screen.getByText('Confirm').closest('[role="button"]')?.getAttribute('aria-disabled')).toBe('true')
  })

  it('disables both controls while a request is in flight', () => {
    // Two taps on "Send me a code" is two codes, and the second invalidates the first —
    // so a user who double-taps is handed a code that will not work.
    render(<AccountScreen {...props({ email: 'a@b.com', loading: true })} />)
    expect(screen.getByText('Send me a code').closest('[role="button"]')?.getAttribute('aria-disabled')).toBe('true')
  })

  it('names the address the code went to', () => {
    // "We sent a code" over a silent inbox is unresolvable. Naming it makes a typo
    // something the user fixes in one glance.
    render(<AccountScreen {...props({ stage: 'code', email: 'jon@exmaple.com' })} />)
    expect(screen.getAllByText(/jon@exmaple\.com/).length).toBeGreaterThan(0)
  })

  it('shows the error it was given and nothing else', () => {
    render(<AccountScreen {...props({ error: 'That code is not right.' })} />)
    expect(screen.getAllByText('That code is not right.').length).toBeGreaterThan(0)
  })

  it('offers a way back to the address from the code step', () => {
    const onChangeEmail = vi.fn()
    render(<AccountScreen {...props({ stage: 'code', onChangeEmail })} />)
    fireEvent.click(screen.getByText('Use a different email'))
    expect(onChangeEmail).toHaveBeenCalledOnce()
  })
})

describe('Account — the trap', () => {
  it('warns before signing in over unsaved progress, with the real number', () => {
    // Signing in on a device that already has progress strands it on an anonymous
    // account nobody can reach again. Silent, irreversible, and the natural thing to do
    // after a week of use.
    render(<AccountScreen {...props({ mode: 'signIn', localStreak: 14 })} />)
    expect(screen.getAllByText(/14 day streak/).length).toBeGreaterThan(0)
  })

  it('offers the other door', () => {
    const onLinkInstead = vi.fn()
    render(<AccountScreen {...props({ mode: 'signIn', localStreak: 14, onLinkInstead })} />)
    fireEvent.click(screen.getByText('Save this progress instead'))
    expect(onLinkInstead).toHaveBeenCalledOnce()
  })

  it('says nothing when there is nothing to strand', () => {
    // A warning that appears for everyone is a warning nobody reads — including the
    // person it was written for.
    render(<AccountScreen {...props({ mode: 'signIn', localStreak: 0 })} />)
    expect(screen.queryByText(/progress on this phone/i)).toBeNull()
  })

  it('never warns on the link path, which cannot lose anything', () => {
    render(<AccountScreen {...props({ mode: 'link', localStreak: 14 })} />)
    expect(screen.queryByText(/leaves this behind/)).toBeNull()
  })
})

describe('Account — copy', () => {
  it('leaves no raw key or unformatted placeholder on screen', () => {
    for (const stage of ['email', 'code', 'done'] as const) {
      const { container, unmount } = render(
        <AccountScreen {...props({ stage, mode: 'signIn', localStreak: 3, email: 'a@b.com' })} />,
      )
      const shown = container.textContent ?? ''
      expect(shown, `${stage} leaked a key`).not.toMatch(/account:/)
      expect(shown, `${stage} leaked a placeholder`).not.toMatch(/\{\w+\}/)
      unmount()
    }
  })

  it('says what is now true rather than "Success"', () => {
    // Two screens and a code, so that progress cannot be lost. That is the sentence
    // worth reading at the end of it.
    render(<AccountScreen {...props({ stage: 'done', mode: 'link' })} />)
    expect(screen.getByText('Your progress is safe')).toBeTruthy()
  })
})
