import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createD1AuthClient, type D1Account, type D1Challenge, type AuthFetch } from '@worldquest/api/d1-auth'
import { D1AccountScreen } from './D1AccountScreen.js'
import { resetD1AccountFlow, useD1Account, type D1AccountHost, type D1AccountClient } from './useD1Account.js'

const owner = '11111111-1111-4111-8111-111111111111'
const session = { userId: owner, token: 'a'.repeat(64), expiresAt: Date.now() + 30 * 86400000 }
function harness(options: { audience?: D1Account['audience']; linked?: boolean; pending?: boolean; expired?: boolean; missing?: boolean } = {}) {
  // The flow outlives any one screen (it has to survive the remount an identity change
  // causes), so each test starts it fresh, as a cold start would.
  resetD1AccountFlow()
  const values = new Map<string, string>()
  let challenge: D1Challenge = { challengeId: 'b'.repeat(64), expiresAt: Date.now() + 300000, resendAt: Date.now() + 60000, email: 'test@example.invalid', purpose: 'link' }
  const account: D1Account = { userId: owner, audience: options.audience ?? 'eligible', email: options.linked ? challenge.email : null, revision: 1, xp: 42, coins: 7 }
  if (!options.missing) values.set('d1.auth.state.v1', JSON.stringify({ version: 1, session: { ...session, expiresAt: options.expired ? 1 : session.expiresAt }, challenge: options.pending ? challenge : null }))
  const clear = vi.fn(async () => { values.clear() })
  const fetch = vi.fn<AuthFetch>(async (url, init) => {
    const body: unknown = init.body ? JSON.parse(String(init.body)) : null
    let value: unknown = {}
    if (url.endsWith('/renew')) return { ok: false, status: 401, json: async () => ({ error: 'SESSION_EXPIRED' }) }
    if (url.endsWith('/guest')) value = session
    if (url.endsWith('/account')) value = account
    if (url.endsWith('/audience')) { account.audience = 'protected'; value = { audience: 'protected' } }
    if (url.endsWith('/request')) {
      if (body && typeof body === 'object' && 'purpose' in body && (body.purpose === 'link' || body.purpose === 'login' || body.purpose === 'delete')) challenge = { ...challenge, purpose: body.purpose }
      value = challenge
    }
    if (url.endsWith('/resend')) value = challenge
    if (url.endsWith('/verify')) {
      if (!body || typeof body !== 'object' || !('code' in body) || body.code !== '12345678') return { ok: false, status: 400, json: async () => ({ error: 'INVALID_CODE' }) }
      value = challenge.purpose === 'delete' ? { deleted: true } : { ...session, token: 'c'.repeat(64) }
    }
    if (url.endsWith('/delete')) value = { deleted: true }
    return { ok: true, status: 200, json: async () => value }
  })
  const create = () => createD1AuthClient({ baseURL: 'https://api.example.invalid', storage: {
    getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value) }, removeItem: async key => { values.delete(key) },
  }, clearCredentials: clear, fetch, randomBytes: async () => new Uint8Array(32).fill(0xdd) })
  const host: D1AccountHost = { changeIdentity: vi.fn(operation => operation()), recoverSession: vi.fn(async () => create()), finishDeletion: vi.fn(async () => {}), resumeIdentity: vi.fn(async () => {}), deletionPending: () => false }
  return { create, host, fetch, values, clear, account }
}
function App({ client, host, online = true, entry }: { client: D1AccountClient; host: D1AccountHost; online?: boolean; entry?: 'signIn' }) {
  const flow = useD1Account(client, host, 'en', online, entry)
  return <D1AccountScreen flow={flow} online={online} onBack={vi.fn()} onSupport={vi.fn()} onDone={vi.fn()} />
}
const click = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }))
const code = (value: string) => fireEvent.change(screen.getByLabelText('Eight-digit code'), { target: { value } })

describe('D1 account screens with the protected auth transport', () => {
  it('opens on signing in for "I already have an account", on a phone with no session', async () => {
    // It offered "Start your account / Start as guest" to someone who had just said they
    // have one. The device session a sign-in code needs is made without asking.
    const h = harness({ missing: true })
    render(<App client={h.create()} host={h.host} entry="signIn" />)
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByText('Start your account')).toBeNull()
    expect(h.fetch.mock.calls.some(([url]) => String(url).endsWith('/guest'))).toBe(true)
  })

  it('shows the result on the screen that replaces it mid-change', async () => {
    // Every identity change remounts the app (the storage scope moves twice). The flow
    // used to live in the screen, so its replacement began again at "loading" and nobody
    // saw "Your email is linked" or reached the Continue that opens the app.
    const h = harness({ pending: true })
    const client = h.create()
    let view = render(<App client={client} host={h.host} />)
    await screen.findByLabelText('Eight-digit code')
    h.host.changeIdentity = vi.fn(async (operation) => {
      view.unmount()
      view = render(<App client={h.create()} host={h.host} />)
      return operation()
    })
    code('12345678'); click('Confirm')
    expect(await screen.findByText('Your email is linked')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
  })

  it('goes on to signing in past the guest the app made at launch', async () => {
    const h = harness()
    render(<App client={h.create()} host={h.host} entry="signIn" />)
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByText('Your guest account')).toBeNull()
  })

  it('still offers to start an account when opened any other way', async () => {
    const h = harness({ missing: true })
    render(<App client={h.create()} host={h.host} />)
    expect(await screen.findByText('Start your account')).toBeTruthy()
  })

  it('restores a pending challenge after remount, enforces eight digits and preserves resend cooldown', async () => {
    const h = harness({ pending: true })
    const first = render(<App client={h.create()} host={h.host} />)
    await screen.findByLabelText('Eight-digit code')
    code('123456')
    expect(screen.getByRole('button', { name: 'Confirm' }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('button', { name: 'Resend code' }).getAttribute('aria-disabled')).toBe('true')
    first.unmount()
    render(<App client={h.create()} host={h.host} />)
    await screen.findByLabelText('Eight-digit code')
    expect(screen.queryByLabelText('Email')).toBeNull()
    code('12345678'); click('Confirm')
    await screen.findByText('Your email is linked')
    expect(h.host.changeIdentity).toHaveBeenCalledOnce()
  })
  it('does not claim delivery when sending fails and persists the retry context', async () => {
    const h = harness(), client = h.create()
    render(<App client={client} host={h.host} />)
    await screen.findByText('Your guest account'); click('Link your email')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.invalid' } })
    h.fetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'EMAIL_UNAVAILABLE', challengeId: 'b'.repeat(64), expiresAt: Date.now() + 300000, resendAt: Date.now() + 60000 }) })
    click('Send me a code')
    await screen.findByText(/We could not send your email/)
    expect(screen.queryByText(/We sent/)).toBeNull()
    expect(await h.create().pending()).toMatchObject({ purpose: 'link', resendAt: expect.any(Number) })
  })
  it('keeps wrong-code errors recoverable without changing identity', async () => {
    const h = harness({ pending: true })
    render(<App client={h.create()} host={h.host} />)
    await screen.findByLabelText('Eight-digit code'); code('87654321'); click('Confirm')
    await screen.findByText(/That code is invalid or expired/)
    code('12345678'); click('Confirm'); await screen.findByText('Your email is linked')
  })
  it('blocks email collection for protected accounts while allowing deletion', async () => {
    const h = harness({ audience: 'protected' })
    render(<App client={h.create()} host={h.host} />)
    await screen.findByText('Your guest account')
    expect(screen.queryByText('Link your email')).toBeNull()
    click('Delete account'); click('Delete permanently')
    await screen.findByText('Your account is deleted')
    expect(h.values.size).toBe(0)
  })
  it('records age policy on the server before offering email fields', async () => {
    const h = harness({ audience: 'unknown' })
    render(<App client={h.create()} host={h.host} />)
    await screen.findByText('Your guest account'); click('Link your email')
    expect(screen.queryByLabelText('Email')).toBeNull()
    fireEvent.change(screen.getByLabelText('Birth year'), { target: { value: '2016' } }); click('Continue')
    await screen.findByText('Keep learning as a guest')
    expect(screen.queryByLabelText('Email')).toBeNull()
  })
  it('retains expired credentials until the user explicitly chooses recovery', async () => {
    const h = harness({ expired: true })
    render(<App client={h.create()} host={h.host} />)
    await screen.findByText('Sign in again')
    expect(h.host.recoverSession).not.toHaveBeenCalled()
    expect(h.values.size).toBe(1)
    click('Recover with email')
    await waitFor(() => expect(h.host.recoverSession).toHaveBeenCalledOnce())
  })
  it('asks for fresh proof before linked deletion and retries failed credential cleanup', async () => {
    const h = harness({ linked: true })
    render(<App client={h.create()} host={h.host} />)
    await screen.findByText('Your linked account'); click('Delete account')
    expect(screen.queryByRole('button', { name: 'Delete permanently' })).toBeNull()
    click('Send me a code'); await screen.findByLabelText('Eight-digit code')
    h.clear.mockRejectedValueOnce(new Error('device locked'))
    code('12345678'); click('Delete permanently')
    await screen.findByText('Finish removing account access')
    expect(screen.queryByText('Your account is deleted')).toBeNull()
    click('Try again'); await screen.findByText('Your account is deleted')
    expect(h.values.size).toBe(0)
    expect(h.host.finishDeletion).toHaveBeenCalledOnce()
  })
  it('makes no request offline and restores the form when connectivity returns', async () => {
    const h = harness({ pending: true }), client = h.create()
    const view = render(<App client={client} host={h.host} online={false} />)
    await screen.findByText('You are offline')
    expect(h.fetch).not.toHaveBeenCalled()
    view.rerender(<App client={client} host={h.host} />)
    await screen.findByLabelText('Eight-digit code')
  })
  it('starts a missing account only after an explicit guest action', async () => {
    const h = harness({ missing: true })
    render(<App client={h.create()} host={h.host} />)
    await screen.findByText('Start your account')
    expect(h.fetch).not.toHaveBeenCalled()
    click('Start as guest'); await screen.findByText('Your guest account')
  })
  it('finishes owner cleanup after restart when deletion already removed credentials', async () => {
    const h = harness({ missing: true })
    h.host.deletionPending = () => true
    render(<App client={h.create()} host={h.host} />)
    await screen.findByText('Finish removing account access')
    expect(screen.queryByText('Start as guest')).toBeNull()
    click('Try again'); await screen.findByText('Your account is deleted')
    expect(h.host.finishDeletion).toHaveBeenCalledOnce()
  })
})
