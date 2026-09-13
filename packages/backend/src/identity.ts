import { ApiError } from './contracts'
import { hashToken, newToken, SESSION_MS } from './auth'
import type { Challenge } from './email-challenges'
import { DELETION_RECEIPT_MS } from './deletion-receipts'

/** Commit identity ownership and the new session together, after mailbox proof. */
export async function finishIdentity(db: D1Database, c: Challenge, subject: string, now: number) {
  const token = newToken(), tokenHash = await hashToken(token), guard = crypto.randomUUID()
  const q = (sql: string) => db.prepare(sql)
  const mapped = await q('SELECT account_id FROM identities WHERE subject_id=?').bind(subject).first<{ account_id: string }>()
  if (c.purpose === 'login' && !mapped) throw new ApiError('ACCOUNT_NOT_LINKED', 409)
  if (c.purpose === 'delete') throw new ApiError('INVALID_CHALLENGE', 400)
  if (c.purpose === 'link' && mapped && mapped.account_id !== c.account_id) throw new ApiError('EMAIL_ALREADY_LINKED', 409)
  const owner = c.purpose === 'login' ? mapped!.account_id : c.account_id
  const conditions = q(`INSERT INTO transaction_guards (id,valid) SELECT ?, CASE WHEN EXISTS (
    SELECT 1 FROM email_challenges c JOIN sessions s ON s.token_hash=c.session_hash
    JOIN accounts a ON a.id=c.account_id JOIN auth_user u ON u.email=c.email
    WHERE c.id=? AND c.state='verified' AND c.expires_at>? AND c.account_id=? AND c.session_hash=?
    AND s.account_id=a.id AND s.expires_at>? AND a.audience='eligible' AND a.deleted_at IS NULL
    AND u.id=? AND u.email_verified=1) AND EXISTS (SELECT 1 FROM accounts WHERE id=? AND audience='eligible' AND deleted_at IS NULL)
    THEN 1 ELSE 0 END`).bind(guard, c.id, now, c.account_id, c.session_hash, now, subject, owner)
  await db.batch([
    conditions,
    ...(c.purpose === 'link' ? [q('INSERT INTO identities(subject_id,account_id,linked_at) VALUES (?,?,?) ON CONFLICT(subject_id) DO NOTHING').bind(subject, owner, now)] : []),
    q(`UPDATE transaction_guards SET valid=CASE WHEN EXISTS(SELECT 1 FROM identities WHERE subject_id=? AND account_id=?) THEN 1 ELSE 0 END WHERE id=?`).bind(subject, owner, guard),
    // Linking revokes every old guest session. Login revokes the invoking guest
    // session, preserving other legitimate sessions of the recovered account.
    q(c.purpose === 'link' ? 'DELETE FROM sessions WHERE account_id=?' : 'DELETE FROM sessions WHERE token_hash=?').bind(c.purpose === 'link' ? owner : c.session_hash),
    q('INSERT INTO sessions(token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)').bind(tokenHash, owner, now, now + SESSION_MS),
    q(`UPDATE email_challenges SET state='consumed' WHERE id=?`).bind(c.id),
    q('DELETE FROM transaction_guards WHERE id=?').bind(guard),
  ])
  return { userId: owner, token, expiresAt: now + SESSION_MS }
}

/** Erase all current account-owned tables atomically, including every session. */
export async function deleteAccount(db: D1Database, owner: string, session: string, now: number, c?: Challenge) {
  const q = (sql: string) => db.prepare(sql), guard = crypto.randomUUID()
  const identity = await q(`SELECT subject_id FROM identities WHERE account_id=?`).bind(owner).first<{ subject_id: string }>()
  if (identity && (!c || c.purpose !== 'delete' || c.account_id !== owner || c.session_hash !== session)) throw new ApiError('REAUTH_REQUIRED', 403)
  const checks = q(`INSERT INTO transaction_guards(id,valid) SELECT ?, CASE WHEN EXISTS(
    SELECT 1 FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND a.id=?
    AND s.expires_at>? AND a.deleted_at IS NULL) AND (
    NOT EXISTS(SELECT 1 FROM identities WHERE account_id=?) OR EXISTS(
    SELECT 1 FROM email_challenges c JOIN auth_user u ON u.email=c.email JOIN identities i ON i.subject_id=u.id
    WHERE c.id=? AND c.account_id=? AND c.session_hash=? AND c.purpose='delete' AND c.state='verified'
    AND c.expires_at>? AND i.account_id=?)) THEN 1 ELSE 0 END`)
    .bind(guard, session, owner, now, owner, c?.id ?? '', owner, session, now, owner)
  await db.batch([
    checks,
    q('INSERT INTO deletion_receipts(token_hash,challenge_id,expires_at) VALUES (?,?,?)')
      .bind(session, c?.id ?? null, now + DELETION_RECEIPT_MS),
    q(`DELETE FROM auth_verification WHERE identifier IN (SELECT id FROM email_challenges WHERE account_id=?
      OR email IN (SELECT u.email FROM auth_user u JOIN identities i ON i.subject_id=u.id WHERE i.account_id=?))`).bind(owner, owner),
    q(`DELETE FROM auth_user WHERE email IN (SELECT email FROM email_challenges WHERE account_id=?)
      AND NOT EXISTS (SELECT 1 FROM identities WHERE subject_id=auth_user.id)`).bind(owner),
    q(`DELETE FROM email_challenges WHERE account_id=? OR email IN (
      SELECT u.email FROM auth_user u JOIN identities i ON i.subject_id=u.id WHERE i.account_id=?)`).bind(owner, owner),
    ...['tickets', 'receipts', 'reviews', 'memories', 'ledger', 'sessions', 'identities'].map(table => q(`DELETE FROM ${table} WHERE account_id=?`).bind(owner)),
    ...(identity ? [q('DELETE FROM auth_user WHERE id=?').bind(identity.subject_id)] : []),
    q('DELETE FROM auth_budgets WHERE bucket=?').bind(`email-owner:${owner}`),
    q('DELETE FROM accounts WHERE id=?').bind(owner),
    q('DELETE FROM transaction_guards WHERE id=?').bind(guard),
  ])
  return { deleted: true }
}
