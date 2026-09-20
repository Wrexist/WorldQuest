import { gradeLesson, masteryOf, type DailyQuest, type MemoryState } from '@worldquest/engines'
import { questPayout } from './quests'
import { ApiError, ticketSchema, type Account, type Receipt, type Submission } from './contracts'

/** Every writer of learning state must hold this account revision guard. */
export async function submitLesson(db: D1Database, owner: string, tokenHash: string, input: Submission): Promise<Receipt> {
  const ordered = [...input.answers].sort((a, b) => a.slot - b.slot)
  const payload = JSON.stringify(ordered.map(a => [a.slot, a.chosenOptionId, a.elapsedMs]))
  // At most 45 SQL statements including authentication, below Free's 50/query limit.
  for (let attempt = 0; attempt < 4; attempt++) {
    const now = Date.now()
    // Arrival order and UTC day are explicit prototype limits, not the offline protocol.
    const day = new Date(now).toISOString().slice(0, 10)
    // The quest's day window. Same prototype UTC assumption as `day` above; the offline
    // protocol replaces both.
    const dayStart = Date.parse(`${day}T00:00:00.000Z`)
    // One batch provides a coherent grading snapshot. Only ticket facts are loaded.
    const read = await db.batch<Record<string, unknown>>([
      db.prepare(`SELECT a.* FROM accounts a JOIN sessions s ON s.account_id = a.id
        WHERE a.id = ? AND s.token_hash = ? AND s.expires_at > ? AND a.deleted_at IS NULL`).bind(owner, tokenHash, now),
      db.prepare('SELECT payload, result FROM receipts WHERE account_id = ? AND lesson_id = ?').bind(owner, input.lessonId),
      db.prepare('SELECT slots FROM tickets WHERE account_id = ? AND lesson_id = ?').bind(owner, input.lessonId),
      db.prepare(`SELECT state FROM memories WHERE account_id = ? AND fact_id IN
        (SELECT json_extract(value, '$.factId') FROM tickets, json_each(tickets.slots)
        WHERE tickets.account_id = ? AND tickets.lesson_id = ?)`).bind(owner, owner, input.lessonId),
      db.prepare('SELECT payload FROM quests WHERE account_id = ? AND day = ?').bind(owner, day),
      db.prepare('SELECT slot FROM quest_claims WHERE account_id = ? AND day = ?').bind(owner, day),
      db.prepare('SELECT fact_id, rating FROM reviews WHERE account_id = ? AND reviewed_at >= ? AND reviewed_at < ?')
        .bind(owner, dayStart, dayStart + 86_400_000),
      db.prepare(`SELECT r.result AS result, r.payload AS payload FROM receipts r WHERE r.account_id = ?
        AND r.lesson_id IN (SELECT DISTINCT lesson_id FROM reviews WHERE account_id = ? AND reviewed_at >= ? AND reviewed_at < ?)`)
        .bind(owner, owner, dayStart, dayStart + 86_400_000),
    ])
    const account = read[0]?.results[0] as unknown as Account | undefined
    if (!account) throw new ApiError('SESSION_EXPIRED', 401)
    const prior = read[1]?.results[0] as { payload: string; result: string } | undefined
    if (prior) {
      if (prior.payload !== payload) throw new ApiError('IDEMPOTENCY_CONFLICT', 409)
      return JSON.parse(prior.result) as Receipt
    }
    const ticketRow = read[2]?.results[0] as { slots: string } | undefined
    if (!ticketRow) throw new ApiError('INVALID_TICKET', 400)
    const slots = ticketSchema.parse(JSON.parse(ticketRow.slots))
    if (slots.length !== ordered.length) throw new ApiError('INVALID_TICKET', 400)
    const memory = new Map<string, MemoryState>()
    for (const row of read[3]?.results ?? []) {
      const state = JSON.parse(String(row.state)) as MemoryState
      memory.set(state.factId, state)
    }
    const answers = ordered.map((answer, i) => {
      const slot = slots[i]!
      if (answer.slot !== i || (answer.chosenOptionId !== null && !slot.options.includes(answer.chosenOptionId))) {
        throw new ApiError('INVALID_SLOT', 400)
      }
      return { ...answer, itemId: slot.itemId, factId: slot.factId, templateId: slot.templateId,
        wasCorrect: answer.chosenOptionId === slot.correctOptionId, answeredAt: now }
    })
    // Arrival order and UTC day are explicit prototype limits, not the offline protocol.
    const sameDay = account.day === day
    const graded = gradeLesson({ lessonId: input.lessonId, answers, memory, now,
      xpEarnedToday: sameDay ? account.daily_xp : 0,
      isFirstLessonOfDay: !sameDay || account.lessons_today === 0,
      masteredBefore: new Set([...memory].filter(([, state]) =>
        ['mastered', 'burnished'].includes(masteryOf(state, now))).map(([id]) => id)),
    })
    const revision = account.revision + 1
    // The quest is paid from what the server can see: the day's reviews and lessons, plus
    // the lesson being submitted â€” which has no rows yet, so its contribution is added
    // here rather than read back. Paying it a submission later would show the learner a
    // finished quest and no reward until they did something else.
    const quest = read[4]?.results[0]
      ? JSON.parse(String((read[4].results[0] as { payload: string }).payload)) as DailyQuest : null
    const claimed = new Set((read[5]?.results ?? []).map(row => String(row.slot)))
    const { claims, payout } = questPayout(quest, claimed, {
      reviews: [
        ...(read[6]?.results ?? []).map(row => ({ factId: String(row.fact_id), rating: Number(row.rating) })),
        ...graded.reviews.map(review => ({ factId: review.factId, rating: review.rating })),
      ],
      lessons: [
        ...(read[7]?.results ?? []).map(row => {
          const result = JSON.parse(String(row.result)) as { correct?: number; reviews?: number }
          const answers = JSON.parse(String(row.payload)) as [number, string | null, number][]
          return { correct: Number(result.correct ?? 0), reviews: Number(result.reviews ?? 0),
            elapsedMs: answers.reduce((sum, answer) => sum + (Number(answer[2]) || 0), 0) }
        }),
        { correct: graded.correct, reviews: graded.reviews.length,
          elapsedMs: answers.reduce((sum, answer) => sum + answer.elapsedMs, 0) },
      ],
    })
    const result: Receipt = { lessonId: input.lessonId, revision, xpAwarded: graded.xpAwarded,
      coinsAwarded: graded.coinsAwarded, xpTotal: account.xp + graded.xpAwarded + payout.xp,
      coinBalance: account.coins + graded.coinsAwarded, correct: graded.correct, reviews: graded.reviews.length,
      questXpAwarded: payout.xp, questSlots: payout.slots }
    const guardId = crypto.randomUUID()
    const statements = [
      db.prepare(`INSERT INTO transaction_guards (id, valid) VALUES (?, CASE WHEN EXISTS (
        SELECT 1 FROM accounts a JOIN sessions s ON s.account_id = a.id
        WHERE a.id = ? AND a.revision = ? AND a.deleted_at IS NULL
        AND s.token_hash = ? AND s.expires_at > ?
      ) THEN 1 ELSE 0 END)`).bind(guardId, owner, account.revision, tokenHash, Date.now()),
      db.prepare('INSERT INTO ledger (account_id, lesson_id, xp, coins) VALUES (?, ?, ?, ?)')
        .bind(owner, input.lessonId, graded.xpAwarded, graded.coinsAwarded),
    ]
    if (claims.length > 0) statements.push(
      // OR IGNORE, not a check-then-write: two devices submitting at the same second both
      // reach this line, and the primary key on (account, day, slot) is what decides. The
      // rows this batch actually inserted are the ones carrying its guard id, so the XP
      // below is exactly what was newly won, whoever won it.
      db.prepare(`INSERT OR IGNORE INTO quest_claims (account_id, day, slot, xp, batch_id, claimed_at)
        SELECT ?, ?, json_extract(value, '$.slot'), json_extract(value, '$.xp'), ?, ? FROM json_each(?)`)
        .bind(owner, day, guardId, now, JSON.stringify(claims)),
      db.prepare(`INSERT OR IGNORE INTO ledger (account_id, lesson_id, xp, coins)
        SELECT account_id, 'quest:' || day || ':' || slot, xp, 0 FROM quest_claims
        WHERE account_id = ? AND batch_id = ?`).bind(owner, guardId),
    )
    statements.push(
      db.prepare(`INSERT INTO reviews (account_id, lesson_id, slot, fact_id, revision, rating, reviewed_at)
        SELECT ?, ?, CAST(key AS INTEGER), json_extract(value, '$.factId'), ?, json_extract(value, '$.rating'), ?
        FROM json_each(?)`).bind(owner, input.lessonId, revision, now, JSON.stringify(graded.reviews)),
      db.prepare(`INSERT INTO memories (account_id, fact_id, state, revision)
        SELECT ?, json_extract(value, '$.factId'), value, ? FROM json_each(?) WHERE 1
        ON CONFLICT (account_id, fact_id) DO UPDATE SET state = excluded.state, revision = excluded.revision`)
        .bind(owner, revision, JSON.stringify([...graded.updatedMemory.values()])),
      db.prepare(`UPDATE accounts SET revision = ?, xp = ?, coins = ?, day = ?, daily_xp = ?, lessons_today = ? WHERE id = ?`)
        .bind(revision, result.xpTotal, result.coinBalance, day,
          (sameDay ? account.daily_xp : 0) + graded.xpAwarded, (sameDay ? account.lessons_today : 0) + 1, owner),
      db.prepare('INSERT INTO receipts (account_id, lesson_id, payload, result) VALUES (?, ?, ?, ?)')
        .bind(owner, input.lessonId, payload, JSON.stringify(result)),
      db.prepare('DELETE FROM transaction_guards WHERE id = ?').bind(guardId),
    )
    try { await db.batch(statements); return result } catch (error) {
      // Retry only our CAS guard. Unknown failures return a retryable service error.
      if (!(error instanceof Error) || !error.message.includes('wq_revision_guard')) throw error
    }
  }
  throw new ApiError('RETRY_LATER', 503)
}
