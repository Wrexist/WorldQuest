import { ApiError } from './contracts'
import type { MailDelivery, VerificationMail } from './email-provider'
import en from '../../i18n/locales/en/account.json'
import sv from '../../i18n/locales/sv/account.json'

/**
 * Verification codes by email, through Resend (docs/engineering/account-email-setup.md).
 *
 * Used only when both `RESEND_API_KEY` and `MAIL_FROM` are configured; otherwise the
 * Worker keeps answering `EMAIL_UNAVAILABLE`, which the app already explains. The copy
 * comes from the app's own locale files, so a code email and the screen asking for it
 * are translated, reviewed and changed together.
 *
 * What is sent is the minimum: the eight-digit code, what it is for, and that it expires
 * in five minutes. No links (a code is typed, never clicked), no images, no tracking
 * pixels; open and click tracking stay off in the Resend domain settings. Nothing about
 * the message is logged here, and a provider error is reported as a code, never with
 * the address or the code in it.
 */

type Copy = Record<string, string>
const COPY: Record<VerificationMail['locale'], Copy> = { en: en as Copy, sv: sv as Copy }

export function verificationMessage(message: VerificationMail) {
  const copy = COPY[message.locale]
  const read = (key: string) => {
    const value = copy[key]
    if (typeof value !== 'string') throw new Error(`Missing email copy: ${key}`)
    return value
  }
  const subject = read(`account:mail.${message.purpose}.subject`)
  const lines = [
    read(`account:mail.${message.purpose}.body`),
    '',
    message.code.replace(/(\d{4})(\d{4})/, '$1 $2'),
    '',
    read('account:mail.expiry'),
    read('account:mail.ignore'),
  ]
  const text = lines.join('\n')
  const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  const html = [
    `<p>${escape(lines[0]!)}</p>`,
    `<p style="font-size:28px;font-weight:700;letter-spacing:4px">${escape(lines[2]!)}</p>`,
    `<p>${escape(lines[4]!)}</p>`,
    `<p>${escape(lines[5]!)}</p>`,
  ].join('')
  return { subject, text, html }
}

export function resendMail(options: { apiKey: string; from: string; fetch?: typeof fetch }): MailDelivery {
  const send = options.fetch ?? fetch
  return {
    async send(message) {
      const { subject, text, html } = verificationMessage(message)
      let response: Response
      try {
        response = await send('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: options.from, to: [message.email], subject, text, html }),
        })
      } catch {
        throw new ApiError('EMAIL_UNAVAILABLE', 503)
      }
      // Any refusal (quota, a suspended key, a bad address) is the same thing to the
      // learner: the code did not go. The app shows its delivery-failure state.
      if (!response.ok) throw new ApiError('EMAIL_UNAVAILABLE', 503)
    },
  }
}
