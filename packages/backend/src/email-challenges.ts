import { ApiError } from './contracts'
import { authBudget } from './account-policy'
import { newToken } from './auth'
import { emailProvider, type MailDelivery } from './email-provider'

export interface Challenge {
  id: string; email: string; account_id: string; session_hash: string;
  purpose: 'link' | 'login' | 'delete'; locale: 'en' | 'sv';
  state: 'sending' | 'pending' | 'verifying' | 'verified' | 'consumed';
  attempts: number; sends: number; expires_at: number; sent_at: number
}
export interface ChallengeInput { email: string; purpose: Challenge['purpose']; locale: Challenge['locale'] }
export async function requestCode(db: D1Database, secret: string, mail: MailDelivery, owner: string, session: string, input: ChallengeInput, now: number) {
  const eligible = await db.prepare(`SELECT a.id FROM accounts a JOIN sessions s ON s.account_id=a.id
    WHERE a.id=? AND a.audience='eligible' AND a.deleted_at IS NULL AND s.token_hash=? AND s.expires_at>?`)
    .bind(owner, session, now).first()
  if (!eligible) throw new ApiError('ACCOUNT_PROTECTED', 403)
  await authBudget(db, `email-owner:${owner}`, 10, now)
  const email = input.email.trim().toLowerCase()
  if (input.purpose === 'delete') {
    const linked = await db.prepare(`SELECT u.email FROM identities i JOIN auth_user u ON u.id=i.subject_id WHERE i.account_id=?`).bind(owner).first<{ email: string }>()
    if (linked?.email !== email) throw new ApiError('INVALID_CHALLENGE', 400)
  }
  const id = newToken()
  // One immutable purpose/owner per mailbox during the OTP lifetime. Another
  // account sees the same accepted shape but cannot send, replace or redeem it.
  const challenge = await db.prepare(`INSERT INTO email_challenges
    (id,email,account_id,session_hash,purpose,locale,state,created_at,expires_at,sent_at)
    VALUES (?,?,?,?,?,?,'sending',?,?,?) ON CONFLICT(email) DO UPDATE SET
    id=excluded.id, account_id=excluded.account_id, session_hash=excluded.session_hash,
    purpose=excluded.purpose, locale=excluded.locale, state='sending', attempts=0, sends=1,
    created_at=excluded.created_at, expires_at=excluded.expires_at, sent_at=excluded.sent_at
    WHERE email_challenges.expires_at <= ? OR email_challenges.state='consumed' RETURNING *`)
    .bind(id, email, owner, session, input.purpose, input.locale, now, now + 300_000, now, now).first<Challenge>()
  if (!challenge) return { challengeId: id, expiresAt: now + 300_000, resendAt: now + 60_000 }
  await deliver(db, secret, mail, challenge, now)
  return { challengeId: id, expiresAt: challenge.expires_at, resendAt: challenge.sent_at + 60_000 }
}

export async function resendCode(db: D1Database, secret: string, mail: MailDelivery, owner: string, session: string, id: string, now: number) {
  await authBudget(db, `email-owner:${owner}`, 10, now)
  const c = await db.prepare(`UPDATE email_challenges SET state='sending', sends=sends+1, sent_at=?
    WHERE id=? AND account_id=? AND session_hash=? AND state='pending' AND sends<3 AND attempts<3
    AND sent_at<=? AND expires_at>? RETURNING *`).bind(now, id, owner, session, now - 60_000, now).first<Challenge>()
  if (!c) throw new ApiError('RETRY_LATER', 429)
  await deliver(db, secret, mail, c, now)
  return { challengeId: c.id, expiresAt: c.expires_at, resendAt: c.sent_at + 60_000 }
}

async function deliver(db: D1Database, secret: string, mail: MailDelivery, c: Challenge, now: number) {
  try {
    // No provider session is created. WorldQuest retains hashed bearer sessions.
    await db.prepare(`INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at)
      VALUES (?,'',?,0,?,?) ON CONFLICT(email) DO NOTHING`).bind(crypto.randomUUID(), c.email, now, now).run()
    await db.prepare('DELETE FROM auth_verification WHERE identifier=?').bind(c.id).run()
    const code = await emailProvider(db, secret, c.id).api.createVerificationOTP({ body: { email: c.email, type: 'email-verification' } })
    await mail.send({ email: c.email, code, locale: c.locale, purpose: c.purpose })
    await db.prepare(`UPDATE email_challenges SET state='pending' WHERE id=? AND state='sending'`).bind(c.id).run()
  } catch {
    await db.prepare(`UPDATE email_challenges SET state='pending' WHERE id=? AND state='sending'`).bind(c.id).run()
    throw new ApiError('EMAIL_UNAVAILABLE', 503, { challengeId: c.id, expiresAt: c.expires_at, resendAt: c.sent_at + 60_000 })
  }
}

export async function verifyCode(db: D1Database, secret: string, owner: string, session: string, id: string, code: string, now: number) {
  // A proven challenge is a short-lived, session-bound grant. Retrying an atomic
  // owner/deletion commit after a database failure must not require a new code.
  const prior = await db.prepare(`SELECT * FROM email_challenges WHERE id=? AND account_id=?
    AND session_hash=? AND state='verified' AND expires_at>?`).bind(id, owner, session, now).first<Challenge>()
  if (prior) {
    const user = await db.prepare('SELECT id FROM auth_user WHERE email=? AND email_verified=1').bind(prior.email).first<{ id: string }>()
    if (!user) throw new ApiError('INVALID_CODE', 400)
    return { challenge: prior, subject: user.id }
  }
  const c = await db.prepare(`UPDATE email_challenges SET state='verifying', attempts=attempts+1
    WHERE id=? AND account_id=? AND session_hash=? AND state='pending' AND attempts<3 AND expires_at>?
    RETURNING *`).bind(id, owner, session, now).first<Challenge>()
  if (!c) throw new ApiError('INVALID_CODE', 400)
  try {
    const verified = await emailProvider(db, secret, c.id).api.verifyEmailOTP({ body: { email: c.email, otp: code } })
    if (!verified.status || !verified.user.emailVerified || verified.user.email !== c.email) throw new Error('Unverified identity')
    await db.prepare(`UPDATE email_challenges SET state='verified' WHERE id=? AND state='verifying'`).bind(id).run()
    return { challenge: c, subject: verified.user.id }
  } catch {
    await db.prepare(`UPDATE email_challenges SET state='pending' WHERE id=? AND state='verifying'`).bind(id).run()
    throw new ApiError('INVALID_CODE', 400)
  }
}
