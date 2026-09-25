import { applyActivity, gradeLesson, localDate, masteryOf, streakMilestoneReward, type MemoryState } from '@worldquest/engines'
import { ApiError, ticketSchema, type Account, type Clock, type Receipt, type Submission } from './contracts'
import { knownTimeZone } from './time-zone'
import { applyLesson, composeQuest, readQuestRow, type QuestRow } from './quests'
import { learningContent } from './learning-content'

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

/**
 * What a lesson does to the repair window. A reset records the first missed day and
 * the length that was lost, so a repair can restore it; a normal extension closes any
 * old window; a second lesson on the same day leaves it as it was.
 */
function brokenFields(account: Account, streak: { reset: boolean; extended: boolean }): [string | null, number] {
  if (streak.reset && account.streak_last_day) {
    const [y, m, d] = account.streak_last_day.split('-').map(Number) as [number, number, number]
    return [new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10), account.streak_current]
  }
  if (streak.extended) return [null, 0]
  return [account.streak_broken_on, account.streak_restorable]
}

/** Every writer of learning state must hold this account revision guard. */
export async function submitLesson(db: D1Database, owner: string, tokenHash: string, input: Submission,
  clock: Clock = Date.now): Promise<Receipt> {
  const ordered = [...input.answers].sort((a, b) => a.slot - b.slot)
  const payload = JSON.stringify(ordered.map(a => [a.slot, a.chosenOptionId, a.elapsedMs]))
  // 13 statements per attempt; three attempts plus authentication stay at 40, under
  // Workers Free's 50 queries per invocation.
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = clock()
    // One batch provides a coherent grading snapshot: the account, any prior receipt,
    // the ticket, every content memory (the quest is composed from all of them) and
    // today's quest row. The day is not known until the account is read, so the quest
    // row is fetched for both candidate days the account could be on.
    const read = await db.batch<Record<string, unknown>>([
      db.prepare(`SELECT a.* FROM accounts a JOIN sessions s ON s.account_id = a.id
        WHERE a.id = ? AND s.token_hash = ? AND s.expires_at > ? AND a.deleted_at IS NULL`).bind(owner, tokenHash, now),
      db.prepare('SELECT payload, result FROM receipts WHERE account_id = ? AND lesson_id = ?').bind(owner, input.lessonId),
      db.prepare('SELECT slots FROM tickets WHERE account_id = ? AND lesson_id = ?').bind(owner, input.lessonId),
      // Content facts for the quest, plus the ticket's own: a ticket issued before a
      // content release may name a fact the current pack no longer ships, and its
      // history must still be graded on, never reset.
      db.prepare(`SELECT state FROM memories WHERE account_id = ? AND (fact_id IN (SELECT value FROM json_each(?))
        OR fact_id IN (SELECT json_extract(value, '$.factId') FROM tickets, json_each(tickets.slots)
        WHERE tickets.account_id = ? AND tickets.lesson_id = ?))`)
        .bind(owner, JSON.stringify([...learningContent.facts.keys()]), owner, input.lessonId),
      db.prepare(`SELECT q.day, q.quest, q.credited, q.perform_done FROM quest_days q JOIN accounts a ON a.id = q.account_id
        WHERE q.account_id = ? AND q.day >= a.day ORDER BY q.day DESC LIMIT 2`).bind(owner),
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
    // The answers are a prefix of the ticket: a lesson that ended early still sends what
    // was answered, and those answers still teach the scheduler. Never more than issued.
    if (ordered.length > slots.length) throw new ApiError('INVALID_TICKET', 400)
    const allMemory = new Map<string, MemoryState>()
    for (const row of read[3]?.results ?? []) {
      const state = JSON.parse(String(row.state)) as MemoryState
      allMemory.set(state.factId, state)
    }
    // Grading sees only this lesson's facts, so it writes only their memories back.
    const ticketFacts = new Set(slots.map(s => s.factId))
    const memory = new Map([...allMemory].filter(([id]) => ticketFacts.has(id)))
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
    const masteredBefore = new Set([...memory].filter(([, state]) =>
      ['mastered', 'burnished'].includes(masteryOf(state, now))).map(([id]) => id))
    // Whether this was a FINISHED lesson — every slot answered, or hearts ran out, which
    // the grader's own heart replay decides. Only a finished lesson is the day's
    // activity: it extends the streak, takes the first-lesson bonus and meets the
    // quest's perform goal. A lesson ended early still grades what was answered.
    const provisional = gradeLesson({ lessonId: input.lessonId, answers, memory, now,
      xpEarnedToday: sameDay ? account.daily_xp : 0, isFirstLessonOfDay: false, masteredBefore })
    const finished = ordered.length === slots.length || provisional.heartsDepleted
    const graded = finished && (!sameDay || account.lessons_today === 0)
      ? gradeLesson({ lessonId: input.lessonId, answers, memory, now,
        xpEarnedToday: sameDay ? account.daily_xp : 0, isFirstLessonOfDay: true, masteredBefore })
      : provisional
    // The engine decides the streak; this carries it. A second lesson on a day returns
    // `extended: false`, which is also what stops a milestone paying twice.
    const priorStreak = { current: account.streak_current, longest: account.streak_longest,
      lastActiveDate: account.streak_last_day, freezesHeld: account.freezes_held }
    const streak = finished
      ? applyActivity(priorStreak, now, knownTimeZone(account.time_zone))
      : { ...priorStreak, extended: false, freezeUsed: false, reset: false }
    const milestone = streak.extended ? streakMilestoneReward(streak.current) : { xp: 0, coins: 0 }
    // Today's quest: stored if a lesson or the quest screen already composed it,
    // otherwise composed now from the memory as it was BEFORE this lesson.
    const questRows = (read[4]?.results ?? []) as unknown as (QuestRow & { day: string })[]
    const questDay = readQuestRow(questRows.find(r => r.day === day))
      ?? { base: composeQuest(owner, day, allMemory, now, account.recent_accuracy), credited: [], performDone: false }
    const quest = applyLesson(questDay, {
      correctFacts: answers.filter(a => a.wasCorrect).map(a => a.factId),
      accuracy: graded.accuracy,
      durationMs: ordered.reduce((sum, a) => sum + a.elapsedMs, 0),
      finished,
    })
    const xpAwarded = graded.xpAwarded + milestone.xp + quest.xp
    const coinsAwarded = graded.coinsAwarded + milestone.coins + quest.coins
    const revision = account.revision + 1
    const result: Receipt = { lessonId: input.lessonId, revision, xpAwarded,
      coinsAwarded, xpTotal: account.xp + xpAwarded,
      coinBalance: account.coins + coinsAwarded, correct: graded.correct, reviews: graded.reviews.length,
      day, finished, streak: { current: streak.current, longest: streak.longest, extended: streak.extended,
        freezeUsed: streak.freezeUsed, reset: streak.reset, milestoneXp: milestone.xp, milestoneCoins: milestone.coins },
      quest: { completedSlots: quest.completedSlots, complete: quest.complete, done: quest.done, total: quest.total,
        xp: quest.xp, coins: quest.coins } }
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
        streak_current = ?, streak_longest = ?, streak_last_day = ?, freezes_held = ?, recent_accuracy = ?,
        streak_broken_on = ?, streak_restorable = ? WHERE id = ?`)
        .bind(revision, result.xpTotal, result.coinBalance, day,
          (sameDay ? account.daily_xp : 0) + graded.xpAwarded, (sameDay ? account.lessons_today : 0) + (finished ? 1 : 0),
          streak.current, streak.longest, streak.lastActiveDate, streak.freezesHeld, graded.accuracy,
          ...brokenFields(account, streak), owner),
      db.prepare(`INSERT INTO quest_days (account_id, day, quest, credited, perform_done) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (account_id, day) DO UPDATE SET credited = excluded.credited, perform_done = excluded.perform_done`)
        .bind(owner, day, JSON.stringify(quest.next.base), JSON.stringify(quest.next.credited), quest.next.performDone ? 1 : 0),
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
