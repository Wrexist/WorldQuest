import { applyActivity, gradeLesson, localDate, masteryOf, streakMilestoneReward, type MemoryState } from '@worldquest/engines'
import { ApiError, ticketSchema, type Account, type Clock, type Receipt, type Submission } from './contracts'
import { knownTimeZone } from './time-zone'

/**
 * The learner's local date for the day rules, and whether it opens a new day.
 *
 * `accounts.day` only moves forward. A lesson whose local date is not after it (the
 * same day, or an earlier one because the learner flew west) belongs to the day already
 * counted: no second first-lesson bonus and a continuing soft cap. Flying east can open
 * the next date a few hours early; it can never open the same date twice (S14).
 */
export function dayRule(account: Pick<Account, 'day' | 'time_zone'>, now: number) {
  const local = localDate(now, knownTimeZone(account.time_zone))
  const opensDay = account.day === '' || local > account.day
  return { day: opensDay ? local : account.day, opensDay }
}

/** Every writer of learning state must hold this account revision guard. */
export async function submitLesson(db: D1Database, owner: string, tokenHash: string, input: Submission,
  clock: Clock = Date.now): Promise<Receipt> {
  const ordered = [...input.answers].sort((a, b) => a.slot - b.slot)
  const payload = JSON.stringify(ordered.map(a => [a.slot, a.chosenOptionId, a.elapsedMs]))
  // At most 45 SQL statements including authentication, below Free's 50/query limit.
  for (let attempt = 0; attempt < 4; attempt++) {
    const now = clock()
    // One batch provides a coherent grading snapshot. Only ticket facts are loaded.
    const read = await db.batch<Record<string, unknown>>([
      db.prepare(`SELECT a.* FROM accounts a JOIN sessions s ON s.account_id = a.id
        WHERE a.id = ? AND s.token_hash = ? AND s.expires_at > ? AND a.deleted_at IS NULL`).bind(owner, tokenHash, now),
      db.prepare('SELECT payload, result FROM receipts WHERE account_id = ? AND lesson_id = ?').bind(owner, input.lessonId),
      db.prepare('SELECT slots FROM tickets WHERE account_id = ? AND lesson_id = ?').bind(owner, input.lessonId),
      db.prepare(`SELECT state FROM memories WHERE account_id = ? AND fact_id IN
        (SELECT json_extract(value, '$.factId') FROM tickets, json_each(tickets.slots)
        WHERE tickets.account_id = ? AND tickets.lesson_id = ?)`).bind(owner, owner, input.lessonId),
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
    // Arrival order is still the prototype limit (L06); the day is the learner's own.
    const { day, opensDay } = dayRule(account, now)
    const sameDay = !opensDay
    const graded = gradeLesson({ lessonId: input.lessonId, answers, memory, now,
      xpEarnedToday: sameDay ? account.daily_xp : 0,
      isFirstLessonOfDay: !sameDay || account.lessons_today === 0,
      masteredBefore: new Set([...memory].filter(([, state]) =>
        ['mastered', 'burnished'].includes(masteryOf(state, now))).map(([id]) => id)),
    })
    // The engine decides the streak; this carries it. A second lesson on a day returns
    // `extended: false`, which is also what stops a milestone paying twice.
    const streak = applyActivity({ current: account.streak_current, longest: account.streak_longest,
      lastActiveDate: account.streak_last_day, freezesHeld: account.freezes_held }, now, knownTimeZone(account.time_zone))
    const milestone = streak.extended ? streakMilestoneReward(streak.current) : { xp: 0, coins: 0 }
    const xpAwarded = graded.xpAwarded + milestone.xp
    const coinsAwarded = graded.coinsAwarded + milestone.coins
    const revision = account.revision + 1
    const result: Receipt = { lessonId: input.lessonId, revision, xpAwarded,
      coinsAwarded, xpTotal: account.xp + xpAwarded,
      coinBalance: account.coins + coinsAwarded, correct: graded.correct, reviews: graded.reviews.length,
      day, streak: { current: streak.current, longest: streak.longest, extended: streak.extended,
        freezeUsed: streak.freezeUsed, reset: streak.reset, milestoneXp: milestone.xp, milestoneCoins: milestone.coins } }
    const guardId = crypto.randomUUID()
    const statements = [
      db.prepare(`INSERT INTO transaction_guards (id, valid) VALUES (?, CASE WHEN EXISTS (
        SELECT 1 FROM accounts a JOIN sessions s ON s.account_id = a.id
        WHERE a.id = ? AND a.revision = ? AND a.deleted_at IS NULL
        AND s.token_hash = ? AND s.expires_at > ?
      ) THEN 1 ELSE 0 END)`).bind(guardId, owner, account.revision, tokenHash, now),
      db.prepare('INSERT INTO ledger (account_id, lesson_id, xp, coins) VALUES (?, ?, ?, ?)')
        .bind(owner, input.lessonId, xpAwarded, coinsAwarded),
    ]
    statements.push(
      db.prepare(`INSERT INTO reviews (account_id, lesson_id, slot, fact_id, revision, rating, reviewed_at)
        SELECT ?, ?, CAST(key AS INTEGER), json_extract(value, '$.factId'), ?, json_extract(value, '$.rating'), ?
        FROM json_each(?)`).bind(owner, input.lessonId, revision, now, JSON.stringify(graded.reviews)),
      db.prepare(`INSERT INTO memories (account_id, fact_id, state, revision)
        SELECT ?, json_extract(value, '$.factId'), value, ? FROM json_each(?) WHERE 1
        ON CONFLICT (account_id, fact_id) DO UPDATE SET state = excluded.state, revision = excluded.revision`)
        .bind(owner, revision, JSON.stringify([...graded.updatedMemory.values()])),
      db.prepare(`UPDATE accounts SET revision = ?, xp = ?, coins = ?, day = ?, daily_xp = ?, lessons_today = ?,
        streak_current = ?, streak_longest = ?, streak_last_day = ?, freezes_held = ? WHERE id = ?`)
        .bind(revision, result.xpTotal, result.coinBalance, day,
          (sameDay ? account.daily_xp : 0) + graded.xpAwarded, (sameDay ? account.lessons_today : 0) + 1,
          streak.current, streak.longest, streak.lastActiveDate, streak.freezesHeld, owner),
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
