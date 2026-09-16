import { ApiError, type Account } from './contracts'

export const SESSION_MS = 30 * 24 * 60 * 60 * 1000
export function newToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('')
}
export async function hashToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
}
export async function createGuest(db: D1Database, now: number) {
  const token = newToken()
  const userId = crypto.randomUUID()
  const tokenHash = await hashToken(token)
  await db.batch([
    db.prepare('INSERT INTO accounts (id, created_at) VALUES (?, ?)').bind(userId, now),
    db.prepare('INSERT INTO sessions (token_hash, account_id, created_at, expires_at, family_id) VALUES (?, ?, ?, ?, ?)')
      .bind(tokenHash, userId, now, now + SESSION_MS, tokenHash),
  ])
  return { userId, token, expiresAt: now + SESSION_MS }
}
export async function authenticate(db: D1Database, request: Request, now: number) {
  const bearer = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  if (!bearer) throw new ApiError('AUTH_REQUIRED', 401)
  const tokenHash = await hashToken(bearer)
  const account = await db.prepare(`SELECT a.* FROM accounts a JOIN sessions s ON s.account_id = a.id
    WHERE s.token_hash = ? AND s.expires_at > ? AND a.deleted_at IS NULL`).bind(tokenHash, now).first<Account>()
  if (!account) throw new ApiError('SESSION_EXPIRED', 401)
  return { account, tokenHash }
}
