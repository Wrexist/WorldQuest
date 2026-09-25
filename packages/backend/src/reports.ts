import { z } from 'zod'
import { ApiError } from './contracts'
import { learningContent } from './learning-content'

/**
 * "Report a problem" with a fact (content-pipeline §6: a wrong fact is a P1 bug).
 *
 * A reason from a fixed list and the fact it is about; never free text. Free text from
 * an app used by children is personal data we would then have to hold, moderate and
 * erase, and a wrong fact is diagnosed from the fact id and the reason anyway.
 *
 * Idempotent per report id (a retry after a lost response is the same report), bounded
 * per account per day so a reporter cannot flood the triage queue, and erased with the
 * account. Triage reads `reports` grouped by fact (see packages/backend/README.md).
 */

export const REPORT_REASONS = ['wrong', 'unclear', 'outdated', 'offensive', 'other'] as const
export const reportSchema = z.object({
  reportId: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/),
  factId: z.string().regex(/^[a-zA-Z0-9._-]{1,120}$/),
  reason: z.enum(REPORT_REASONS),
}).strict()

/** Reports one account may file per UTC day. Generous for a learner; tight for a flood. */
const DAILY_LIMIT = 30

export async function fileReport(db: D1Database, owner: string, tokenHash: string, input: z.infer<typeof reportSchema>, now: number) {
  // Only facts this build ships. A report about an id we do not have is noise.
  if (!learningContent.facts.has(input.factId)) throw new ApiError('UNKNOWN_FACT', 400)
  const dayStart = now - (now % 86_400_000)
  const read = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT 1 AS ok FROM accounts a JOIN sessions s ON s.account_id = a.id
      WHERE a.id = ? AND s.token_hash = ? AND s.expires_at > ? AND a.deleted_at IS NULL`).bind(owner, tokenHash, now),
    db.prepare('SELECT 1 AS ok FROM reports WHERE account_id = ? AND report_id = ?').bind(owner, input.reportId),
    db.prepare('SELECT count(*) AS n FROM reports WHERE account_id = ? AND created_at >= ?').bind(owner, dayStart),
  ])
  if (!read[0]?.results[0]) throw new ApiError('SESSION_EXPIRED', 401)
  if (read[1]?.results[0]) return { accepted: true }
  if (Number(read[2]?.results[0]?.n ?? 0) >= DAILY_LIMIT) throw new ApiError('REPORT_LIMIT', 429)
  await db.prepare(`INSERT INTO reports (account_id, report_id, fact_id, reason, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (account_id, report_id) DO NOTHING`).bind(owner, input.reportId, input.factId, input.reason, now).run()
  return { accepted: true }
}
