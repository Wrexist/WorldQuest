/**
 * submit-lesson — the authoritative grading endpoint.
 *
 * The client submits ANSWERS. It does not submit XP, coins, mastery, or streaks,
 * and there is no field here that would accept them. This function re-derives every
 * reward by calling the same `gradeLesson` module the client used for its optimistic
 * display, so the two cannot disagree about what a user knows or earned.
 *
 * It also does not submit WHETHER IT WAS RIGHT. That field exists on the wire because
 * the client needs it locally, and this function ignores it: correctness is decided
 * here from the vendored answer key. Trusting it meant a modified client could post
 * ten fabricated answers and mint XP, coins and mastery.
 *
 * Idempotent: `lessonId` is a client-generated UUID and the primary key of `lessons`.
 * A replayed offline submit collides, returns the original result, and awards nothing
 * twice. That single property is what makes the offline queue safe.
 *
 * Spec: docs/engineering/architecture.md §4 · docs/adr/0006-server-authoritative-progress.md
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { gradeLesson } from '../../../packages/engines/src/grading/index.ts'
import { BALANCE } from '../../../packages/engines/src/xp/balance.ts'
import type { AnsweredItem } from '../../../packages/engines/src/lesson/machine.ts'
import type { MemoryState } from '../../../packages/engines/src/learning/types.ts'
import {
  applyActivity,
  startOfLocalDay,
  streakMilestoneReward,
} from '../../../packages/engines/src/time/index.ts'
import { isFiniteMs, retimeLesson } from '../_shared/submission-time.ts'
import { ANSWER_BY_FACT, QUIZZABLE_FACTS_BY_ENTITY } from './_content/answers.ts'

type SubmitBody = {
  lessonId: string
  kind: 'lesson' | 'quest' | 'review' | 'challenge' | 'event'
  topicId?: string
  startedAt: number
  answers: AnsweredItem[]
  heartsLost?: number
  clientVersion?: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/**
 * Whether `Intl` will accept this zone.
 *
 * `profiles.timezone` is writable by its own owner — the update policy has no column
 * restriction — and `startOfLocalDay` hands it straight to `Intl.DateTimeFormat`, which
 * throws a RangeError on anything it does not recognise. So one PATCH setting the zone
 * to a string of nonsense made every subsequent lesson submission 500, permanently, with
 * no way to recover from the client. Cheap check, and the failure it prevents is total.
 */
function isKnownTimeZone(zone: string | null | undefined): zone is string {
  if (!zone) return false
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** Deliberately minimal. Anything not asserted here is not trusted. */
function parseBody(raw: unknown): SubmitBody | null {
  if (typeof raw !== 'object' || raw === null) return null
  const b = raw as Record<string, unknown>

  if (typeof b.lessonId !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.lessonId)) return null
  // `isFiniteMs`, not `typeof === 'number'`. The latter admits NaN, Infinity and 1e300,
  // all three of which reach `new Date(x).toISOString()` further down and throw a
  // RangeError there — an uncaught 500 any client could ask for.
  if (!isFiniteMs(b.startedAt)) return null
  if (!Array.isArray(b.answers) || b.answers.length === 0) return null
  // A statistic, not a reward input — nothing is paid or withheld on it, which is what
  // makes an unverifiable client number acceptable here. Bounded anyway: a smallint
  // column and an absurd value are a bad combination, and `hearts.max` is the ceiling
  // even after a revive, because a revive restores to full rather than beyond it.
  if (b.heartsLost !== undefined && !isFiniteMs(b.heartsLost)) return null
  // A lesson longer than the documented maximum is a forged payload, not a session.
  if (b.answers.length > 50) return null

  for (const a of b.answers) {
    if (typeof a !== 'object' || a === null) return null
    const item = a as Record<string, unknown>
    if (typeof item.factId !== 'string') return null
    if (typeof item.templateId !== 'string') return null
    // `wasCorrect` is deliberately NOT validated, because it is deliberately not
    // read. The server decides correctness itself further down.
    //
    // `elapsedMs` and `answeredAt` are checked for shape here and CLAMPED below. Shape
    // alone was never enough: `answeredAt` is the clock the scheduler runs on, and a
    // client that could date an answer in the future could mint mastery. See
    // _shared/submission-time.ts.
    if (!isFiniteMs(item.elapsedMs)) return null
    if (!isFiniteMs(item.answeredAt)) return null
  }

  return b as unknown as SubmitBody
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  // Service role, because this function writes tables no client may write.
  const admin: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authError || !user) return json({ error: 'unauthorized' }, 401)

  const body = parseBody(await req.json().catch(() => null))
  if (!body) return json({ error: 'invalid_body' }, 400)

  // ── idempotency, cheaply ──────────────────────────────────────────────────
  //
  // A pre-check, not the guarantee. `record_lesson` decides idempotency under a lock and
  // is the only thing that can; this exists so a replayed submission does not pay for
  // four reads and a grading pass to reach the same answer.
  //
  // Scoped to the user, which it was not: it looked the lesson up by id alone, so a
  // request carrying somebody else's lesson id got their items, their score and their
  // rewards back.
  const { data: existing } = await admin
    .from('lessons')
    .select('id, items, correct, xp_awarded, coins_awarded')
    .eq('id', body.lessonId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    return json({
      lessonId: existing.id,
      items: existing.items,
      correct: existing.correct,
      xpAwarded: existing.xp_awarded,
      coinsAwarded: existing.coins_awarded,
      replayed: true,
    })
  }

  // The rate limit used to be counted here, one round trip before the insert it was
  // meant to gate — so N concurrent submissions all read the same count and all passed.
  // It moved inside `record_lesson`, behind the same advisory lock as the insert.

  // ── load the memory state these answers touch ─────────────────────────────
  const factIds = [...new Set(body.answers.map((a) => a.factId))]
  const { data: factRows } = await admin
    .from('user_facts')
    .select('*')
    .eq('user_id', user.id)
    .in('fact_id', factIds)

  const memory = new Map<string, MemoryState>(
    (factRows ?? []).map((r) => [
      r.fact_id,
      {
        factId: r.fact_id,
        stability: r.stability,
        difficulty: r.difficulty,
        reps: r.reps,
        lapses: r.lapses,
        lastReviewAt: r.last_review_at ? Date.parse(r.last_review_at) : null,
        dueAt: Date.parse(r.due_at),
        suspended: r.suspended,
      },
    ]),
  )

  const masteredBefore = new Set(
    (factRows ?? [])
      .filter((r) => r.mastery === 'mastered' || r.mastery === 'burnished')
      .map((r) => r.fact_id),
  )

  // XP already earned today, in the USER'S timezone — the soft cap is a daily
  // rule, and "today" is 23 or 25 hours long twice a year.
  const [{ data: profile }, { data: streakRow }] = await Promise.all([
    admin.from('profiles').select('timezone').eq('id', user.id).single(),
    admin
      .from('streaks')
      .select('current, longest, last_active_date, freezes_held')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  // A stored zone the app cannot read is a lesson nobody can submit: `Intl` throws a
  // RangeError on an unknown one, and `profiles.timezone` is a column its own owner can
  // write. Falling back to UTC costs a user at most one day-boundary; the alternative is
  // a 500 on every submission until somebody fixes the row by hand.
  const timeZone = isKnownTimeZone(profile?.timezone) ? profile!.timezone : 'UTC'

  // Imported from the engines package rather than reimplemented here: a local
  // 'day' is 23 or 25 hours twice a year, and the naive version of this silently
  // reports the wrong day across a DST transition.
  const localMidnight = new Date(startOfLocalDay(Date.now(), timeZone))
  const { data: todayXp } = await admin
    .from('xp_ledger')
    .select('amount')
    .eq('user_id', user.id)
    .gte('created_at', localMidnight.toISOString())

  const xpEarnedToday = (todayXp ?? []).reduce((sum, r) => sum + r.amount, 0)

  const { count: lessonsToday } = await admin
    .from('lessons')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('completed_at', localMidnight.toISOString())

  // ── decide correctness HERE, then grade ───────────────────────────────────
  //
  // The client's `wasCorrect` is ignored entirely. It used to be trusted, and a
  // modified client could post ten fabricated answers with `wasCorrect: true` and
  // mint XP, coins and mastery — the exact exploit ADR 0006 exists to prevent.
  //
  // An answer whose fact this server has never heard of is DROPPED rather than
  // marked wrong. During a content rollout a client can legitimately be one pack
  // ahead, and the two dishonest options are both worse: counting it correct pays
  // for something unverifiable, and counting it wrong punishes a user for our
  // release timing by damaging a real memory state.
  const graded = body.answers.filter((a) => ANSWER_BY_FACT[a.factId] !== undefined)
  const answers = graded.map((a) => ({
    ...a,
    // `chosenOptionId === null` is a timeout: unanswered, therefore not correct.
    wasCorrect: a.chosenOptionId !== null && ANSWER_BY_FACT[a.factId] === a.chosenOptionId,
  }))

  if (answers.length === 0) return json({ error: 'no_gradable_answers' }, 422)

  // ── decide WHEN, too ──────────────────────────────────────────────────────
  //
  // Correctness was decided here and time was not, so the server-authoritative claim
  // rested on a field the client picked. See _shared/submission-time.ts for what that
  // bought an attacker and why this clamps rather than rejects.
  const retimed = retimeLesson(answers, body.startedAt, Date.now())

  const result = gradeLesson({
    lessonId: body.lessonId,
    answers: retimed.answers,
    memory,
    // Server time is authoritative for the submission; per-answer timestamps
    // still drive scheduling so an offline lesson schedules from when it was
    // actually answered.
    now: Date.now(),
    xpEarnedToday,
    isFirstLessonOfDay: (lessonsToday ?? 0) === 0,
    masteredBefore,
  })

  // ── which countries are FINISHED ──────────────────────────────────────────
  //
  // `entity_mastered` was the last achievement event with no producer, and it could not
  // have one on the client: it means "every quizzable fact of this country is mastered",
  // a question about facts the lesson did not touch. `ach.countries.complete` and
  // `ach.set.nordics` both count it and both sat at zero.
  //
  // Answerable here, and only here. One extra query, bounded by the entities this lesson
  // actually moved — a lesson that mastered nothing runs none of this.
  const promotedEntities = [
    ...new Set(
      result.masteryChanges
        .filter((c) => c.to === 'mastered' || c.to === 'burnished')
        .map((c) => ANSWER_BY_FACT[c.factId])
        .filter((entity): entity is string => entity !== undefined),
    ),
  ]

  const entityMastered: string[] = []
  if (promotedEntities.length > 0) {
    const needed = promotedEntities.flatMap((e) => QUIZZABLE_FACTS_BY_ENTITY[e] ?? [])
    const { data: entityFacts } = await admin
      .from('user_facts')
      .select('fact_id, mastery')
      .eq('user_id', user.id)
      .in('fact_id', needed)

    // The rows this lesson is about to write are not in the table yet, so the freshly
    // graded state has to win over what was read. Reading after the write instead would
    // mean a second round trip inside the transaction's shadow.
    const level = new Map<string, string>(
      (entityFacts ?? []).map((r) => [r.fact_id, r.mastery as string]),
    )
    for (const change of result.masteryChanges) level.set(change.factId, change.to)

    for (const entity of promotedEntities) {
      const facts = QUIZZABLE_FACTS_BY_ENTITY[entity] ?? []
      if (facts.length === 0) continue
      const complete = facts.every((id) => {
        const m = level.get(id)
        return m === 'mastered' || m === 'burnished'
      })
      if (complete) entityMastered.push(entity)
    }
  }

  // ── the streak ────────────────────────────────────────────────────────────
  //
  // `applyActivity` has been tested and callerless since streaks were built, and
  // `streaks` written by one statement — the row the signup trigger creates. Home reads
  // `streaks.current`, so it has been zero for every user this product has ever had.
  //
  // The engine decides; this carries the decision. Null when nothing moved, which is the
  // second lesson of a day — five lessons must not be a five-day streak.
  const outcome = applyActivity(
    {
      current: streakRow?.current ?? 0,
      longest: streakRow?.longest ?? 0,
      lastActiveDate: streakRow?.last_active_date ?? null,
      freezesHeld: streakRow?.freezes_held ?? 0,
    },
    Date.now(),
    timeZone,
  )
  const streakChanged = outcome.extended || outcome.reset || outcome.freezeUsed

  // The milestone bonus the balance table has funded since it was written and nothing
  // has ever paid. Only when the streak actually moved, which is also what stops a
  // second lesson on day 7 collecting it again.
  const milestone = streakChanged
    ? streakMilestoneReward(outcome.current)
    : { xp: 0, coins: 0 }

  // ── persist, in ONE transaction ───────────────────────────────────────────
  //
  // This was five supabase-js calls — five transactions — and only the first one's error
  // was read. A failed XP insert left a lesson row claiming 140 XP against an empty
  // ledger, permanently, because the replay path returns that row and awards nothing.
  //
  // `record_lesson` does the lot behind one advisory lock: idempotency, rate limit,
  // lesson, log, memory cache, both ledgers, streak. See the migration for the ordering.
  const { data: recorded, error: recordError } = await admin.rpc('record_lesson', {
    p_user_id: user.id,
    p_lesson_id: body.lessonId,
    p_kind: body.kind,
    p_topic_id: body.topicId ?? null,
    p_items: result.items,
    p_correct: result.correct,
    p_xp: result.xpAwarded,
    p_coins: result.coinsAwarded,
    p_started_at: new Date(retimed.startedAt).toISOString(),
    p_client_version: body.clientVersion ?? null,
    p_reviews: result.reviews.map((r) => ({
      fact_id: r.factId,
      template_id: r.templateId,
      rating: r.rating,
      was_correct: r.wasCorrect,
      elapsed_ms: r.elapsedMs,
      created_at: new Date(r.at).toISOString(),
    })),
    p_facts: [...result.updatedMemory.values()].map((s) => ({
      fact_id: s.factId,
      stability: s.stability,
      difficulty: s.difficulty,
      reps: s.reps,
      lapses: s.lapses,
      last_review_at: s.lastReviewAt ? new Date(s.lastReviewAt).toISOString() : null,
      due_at: new Date(s.dueAt).toISOString(),
      suspended: s.suspended,
    })),
    p_streak: streakChanged
      ? {
          current: outcome.current,
          longest: outcome.longest,
          lastActiveDate: outcome.lastActiveDate,
          freezesHeld: outcome.freezesHeld,
        }
      : null,
    p_max_per_hour: BALANCE.integrity.maxLessonSubmitsPerHour,
    p_hearts_lost: Math.min(
      Math.max(Math.trunc(body.heartsLost ?? 0), 0),
      BALANCE.hearts.max * 10,
    ),
    p_streak_xp: milestone.xp,
    p_streak_coins: milestone.coins,
  })

  // An error here means NOTHING was written — that is the point of the function — so the
  // queue may retry the whole submission safely.
  if (recordError) return json({ error: 'persist_failed' }, 500)

  const outcomeStatus = (recorded as { status?: string } | null)?.status

  if (outcomeStatus === 'rate_limited') {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '600' },
    })
  }

  // Another request won the race between the pre-check and the lock. Idempotent, so
  // this is a success from the caller's point of view.
  if (outcomeStatus === 'replayed') {
    const row = recorded as { items: number; correct: number; xpAwarded: number; coinsAwarded: number }
    return json({
      lessonId: body.lessonId,
      items: row.items,
      correct: row.correct,
      xpAwarded: row.xpAwarded,
      coinsAwarded: row.coinsAwarded,
      replayed: true,
    })
  }

  // The id is taken by a lesson belonging to somebody else. A client-generated UUID
  // should never collide, so this is either a bug or an attempt to read another
  // account's result. Neither gets that account's numbers back.
  if (outcomeStatus === 'conflict') return json({ error: 'lesson_id_conflict' }, 409)

  return json({
    lessonId: result.lessonId,
    items: result.items,
    correct: result.correct,
    accuracy: result.accuracy,
    xpAwarded: result.xpAwarded,
    coinsAwarded: result.coinsAwarded,
    masteryChanges: result.masteryChanges,
    perfect: result.perfect,
    rejected: result.rejected,
    // Reviews the scheduler asked for and got right. `ach.review.faithful` counts these
    // and had no producer — the grader computed the number and dropped it.
    overdueCleared: result.overdueCleared,
    /** Countries whose every quizzable fact is now mastered. See above. */
    entityMastered,
    // The authoritative streak, so the summary can celebrate the real number rather than
    // a client guess — and so `welcome-back` and the streak screen have something true
    // to read the moment the queue flushes.
    streak: {
      current: outcome.current,
      longest: outcome.longest,
      extended: outcome.extended,
      freezeUsed: outcome.freezeUsed,
      reset: outcome.reset,
      /** Paid as its own ledger row, so the summary can celebrate it separately. */
      milestoneXp: milestone.xp,
      milestoneCoins: milestone.coins,
    },
    // Reported rather than swallowed, for the same reason `rejected` is: a spike in
    // either is the signal that a build is sending nonsense, and a number nobody
    // returns is a number nobody can graph.
    timingDiscarded: retimed.timingDiscarded,
    replayed: false,
  })
}

/**
 * The outer boundary. Nothing above may reach the runtime as a rejected promise.
 *
 * There was no catch here, and the two `new Date(...).toISOString()` calls below the
 * parser could both throw a RangeError on input that passed `typeof x === 'number'`.
 * That is fixed at the source now — `isFiniteMs` in the parser and the clamp after it —
 * but a handler whose correctness depends on nothing further down ever throwing is a
 * handler one refactor away from returning an unhandled rejection to a user who has just
 * finished a lesson.
 *
 * The message is not returned. It is the only place in this function where an internal
 * string could reach a device, and an error message is the classic accidental
 * exfiltration channel — a Postgres error quotes the row it failed on. The client is
 * told which request to quote; the log holds the rest.
 */
Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID()
  try {
    return await handle(req)
  } catch (error) {
    console.error(`submit-lesson ${requestId}`, error)
    return json({ error: 'internal_error', requestId }, 500)
  }
})

