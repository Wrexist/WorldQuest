import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './identity-schema'

export interface VerificationMail { email: string; code: string; locale: 'en' | 'sv'; purpose: 'link' | 'login' | 'delete' }
export interface MailDelivery { send(message: VerificationMail): Promise<void> }

/** Server-only provider. Its HTTP handler and session-issuing APIs are never exposed. */
export function emailProvider(db: D1Database, secret: string, challengeId: string) {
  if (secret.length < 32) throw new Error('Auth secret unavailable')
  if (!/^[a-f0-9]{64}$/.test(challengeId)) throw new Error('Invalid verification context')
  return betterAuth({
    appName: 'WorldQuest', baseURL: 'https://identity.worldquest.invalid', secret,
    database: drizzleAdapter(drizzle(db, { schema }), { provider: 'sqlite', schema, transaction: false }),
    telemetry: { enabled: false }, logger: { disabled: true },
    // Every gateway call uses one immutable owner/purpose challenge. Scope the
    // provider's verification row and code MAC to it, including concurrent sends.
    verification: { storeIdentifier: { hash: async () => challengeId } },
    emailVerification: { autoSignInAfterVerification: false },
    plugins: [emailOTP({ otpLength: 8, expiresIn: 300, allowedAttempts: 3,
      storeOTP: { hash: async code => {
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
          { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
        const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${challengeId}:${code}`))
        return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
      } },
      // Delivery occurs in our owner/purpose-bound gateway; never log or send here.
      sendVerificationOTP: async () => { throw new Error('Use the account gateway') },
    })],
  })
}
