import { SLOTS, questProblems, type DailyQuest } from '@worldquest/engines'
import { z } from 'zod'
import { ApiError } from './contracts'
import { learningContent } from './learning-content'

const taskSchema = z.object({
  slot: z.enum(SLOTS),
  target: z.number().int().min(1).max(20),
  factIds: z.array(z.string().min(1).max(160)).max(20),
  goal: z.enum(['perfect_lesson', 'speed_round', 'streak_keeper']).optional(),
  progress: z.number().int().min(0).max(20),
  complete: z.boolean(),
}).strict()

export const questSchema = z.object({
  id: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tasks: z.array(taskSchema).max(12),
  complete: z.boolean(),
  bonusClaimed: z.boolean(),
}).strict()

/** The prototype day boundary, shared with `lessons.ts`. Replaced by the offline protocol. */
const utcDay = (now: number): string => new Date(now).toISOString().slice(0, 10)

type MemoryRow = { fact_id: string; state: string }

/**
 * Why a fact may not appear in the slot that named it.
 *
 * The shape rules in `quests/canonical.ts` cannot see this: a one-fact review slot is a
 * valid quest by shape and a cheaper one in practice, so the answer has to come from the
 * account's own rows. A review slot may name a fact that is unseen or due — exactly the
 * pool the device composes from. Naming a fact the learner already knows and that is not
 * due would be inventing work that does not exist.
 *
 * The `discover` slot is deliberately not checked. Its generator falls back to the
 * weakest known facts when nothing is unseen, and server-side those two cases are
 * indistinguishable, so a rule here would reject real quests for a learner who has seen
 * everything. That leaves one slot's worth of choice unfalsifiable; the three review
 * slots are where the payout is actually farmable.
 */
function ineligible(quest: DailyQuest, memories: ReadonlyMap<string, MemoryRow>, now: number): string[] {
  const problems: string[] = []
  for (const task of quest.tasks) {
    if (task.slot === 'perform' || task.slot === 'discover') continue
    for (const factId of task.factIds) {
      const row = memories.get(factId)
      if (!row) continue
      let dueAt: unknown
      try { dueAt = (JSON.parse(row.state) as { dueAt?: unknown }).dueAt } catch { throw new ApiError('QUEST_INVALID', 400) }
      if (typeof dueAt !== 'number') throw new ApiError('QUEST_INVALID', 400)
      if (dueAt > now) problems.push(`${task.slot} names ${factId}, which is not due`)
    }
  }
  return problems
}

/**
 * Store today's quest, or return the one already stored.
 *
 * Idempotent per (account, day) on purpose: the client retries on a lost response, and the
 * answer to a second device asking is the quest that was pinned, not a fresh one. That is
 * also the anti-farm rule — a client that rerolls after seeing the tasks gets the same five.
 *
 * No XP is written here. A pinned quest is a promise about what would count; only the
 * learner's own reviews and lessons decide what was done.
 */
export async function pinQuest(db: D1Database, owner: string, tokenHash: string, input: unknown, now: number) {
  const parsed = questSchema.safeParse(input)
  if (!parsed.success) throw new ApiError('QUEST_INVALID', 400)
  const quest = parsed.data as DailyQuest
  const day = utcDay(now)
  const facts = [...new Set(quest.tasks.flatMap(task => task.factIds))]
  const read = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT a.revision FROM accounts a JOIN sessions s ON s.account_id = a.id
      WHERE a.id = ? AND a.deleted_at IS NULL AND s.token_hash = ? AND s.expires_at > ?`).bind(owner, tokenHash, now),
    db.prepare('SELECT payload FROM quests WHERE account_id = ? AND day = ?').bind(owner, day),
    db.prepare(`SELECT fact_id, state FROM memories WHERE account_id = ? AND fact_id IN (SELECT value FROM json_each(?))`)
      .bind(owner, JSON.stringify(facts)),
  ])
  if (!read[0]?.results[0]) throw new ApiError('SESSION_EXPIRED', 401)

  // The pinned quest wins: a reroll, a second device and a retry all get the same five.
  const prior = read[1]?.results[0] as { payload: string } | undefined
  if (prior) return JSON.parse(prior.payload) as DailyQuest

  const problems = questProblems(quest, { owner, day, knownFacts: new Set(learningContent.facts.keys()) })
  const memories = new Map((read[2]?.results ?? []).map(row => [String(row.fact_id), row as unknown as MemoryRow]))
  problems.push(...ineligible(quest, memories, now))
  if (problems.length > 0) throw new ApiError('QUEST_INVALID', 400)

  const payload = JSON.stringify(quest)
  // Concurrent pins: the primary key decides, and both callers read back the winner.
  await db.prepare('INSERT INTO quests (account_id, day, payload, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (account_id, day) DO NOTHING')
    .bind(owner, day, payload, now).run()
  const stored = await db.prepare('SELECT payload FROM quests WHERE account_id = ? AND day = ?').bind(owner, day).first<{ payload: string }>()
  if (!stored) throw new ApiError('RETRY_LATER', 503)
  return JSON.parse(stored.payload) as DailyQuest
}
