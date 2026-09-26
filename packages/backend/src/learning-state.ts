import { ApiError } from './contracts'
import type { MemoryState } from '@worldquest/engines'

/** Current projection and wallet share a coherent D1 snapshot. No unbounded scans. */
export async function learningState(db: D1Database, owner: string, tokenHash: string) {
  const rows = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT a.revision,a.xp,a.coins,a.time_zone,a.streak_current,a.streak_longest,a.streak_last_day,a.freezes_held
      FROM accounts a JOIN sessions s ON s.account_id=a.id
      WHERE a.id=? AND a.deleted_at IS NULL AND s.token_hash=? AND s.expires_at>?`).bind(owner, tokenHash, Date.now()),
    db.prepare('SELECT state FROM memories WHERE account_id=? ORDER BY fact_id LIMIT 1001').bind(owner),
    // Finished lessons per focus the learner chose — a course step, a country — from the
    // tickets the Worker issued and the receipts it wrote. What lets a course path follow
    // the account to another phone without the path being stored anywhere: it is derived
    // from records the server already keeps and already decided ("finished" is its rule).
    db.prepare(`SELECT json_extract(t.request_json,'$.focus') AS focus, count(*) AS finished
      FROM receipts r JOIN tickets t ON t.account_id=r.account_id AND t.lesson_id=r.lesson_id
      WHERE r.account_id=? AND json_extract(r.result,'$.finished')=1
        AND json_extract(t.request_json,'$.focus') IS NOT NULL
      GROUP BY json_extract(t.request_json,'$.focus') ORDER BY finished DESC LIMIT ?`).bind(owner, MAX_FOCUSES),
    // Finished lessons per local day for the last month, from the receipts (each carries
    // the learner's own day). What the streak calendar and the week chart follow to
    // another phone: they read a device log that a new phone starts without.
    db.prepare(`SELECT json_extract(result,'$.day') AS day, count(*) AS finished FROM receipts
      WHERE account_id=? AND json_extract(result,'$.finished')=1 AND json_extract(result,'$.day') >= ?
      GROUP BY json_extract(result,'$.day') ORDER BY day DESC LIMIT 62`).bind(owner, monthBefore(Date.now())),
  ])
  const account = rows[0]?.results[0]
  if (!account) throw new ApiError('SESSION_EXPIRED', 401)
  const memory = rows[1]?.results ?? []
  if (memory.length > 1000) throw new ApiError('STATE_REQUIRES_PAGING', 409)
  return { revision: account.revision, xp: account.xp, coins: account.coins, timeZone: account.time_zone,
    streak: { current: account.streak_current, longest: account.streak_longest, lastActiveDate: account.streak_last_day,
      freezesHeld: account.freezes_held },
    memories: memory.map(row => JSON.parse(String(row.state)) as MemoryState),
    finishedByFocus: (rows[2]?.results ?? []).map(row => ({ focus: JSON.parse(String(row.focus)) as unknown, finished: Number(row.finished) })),
    finishedByDay: (rows[3]?.results ?? []).map(row => ({ day: String(row.day), finished: Number(row.finished) })) }
}

/** A day more than a month back, as `YYYY-MM-DD`: the device's own log keeps 31 days. */
function monthBefore(now: number): string {
  return new Date(now - 32 * 86_400_000).toISOString().slice(0, 10)
}

/**
 * The most distinct focuses reported. A first-week course has a handful of steps and a
 * learner practises some countries; the cap keeps the response bounded for someone who
 * has practised hundreds, keeping the most-played.
 */
const MAX_FOCUSES = 200

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
