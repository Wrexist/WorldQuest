import { ApiError } from './contracts'

/**
 * Whether `Intl` accepts a zone, and a safe zone to use when it does not.
 *
 * The legacy backend learnt this the hard way: one stored nonsense zone made every
 * later submission throw inside `Intl.DateTimeFormat`, permanently. Validate on write,
 * and fall back to UTC on read so a bad row can never lock an account out of learning.
 */
export function isKnownTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length < 1 || zone.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export const knownTimeZone = (zone: unknown): string => (isKnownTimeZone(zone) ? zone : 'UTC')

/**
 * Records the learner's zone. It changes future day rules only: `accounts.day` never
 * moves backwards, so a day that already paid its first-lesson bonus stays paid.
 */
export async function setTimeZone(db: D1Database, owner: string, tokenHash: string, zone: string, now: number) {
  if (!isKnownTimeZone(zone)) throw new ApiError('INVALID_TIME_ZONE', 400)
  const updated = await db.prepare(`UPDATE accounts SET time_zone = ? WHERE id = ? AND deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM sessions s WHERE s.account_id = accounts.id AND s.token_hash = ? AND s.expires_at > ?)`)
    .bind(zone, owner, tokenHash, now).run()
  if (!updated.meta.changes) throw new ApiError('SESSION_EXPIRED', 401)
  return { timeZone: zone }
}
