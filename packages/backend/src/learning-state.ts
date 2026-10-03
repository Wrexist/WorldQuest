import { ApiError } from './contracts'
import type { MemoryState } from '@worldquest/engines'

/** Current projection and wallet share a coherent D1 snapshot. No unbounded scans. */
export type StateCursor = { paged?: '1' | undefined; after?: string | undefined; revision?: number | undefined }
const MEMORY_PAGE_SIZE = 250
export async function learningState(db: D1Database, owner: string, tokenHash: string, cursor: StateCursor = {}) {
  const limit = cursor.paged ? MEMORY_PAGE_SIZE : 1000
  const rows = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT a.revision,a.xp,a.coins,a.time_zone,a.streak_current,a.streak_longest,a.streak_last_day,a.freezes_held
      FROM accounts a JOIN sessions s ON s.account_id=a.id
      WHERE a.id=? AND a.deleted_at IS NULL AND s.token_hash=? AND s.expires_at>?`).bind(owner, tokenHash, Date.now()),
    db.prepare('SELECT fact_id,state FROM memories WHERE account_id=? AND fact_id>? ORDER BY fact_id LIMIT ?')
      .bind(owner, cursor.after ?? '', limit + 1),
    // Finished lessons per focus the learner chose — a course step, a country — from the
    // tickets the Worker issued and the receipts it wrote. What lets a course path follow
    // the account to another phone without the path being stored anywhere: it is derived
    // from records the server already keeps and already decided ("finished" is its rule).
    ...(!cursor.after ? [db.prepare(`SELECT json_extract(t.request_json,'$.focus') AS focus, count(*) AS finished
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
    // Finished lessons per course step, for the tickets that named one. What the path
    // follows first: a focus shared by two steps cannot say which of them a lesson moved.
    db.prepare(`SELECT json_extract(t.request_json,'$.node') AS node, count(*) AS finished
      FROM receipts r JOIN tickets t ON t.account_id=r.account_id AND t.lesson_id=r.lesson_id
      WHERE r.account_id=? AND json_extract(r.result,'$.finished')=1
        AND json_extract(t.request_json,'$.node') IS NOT NULL
      GROUP BY json_extract(t.request_json,'$.node') ORDER BY finished DESC LIMIT ?`).bind(owner, MAX_FOCUSES)] : []),
  ])
  const account = rows[0]?.results[0]
  if (!account) throw new ApiError('SESSION_EXPIRED', 401)
  // Pages are only combined at the same account revision. A concurrent lesson/spend
  // makes the client restart, never merge two different authoritative snapshots.
  if (cursor.revision !== undefined && cursor.revision !== account.revision) throw new ApiError('STATE_CHANGED', 409)
  const allMemory = rows[1]?.results ?? []
  if (!cursor.paged && allMemory.length > limit) throw new ApiError('STATE_REQUIRES_PAGING', 409)
  const memory = allMemory.slice(0, limit)
  const memoryPage = { memories: memory.map(row => JSON.parse(String(row.state)) as MemoryState),
    ...(cursor.paged ? { next: allMemory.length > limit ? { after: String(memory.at(-1)!.fact_id), revision: account.revision } : null } : {}) }
  // Totals/history are coherent first-page metadata; continuation reads only account
  // revision and the next bounded memory range, not every receipt aggregation again.
  if (cursor.after) return { revision: account.revision, ...memoryPage }
  return { revision: account.revision, xp: account.xp, coins: account.coins, timeZone: account.time_zone,
    streak: { current: account.streak_current, longest: account.streak_longest, lastActiveDate: account.streak_last_day,
      freezesHeld: account.freezes_held },
    ...memoryPage,
    finishedByFocus: (rows[2]?.results ?? []).map(row => ({ focus: JSON.parse(String(row.focus)) as unknown, finished: Number(row.finished) })),
    finishedByDay: (rows[3]?.results ?? []).map(row => ({ day: String(row.day), finished: Number(row.finished) })),
    finishedByNode: (rows[4]?.results ?? []).map(row => ({ node: String(row.node), finished: Number(row.finished) })) }
}

/** A day more than a month back, as `YYYY-MM-DD`: the device's own log keeps 31 days. */
function monthBefore(now: number): string {
  return new Date(now - 32 * 86_400_000).toISOString().slice(0, 10)
}

/**
 * The most distinct focuses, and the most course steps, reported. The course has a few
 * dozen steps and a learner practises some countries; the cap keeps the response bounded
 * for someone who has practised hundreds, keeping the most-played.
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
