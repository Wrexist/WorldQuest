import { ApiError } from './contracts'

export async function recordAudience(db: D1Database, owner: string, session: string, birthYear: number, now: number) {
  const year = new Date(now).getUTCFullYear()
  if (!Number.isInteger(birthYear) || birthYear < year - 120 || birthYear > year) throw new ApiError('INVALID_BODY', 400)
  // With year alone, conservatively protect anyone who might still be under 16.
  // Store only the derived band. A protected account cannot promote itself later.
  const audience = birthYear < year - 16 ? 'eligible' : 'protected'
  const result = await db.prepare(`UPDATE accounts SET audience = ? WHERE id = ? AND audience = 'unknown'
    AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM sessions WHERE token_hash = ? AND account_id = accounts.id AND expires_at > ?)`)
    .bind(audience, owner, session, now).run()
  if (result.meta.changes !== 1) throw new ApiError('AUDIENCE_ALREADY_SET', 409)
  return { audience }
}

export async function authBudget(db: D1Database, bucket: string, limit: number, now: number, period = 3_600_000) {
  const result = await db.prepare(`INSERT INTO auth_budgets (bucket, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(bucket) DO UPDATE SET count = CASE WHEN expires_at <= ? THEN 1 ELSE count + 1 END,
    expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
    WHERE expires_at <= ? OR count < ? RETURNING count`).bind(bucket, now + period, now, now, now, limit).first()
  if (!result) throw new ApiError('RATE_LIMITED', 429)
}
