import type { MemoryState } from '@worldquest/engines'
import { ApiError, type Account } from './contracts'
import { dayRule } from './lessons'
import { learningContent } from './learning-content'
import { composeQuest, project, readQuestRow, type QuestRow } from './quests'

/**
 * Today's quest for the Quests tab and Home, composed and stored on first sight.
 *
 * Storing it on the first read, not only on the first lesson, is what makes the five
 * tasks the learner reads at breakfast the five they are paid for at lunch: after this
 * the row only gains evidence. Composition is deterministic per (account, day), so two
 * devices racing here store the same quest and `DO NOTHING` keeps whichever landed.
 */
export async function todayQuest(db: D1Database, owner: string, tokenHash: string, now: number) {
  const read = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT a.* FROM accounts a JOIN sessions s ON s.account_id = a.id
      WHERE a.id = ? AND s.token_hash = ? AND s.expires_at > ? AND a.deleted_at IS NULL`).bind(owner, tokenHash, now),
    db.prepare(`SELECT q.day, q.quest, q.credited, q.perform_done FROM quest_days q JOIN accounts a ON a.id = q.account_id
      WHERE q.account_id = ? AND q.day >= a.day ORDER BY q.day DESC LIMIT 2`).bind(owner),
  ])
  const account = read[0]?.results[0] as unknown as Account | undefined
  if (!account) throw new ApiError('SESSION_EXPIRED', 401)
  const { day } = dayRule(account, now)
  const rows = (read[1]?.results ?? []) as unknown as (QuestRow & { day: string })[]
  let stored = readQuestRow(rows.find(r => r.day === day))
  if (!stored) {
    const memory = new Map<string, MemoryState>()
    const states = await db.prepare(`SELECT state FROM memories WHERE account_id = ? AND fact_id IN (SELECT value FROM json_each(?))`)
      .bind(owner, JSON.stringify([...learningContent.facts.keys()])).all<{ state: string }>()
    for (const row of states.results) {
      const state = JSON.parse(row.state) as MemoryState
      memory.set(state.factId, state)
    }
    const quest = composeQuest(owner, day, memory, now, account.recent_accuracy)
    await db.prepare(`INSERT INTO quest_days (account_id, day, quest) SELECT ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM sessions s JOIN accounts a ON a.id = s.account_id
        WHERE s.account_id = ? AND s.token_hash = ? AND s.expires_at > ? AND a.deleted_at IS NULL)
      ON CONFLICT (account_id, day) DO NOTHING`).bind(owner, day, JSON.stringify(quest), owner, tokenHash, now).run()
    const row = await db.prepare('SELECT quest, credited, perform_done FROM quest_days WHERE account_id = ? AND day = ?')
      .bind(owner, day).first<QuestRow>()
    stored = readQuestRow(row ?? undefined)
    if (!stored) throw new ApiError('SESSION_EXPIRED', 401)
  }
  return { day, quest: project(stored) }
}
