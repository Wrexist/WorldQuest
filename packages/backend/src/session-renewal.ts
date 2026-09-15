import { hashToken, SESSION_MS } from './auth'
import { ApiError } from './contracts'

export const RENEWAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
function bearer(request: Request): string {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  if (!token) throw new ApiError('AUTH_REQUIRED', 401)
  return token
}

/** The client must durably save both tokens BEFORE requesting this swap. */
export async function renewSession(db: D1Database, request: Request, replacement: string, now: number) {
  const oldHash = await hashToken(bearer(request)), nextHash = await hashToken(replacement)
  if (oldHash === nextHash) throw new ApiError('INVALID_BODY', 400)
  const q = (sql: string) => db.prepare(sql)
  const result = await db.batch([
    q(`INSERT INTO sessions(token_hash,account_id,created_at,expires_at,family_id)
      SELECT ?,s.account_id,?,?,COALESCE(s.family_id,s.token_hash) FROM sessions s
      JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?
      AND s.expires_at<=? AND a.deleted_at IS NULL`)
      .bind(nextHash, now, now + SESSION_MS, oldHash, now, now + RENEWAL_WINDOW_MS),
    q(`INSERT INTO session_rotations(token_hash,next_hash,account_id,family_id,expires_at)
      SELECT s.token_hash,n.token_hash,s.account_id,n.family_id,n.expires_at FROM sessions s
      JOIN sessions n ON n.token_hash=? AND n.account_id=s.account_id
      AND n.family_id=COALESCE(s.family_id,s.token_hash) WHERE s.token_hash=?`)
      .bind(nextHash, oldHash),
    q(`UPDATE email_challenges SET session_hash=? WHERE session_hash=? AND EXISTS
      (SELECT 1 FROM session_rotations WHERE token_hash=? AND next_hash=?)`)
      .bind(nextHash, oldHash, oldHash, nextHash),
    q(`DELETE FROM sessions WHERE token_hash=? AND EXISTS
      (SELECT 1 FROM session_rotations WHERE token_hash=? AND next_hash=?)`)
      .bind(oldHash, oldHash, nextHash),
    q(`SELECT s.account_id AS userId,s.expires_at AS expiresAt FROM sessions s
      JOIN session_rotations r ON r.next_hash=s.token_hash AND r.family_id=s.family_id
      JOIN accounts a ON a.id=s.account_id WHERE r.token_hash=? AND r.next_hash=?
      AND r.expires_at>? AND s.expires_at>? AND a.deleted_at IS NULL`)
      .bind(oldHash, nextHash, now, now),
  ])
  const renewed = result[4]!.results[0]
  if (renewed) return { ...renewed, token: replacement }
  const active = await q('SELECT expires_at FROM sessions WHERE token_hash=? AND expires_at>?').bind(oldHash, now).first()
  throw new ApiError(active ? 'SESSION_NOT_DUE' : 'SESSION_EXPIRED', active ? 409 : 401)
}

/** A retired token may revoke its family, but can never read or mutate progress. */
export async function revokeSessionFamily(db: D1Database, request: Request, now: number) {
  const tokenHash = await hashToken(bearer(request))
  const family = await db.prepare(`SELECT COALESCE(family_id,token_hash) AS id FROM sessions WHERE token_hash=?
    UNION ALL SELECT family_id AS id FROM session_rotations WHERE token_hash=? AND expires_at>? LIMIT 1`)
    .bind(tokenHash, tokenHash, now).first<{ id: string }>()
  if (family) await db.batch([
    db.prepare('DELETE FROM sessions WHERE family_id=? OR (family_id IS NULL AND token_hash=?)').bind(family.id, family.id),
    db.prepare('DELETE FROM session_rotations WHERE family_id=?').bind(family.id),
  ])
  return { signedOut: true }
}

export async function pruneSessionRotations(db: D1Database, now: number) {
  await db.prepare(`DELETE FROM session_rotations WHERE token_hash IN
    (SELECT token_hash FROM session_rotations WHERE expires_at<=? ORDER BY expires_at LIMIT 1000)`).bind(now).run()
}
