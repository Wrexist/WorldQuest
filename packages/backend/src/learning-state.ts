import { ApiError } from './contracts'
import type { MemoryState } from '@worldquest/engines'

/** Current projection and wallet share a coherent D1 snapshot. No unbounded scans. */
export async function learningState(db: D1Database, owner: string, tokenHash: string) {
  const rows = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT a.revision,a.xp,a.coins FROM accounts a JOIN sessions s ON s.account_id=a.id
      WHERE a.id=? AND a.deleted_at IS NULL AND s.token_hash=? AND s.expires_at>?`).bind(owner, tokenHash, Date.now()),
    db.prepare('SELECT state FROM memories WHERE account_id=? ORDER BY fact_id LIMIT 1001').bind(owner),
  ])
  const account = rows[0]?.results[0]
  if (!account) throw new ApiError('SESSION_EXPIRED', 401)
  const memory = rows[1]?.results ?? []
  if (memory.length > 1000) throw new ApiError('STATE_REQUIRES_PAGING', 409)
  return { ...account, memories: memory.map(row => JSON.parse(String(row.state)) as MemoryState) }
}

/** Immutable reviews page by accepted revision and slot, capped to the first page's revision. */
export async function learningHistory(db: D1Database, owner: string, tokenHash: string,
  cursor: { revision: number; slot: number; through?: number | undefined }) {
  const rows = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT a.revision FROM accounts a JOIN sessions s ON s.account_id=a.id
      WHERE a.id=? AND a.deleted_at IS NULL AND s.token_hash=? AND s.expires_at>?`).bind(owner, tokenHash, Date.now()),
    db.prepare(`SELECT revision,slot,fact_id AS factId,rating,reviewed_at AS reviewedAt FROM reviews
      WHERE account_id=? AND (revision>? OR (revision=? AND slot>?)) AND revision<=?
      ORDER BY revision,slot LIMIT 101`).bind(owner, cursor.revision, cursor.revision, cursor.slot, cursor.through ?? Number.MAX_SAFE_INTEGER),
  ])
  const account = rows[0]?.results[0]
  if (!account || typeof account.revision !== 'number') throw new ApiError('SESSION_EXPIRED', 401)
  const throughRevision = cursor.through ?? account.revision
  if (throughRevision > account.revision || cursor.revision > throughRevision) throw new ApiError('INVALID_CURSOR', 400)
  const all = rows[1]?.results ?? [], events = all.slice(0, 100), last = events.at(-1)
  return { throughRevision, events, next: all.length > 100 && last ? { revision: last.revision, slot: last.slot } : null }
}
