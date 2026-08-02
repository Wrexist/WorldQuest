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
import { startOfLocalDay } from '../../../packages/engines/src/time/index.ts'
import { ANSWER_BY_FACT } from './_content/answers.ts'

type SubmitBody = {
  lessonId: string
  kind: 'lesson' | 'quest' | 'review' | 'challenge' | 'event'
  topicId?: string
  startedAt: number
  answers: AnsweredItem[]
  clientVersion?: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/** Deliberately minimal. Anything not asserted here is not trusted. */
function parseBody(raw: unknown): SubmitBody | null {
  if (typeof raw !== 'object' || raw === null) return null
  const b = raw as Record<string, unknown>

  if (typeof b.lessonId !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.lessonId)) return null
  if (typeof b.startedAt !== 'number') return null
  if (!Array.isArray(b.answers) || b.answers.length === 0) return null
  // A lesson longer than the documented maximum is a forged payload, not a session.
  if (b.answers.length > 50) return null

  for (const a of b.answers) {
    if (typeof a !== 'object' || a === null) return null
    const item = a as Record<string, unknown>
    if (typeof item.factId !== 'string') return null
    if (typeof item.templateId !== 'string') return null
    // `wasCorrect` is deliberately NOT validated, because it is deliberately not
    // read. The server decides correctness itself further down.
    if (typeof item.elapsedMs !== 'number') return null
    if (typeof item.answeredAt !== 'number') return null
  }

  return b as unknown as SubmitBody
}

Deno.serve(async (req: Request): Promise<Response> => {
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

  // ── idempotency ───────────────────────────────────────────────────────────
  // The offline queue may replay any mutation. Returning the original result is
  // the whole contract; awarding twice would be a currency exploit.
  const { data: existing } = await admin
    .from('lessons')
    .select('id, items, correct, xp_awarded, coins_awarded')
    .eq('id', body.lessonId)
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

  // ── rate limit ────────────────────────────────────────────────────────────
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
  const { count } = await admin
    .from('lessons')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('completed_at', hourAgo)

  if ((count ?? 0) >= BALANCE.integrity.maxLessonSubmitsPerHour) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '600' },
    })
  }

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
  const { data: profile } = await admin
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single()

  // Imported from the engines package rather than reimplemented here: a local
  // 'day' is 23 or 25 hours twice a year, and the naive version of this silently
  // reports the wrong day across a DST transition.
  const localMidnight = new Date(startOfLocalDay(Date.now(), profile?.timezone ?? 'UTC'))
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

  const result = gradeLesson({
    lessonId: body.lessonId,
    answers,
    memory,
    // Server time is authoritative for the submission; per-answer timestamps
    // still drive scheduling so an offline lesson schedules from when it was
    // actually answered.
    now: Date.now(),
    xpEarnedToday,
    isFirstLessonOfDay: (lessonsToday ?? 0) === 0,
    masteredBefore,
  })

  // ── persist ───────────────────────────────────────────────────────────────
  // The lesson row goes first: its primary key is the idempotency guard, so a
  // concurrent duplicate loses here rather than double-writing the ledgers.
  const { error: lessonError } = await admin.from('lessons').insert({
    id: body.lessonId,
    user_id: user.id,
    kind: body.kind,
    topic_id: body.topicId ?? null,
    items: result.items,
    correct: result.correct,
    xp_awarded: result.xpAwarded,
    coins_awarded: result.coinsAwarded,
    started_at: new Date(body.startedAt).toISOString(),
    completed_at: new Date().toISOString(),
    client_version: body.clientVersion ?? null,
  })

  if (lessonError) {
    // 23505 = unique violation: another request won the race. Idempotent, so this
    // is a success from the caller's point of view.
    if (lessonError.code === '23505') {
      return json({ lessonId: body.lessonId, replayed: true }, 200)
    }
    return json({ error: 'persist_failed' }, 500)
  }

  if (result.reviews.length > 0) {
    await admin.from('review_log').insert(
      result.reviews.map((r) => ({
        user_id: user.id,
        fact_id: r.factId,
        template_id: r.templateId,
        rating: r.rating,
        was_correct: r.wasCorrect,
        elapsed_ms: r.elapsedMs,
        lesson_id: body.lessonId,
        created_at: new Date(r.at).toISOString(),
      })),
    )

    await admin.from('user_facts').upsert(
      [...result.updatedMemory.values()].map((s) => ({
        user_id: user.id,
        fact_id: s.factId,
        stability: s.stability,
        difficulty: s.difficulty,
        reps: s.reps,
        lapses: s.lapses,
        last_review_at: s.lastReviewAt ? new Date(s.lastReviewAt).toISOString() : null,
        due_at: new Date(s.dueAt).toISOString(),
        suspended: s.suspended,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id,fact_id' },
    )
  }

  if (result.xpAwarded > 0) {
    await admin.from('xp_ledger').insert({
      user_id: user.id,
      amount: result.xpAwarded,
      reason: `lesson:${body.kind}`,
      ref_id: body.lessonId,
    })
  }

  if (result.coinsAwarded > 0) {
    await admin.from('coin_ledger').insert({
      user_id: user.id,
      amount: result.coinsAwarded,
      reason: `lesson:${body.kind}`,
      ref_id: body.lessonId,
    })
  }

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
    replayed: false,
  })
})

