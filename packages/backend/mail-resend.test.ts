import { describe, expect, it, vi } from 'vitest'
import { resendMail, verificationMessage } from './src/mail-resend'
import { ApiError } from './src/contracts'

const mail = (purpose: 'link' | 'login' | 'delete', locale: 'en' | 'sv' = 'en') =>
  ({ email: 'learner@example.invalid', code: '12345678', purpose, locale })

describe('verification email', () => {
  it('says what the code is for, in the learner\'s language, and nothing else', () => {
    for (const locale of ['en', 'sv'] as const) {
      for (const purpose of ['link', 'login', 'delete'] as const) {
        const message = verificationMessage(mail(purpose, locale))
        expect(message.subject.length).toBeGreaterThan(0)
        expect(message.text).toContain('1234 5678')
        // A code is typed, never clicked: no links, and so nothing to phish with.
        expect(message.text + message.html).not.toMatch(/https?:|www\./i)
        expect(message.html).toContain('1234 5678')
      }
    }
    expect(verificationMessage(mail('delete')).subject).toMatch(/delet/i)
    expect(verificationMessage(mail('login', 'sv')).subject).toMatch(/inloggning/i)
  })
})

describe('Resend delivery', () => {
  it('sends one plain request with the code, to the learner, from the configured sender', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }))
    await resendMail({ apiKey: 're_test', from: 'WorldQuest <accounts@example.invalid>', fetch }).send(mail('link'))
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['from', 'html', 'subject', 'text', 'to'])
    expect(body).toMatchObject({ from: 'WorldQuest <accounts@example.invalid>', to: ['learner@example.invalid'] })
  })

  it('reports any refusal or outage as EMAIL_UNAVAILABLE, never with the address or code', async () => {
    const refused = resendMail({ apiKey: 're_test', from: 'x@example.invalid',
      fetch: vi.fn(async () => new Response('{"message":"quota exceeded"}', { status: 429 })) })
    const down = resendMail({ apiKey: 're_test', from: 'x@example.invalid', fetch: vi.fn(async () => { throw new TypeError('network') }) })
    for (const delivery of [refused, down]) {
      const error = await delivery.send(mail('login')).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ code: 'EMAIL_UNAVAILABLE', status: 503 })
      expect(String((error as Error).message)).not.toMatch(/learner|12345678/)
    }
  })
})
