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
import {
  COMPLETION_BONUS,
  TASK_XP,
  replayQuest,
  type DailyQuest,
  type QuestEvent,
  type QuestTask,
} from '../../../packages/engines/src/quests/progress.ts'
import {
  emptyProgress,
  evaluateAll,
  type AchievementProgress,
  type DomainEvent,
  type Unlock,
} from '../../../packages/engines/src/achievements/index.ts'
import { levelProgress } from '../../../packages/engines/src/xp/level.ts'
import { retimeLesson } from '../_shared/submission-time.ts'
// The request parser lives in `_shared` so it can be TESTED — this module imports
// `jsr:` specifiers and calls `Deno.serve`, so nothing in it is reachable by vitest.
// See `_shared/parse-submission.ts`.
import { parseBody, type SubmitBody } from '../_shared/parse-submission.ts'
import { ANSWER_BY_FACT, QUIZZABLE_FACTS_BY_ENTITY } from './_content/answers.ts'
import { ACHIEVEMENTS, REGION_BY_ENTITY } from './_content/achievements.ts'

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
  const [{ data: profile }, { data: streakRow }, { data: walletRow }, { data: achRow }] =
    await Promise.all([
      admin.from('profiles').select('timezone').eq('id', user.id).single(),
      admin
        .from('streaks')
        .select('current, longest, last_active_date, freezes_held')
        .eq('user_id', user.id)
        .maybeSingle(),
      // For `ach.level.climber`, which compares a LEVEL — so the total before this
      // lesson, plus what this lesson is about to award, is the number the rule wants.
      admin.from('wallets').select('xp_total').eq('user_id', user.id).maybeSingle(),
      // The engine's counters. Absent for a user who has never finished a lesson, which
      // `readProgress` reads as an empty map rather than as a failure.
      admin.from('achievement_progress').select('progress').eq('user_id', user.id).maybeSingle(),
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

  // ── the daily quest ───────────────────────────────────────────────────────
  //
  // The reward the balance table has funded since the quest engine was written and
  // nothing has ever paid. `applyQuestEvent` computes `xpAwarded`, the client drops it
  // saying the server awards it, and this function had no idea quests existed —
  // `QuestComplete` drew a "+50 XP" tile above a comment claiming it was already banked.
  //
  // The quest is composed on the device and cannot be recomposed here: it partitions
  // facts by what was DUE at generation time, and the answers in this very submission
  // have moved those dates. So the first submission of the day PINS it, and everything
  // that pays is decided from the server's own tables — see the migration.
  const questNow = Date.now()
  const quest = await evaluateQuest(
    admin,
    user.id,
    body.quest,
    // `retimed.answers`, not `body.answers`: the correctness on those is this function's,
    // decided from the vendored answer key.
    retimed.answers,
    { startedAt: retimed.startedAt, endedAt: questNow },
    timeZone,
    localMidnight,
  )

  // ── achievements ──────────────────────────────────────────────────────────
  //
  // The last reward in the balance table nothing paid. Evaluated with the SAME
  // `evaluateAll` and the same catalogue the device runs — vendored, not reimplemented —
  // over events this function decided rather than events it was told about.
  //
  // After the quest, because `daily_quest_completed` is one of them; before the write,
  // because the write is where the tiers are banked and paid in the same transaction as
  // the lesson that earned them.
  const achievementsBefore = readProgress((achRow as { progress?: unknown } | null)?.progress)
  const xpTotalAfter =
    ((walletRow as { xp_total?: number } | null)?.xp_total ?? 0) +
    result.xpAwarded +
    milestone.xp

  let achievementProgress = achievementsBefore
  const achievementUnlocks: Unlock[] = []
  const events = achievementEvents({
    graded: retimed.answers,
    masteryChanges: result.masteryChanges,
    entityMastered,
    overdueCleared: result.overdueCleared,
    streak: streakChanged ? outcome.current : null,
    accuracy: result.accuracy,
    // Server-clamped, like everything else the session rules read. `ach.session.speedrun`
    // asks for a perfect lesson under a minute, and a client-supplied duration would be a
    // legendary tier for anyone who could edit a number.
    durationMs: Math.max(0, Date.now() - retimed.startedAt),
    questCompleted: quest?.allComplete === true && quest.bonusAlreadyPaid === false,
    xpTotalAfter,
    at: Date.now(),
  })
  for (const event of events) {
    const evaluated = evaluateAll(ACHIEVEMENTS, achievementProgress, event)
    achievementProgress = evaluated.progress
    achievementUnlocks.push(...evaluated.unlocked)
  }

  /**
   * The regions the server credited, echoed so the device's own copy can agree.
   *
   * Read back off the event list rather than recomputed, so the two cannot drift: the
   * client's optimistic map and the server's authoritative one advance on exactly the
   * same members.
   */
  const regionsStarted = events
    .filter((event) => event.name === 'region_started')
    .map((event) => String(event.payload?.region ?? ''))
    .filter((region) => region !== '')

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
          // The bit `record_lesson` actually applies. `freezesHeld` above is derived
          // from a row read before `purchase_freeze` may have run, so writing it back
          // absolutely erases a freeze bought in between. What this lesson DECIDED is
          // one bit, and a delta commutes with a concurrent purchase.
          freezeUsed: outcome.freezeUsed,
        }
      : null,
    p_max_per_hour: BALANCE.integrity.maxLessonSubmitsPerHour,
    // Derived by the grader from server-decided correctness, not taken from the payload.
    // No clamp: the replay cannot produce a value outside 0..answers.length by
    // construction, and a clamp here would be a second rule quietly disagreeing with it.
    p_hearts_lost: result.heartsLost,
    p_streak_xp: milestone.xp,
    p_streak_coins: milestone.coins,
    // Null when this lesson carried no quest, which skips the whole block in the
    // function. `p_quest_slots` is what the evidence COMPLETED, not what to pay for —
    // `record_lesson` subtracts what it has already paid, under the same advisory lock
    // as the insert, so two lessons finishing together cannot both pay a slot.
    p_quest_date: quest?.date ?? null,
    p_quest_slots: quest?.completedSlots ?? [],
    p_quest_complete: quest?.allComplete ?? false,
    // From `BALANCE`, like `p_max_per_hour`. The caller here is this function under the
    // service role, not a device.
    p_quest_task_xp: TASK_XP,
    p_quest_bonus_xp: COMPLETION_BONUS,
    p_quest_bonus_coins: BALANCE.coins.dailyQuest,
    // The counters, as one blob, exactly as the device stores them.
    p_achievement_progress: Object.fromEntries(achievementProgress),
    // What the evaluation says was unlocked. NOT what to pay — the unique key on
    // `achievement_unlocks` decides that, so a tier already banked inserts nothing and
    // pays nothing however many times it is announced.
    p_achievement_unlocks: achievementUnlocks.map((unlock) => ({
      achievement_id: unlock.achievementId,
      tier: unlock.tier,
      ...tierReward(unlock.tier),
    })),
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
    /**
     * What the quest actually paid, so the summary can celebrate the real number.
     *
     * Zero is a normal answer and an informative one: it means every slot this lesson
     * completed had already been paid for by an earlier lesson today, which is exactly
     * what stops a five-slot quest paying five times over five lessons.
     */
    quest: {
      xp: (recorded as { questXp?: number } | null)?.questXp ?? 0,
      coins: (recorded as { questCoins?: number } | null)?.questCoins ?? 0,
      slotsPaid: (recorded as { questSlotsPaid?: string[] } | null)?.questSlotsPaid ?? [],
      bonusPaid: (recorded as { questBonusPaid?: boolean } | null)?.questBonusPaid ?? false,
    },
    /**
     * The tiers this lesson banked, and what they paid.
     *
     * The SERVER's list, not the device's: the client evaluates its own copy for an
     * immediate celebration, and this is the one that moved a balance. An empty list with
     * a non-empty local one means the device was ahead of the truth, which is the same
     * bargain every optimistic number here makes.
     */
    /** See `recordServerOutcome` — the device advances its own copy on these. */
    regionsStarted,
    achievements: {
      xp: (recorded as { achievementXp?: number } | null)?.achievementXp ?? 0,
      coins: (recorded as { achievementCoins?: number } | null)?.achievementCoins ?? 0,
      unlocked:
        (recorded as { achievementsPaid?: readonly { achievementId: string; tier: string }[] } | null)
          ?.achievementsPaid ?? [],
    },
    // Reported rather than swallowed, for the same reason `rejected` is: a spike in
    // either is the signal that a build is sending nonsense, and a number nobody
    // returns is a number nobody can graph.
    timingDiscarded: retimed.timingDiscarded,
    replayed: false,
  })
}

/**
 * What the day's real evidence says the quest has completed.
 *
 * ## The division of labour
 *
 * The device composes the quest — it must, because a quest has to be playable on a plane
 * and composing one needs the user's memory. The server pins the first composition it
 * sees for a local day, and then decides everything that pays from `review_log` and
 * `lessons`: its own tables, written by its own grader, from correctness it decided
 * itself. The client chooses the questions; it gets no vote on the answers.
 *
 * ## Why this reads the day rather than this lesson
 *
 * A quest is a day's work and is normally finished across several lessons. Scoring only
 * the current one would complete a slot in the rare case a single lesson covered it and
 * never otherwise. Reading the day also makes the whole thing idempotent by construction:
 * a replay recomputes the same completions, and `record_lesson` pays only for slots it
 * has not already paid.
 *
 * The rows for THIS lesson are not in the tables yet — `record_lesson` writes them — so
 * the answers just graded are folded in on top of what the day already holds.
 *
 * Returns null when there is nothing to score, which is the ordinary case for a review, a
 * taster, or a client too old to send one.
 */
async function evaluateQuest(
  admin: SupabaseClient,
  userId: string,
  quest: { date: string; tasks: QuestTask[] } | undefined,
  /**
   * The answers as THIS FUNCTION graded them, never the ones off the wire.
   *
   * The first version of this took `body` and read `answer.wasCorrect` from it, which is
   * the client's field — the one the header of this file says is ignored because trusting
   * it lets a modified client mint rewards. It would have been ignored for the lesson's
   * XP and believed for the quest's.
   */
  graded: readonly { factId: string; wasCorrect: boolean }[],
  /** Server-clamped, from `retimeLesson`. The `speed_round` goal is measured on it. */
  lesson: { startedAt: number; endedAt: number },
  timeZone: string,
  localMidnight: Date,
): Promise<{
  date: string
  completedSlots: string[]
  allComplete: boolean
  /**
   * The pinned row had already paid the all-five bonus before this submission.
   *
   * Carried out for the achievement counter rather than for the award — `record_lesson`
   * re-reads it under the lock to decide the payment. `ach.quest.regular` counts quests
   * finished, and it must count the DAY the fifth slot lands, not every lesson after it.
   */
  bonusAlreadyPaid: boolean
} | null> {
  if (quest === undefined) return null

  // The user's local date, decided here from `profiles.timezone` rather than taken from
  // the payload: it is the primary key of the row that records what has been paid, and a
  // caller who could choose it could collect a quest a day.
  const date = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())

  /**
   * The device composed this for a different day, so it is not today's quest.
   *
   * A lesson that spans local midnight is submitted on the new day carrying the old
   * day's five tasks. Pinning those would make the new day's quest unpayable for the
   * rest of it — the pinned facts are yesterday's, and today's evidence will not name
   * them. Skipping is the right answer: the next lesson pins the quest the user is
   * actually looking at.
   *
   * A COMPARISON, never a use. The server still decides the date, from
   * `profiles.timezone`, because the date is the primary key of the row recording what
   * has been paid. The worst a client can do by lying here is have its own quest
   * declined.
   */
  if (quest.date !== date) return null

  const { data: pinned, error: pinError } = await admin.rpc('pin_daily_quest', {
    p_user_id: userId,
    p_date: date,
    p_tasks: quest.tasks,
  })
  // A quest that could not be pinned is a quest nobody can be paid for. The lesson still
  // records — a failed bonus must never cost somebody the lesson behind it.
  if (pinError || !pinned) return null

  const tasks = (pinned as { tasks?: QuestTask[] }).tasks
  if (!Array.isArray(tasks) || tasks.length === 0) return null

  // Every fact the pinned quest names. Bounded by the payload validator, and the query is
  // filtered to them so a user with a long history still reads a small number of rows.
  const wanted = [...new Set(tasks.flatMap((t) => t.factIds))]

  const [{ data: dayReviews }, { data: dayLessons }] = await Promise.all([
    wanted.length === 0
      ? Promise.resolve({ data: [] as { fact_id: string }[] })
      : admin
          .from('review_log')
          .select('fact_id')
          .eq('user_id', userId)
          .eq('was_correct', true)
          .gte('created_at', localMidnight.toISOString())
          .in('fact_id', wanted),
    admin
      .from('lessons')
      .select('items, correct, started_at, completed_at')
      .eq('user_id', userId)
      .gte('completed_at', localMidnight.toISOString()),
  ])

  // Distinct, because a review slot asks for four FACTS and not four answers. `replayQuest`
  // enforces that too; doing it here as well keeps the event list small.
  const correctToday = new Set((dayReviews ?? []).map((r) => r.fact_id))
  // This lesson's own rows are not written yet, so its answers are folded in on top —
  // from the graded list, which is the one this function decided.
  for (const answer of graded) {
    if (answer.wasCorrect) correctToday.add(answer.factId)
  }

  const events: QuestEvent[] = [...correctToday].map((factId) => ({
    type: 'fact_answered',
    factId,
    correct: true,
  }))

  // The `perform` slot asks about a LESSON rather than about facts, so every lesson
  // finished today is replayed as one — including this one, which is not in the table.
  for (const lesson of dayLessons ?? []) {
    if (lesson.completed_at === null) continue
    events.push({
      type: 'lesson_completed',
      accuracy: lesson.items === 0 ? 0 : lesson.correct / lesson.items,
      durationMs: Math.max(0, Date.parse(lesson.completed_at) - Date.parse(lesson.started_at)),
    })
  }
  // And this lesson, which has no row yet. Both numbers are the server's: the accuracy
  // from the answers it graded, the duration from the timestamps it clamped.
  events.push({
    type: 'lesson_completed',
    accuracy:
      graded.length === 0 ? 0 : graded.filter((a) => a.wasCorrect).length / graded.length,
    durationMs: Math.max(0, lesson.endedAt - lesson.startedAt),
  })

  const scored: DailyQuest = replayQuest(
    { id: `${userId}:${date}`, date, tasks, complete: false, bonusClaimed: false },
    events,
  )

  return {
    date,
    completedSlots: scored.tasks.filter((t) => t.complete).map((t) => t.slot),
    allComplete: scored.tasks.every((t) => t.complete),
    bonusAlreadyPaid: (pinned as { bonusPaid?: boolean }).bonusPaid === true,
  }
}

/**
 * The achievements this lesson moved, from events the server itself produced.
 *
 * ## The same engine, not a second one
 *
 * `evaluateAll` and the catalogue are the ones the device runs — vendored by `build.ts`,
 * byte-identical to the source, asserted by a bundle guard. A server-side reimplementation
 * of thirty rules would not throw when it drifted from the client's; it would award the
 * wrong thing, quietly, for everyone.
 *
 * ## Which events, and why these
 *
 * Every one is something this function decided rather than something it was told:
 * mastery from the memory state it graded, the streak from `applyActivity`, the reviews
 * it cleared, the quest it just paid, and the level the XP it just awarded puts the user
 * on. `ach.level.climber` had no producer anywhere before this — nothing on the device
 * ever put a `level` in a payload, so its single tier could not move.
 *
 * `region_started` is the one whose MEANING changed, and it had to. It was fired by
 * opening a continent page: invisible to a server, and six taps for a gold tier the
 * moment gold started paying. Here it means the user answered something correctly in
 * that region, which is what the copy has always said.
 *
 * ## Ordering
 *
 * `daily_quest_completed` is emitted when this submission's own evaluation completed the
 * quest and the pinned row had not yet paid the bonus. Two lessons submitted concurrently
 * could both read `bonusPaid: false` and both emit it, over-counting a 5/30/100 counter
 * by one — narrow, and it can never over-PAY, because the unlock table is keyed on
 * (user, achievement, tier).
 */
function achievementEvents(input: {
  readonly graded: readonly { factId: string; wasCorrect: boolean }[]
  readonly masteryChanges: readonly { factId: string; to: string }[]
  readonly entityMastered: readonly string[]
  readonly overdueCleared: number
  readonly streak: number | null
  readonly accuracy: number
  readonly durationMs: number
  readonly questCompleted: boolean
  readonly xpTotalAfter: number
  readonly at: number
}): readonly DomainEvent[] {
  const { at } = input
  const events: DomainEvent[] = []

  for (const change of input.masteryChanges) {
    if (change.to !== 'mastered' && change.to !== 'burnished') continue
    // `geo.SE.capital` → attribute `capital`, entity `SE`. The BARE code, because
    // `distinctBy: 'entityId'` and every `members` list use it — `geo.SE` here would
    // count as a different country from `SE` in `ach.set.nordics`.
    const parts = change.factId.split('.')
    const attribute = parts[parts.length - 1] ?? ''
    const entityId = parts[1] ?? ''
    if (attribute === '' || entityId === '') continue
    events.push({
      name: 'fact_mastered',
      at,
      payload: { attribute, entityId, factId: change.factId },
    })
  }

  for (const entityId of input.entityMastered) {
    events.push({ name: 'entity_mastered', at, payload: { entityId } })
  }

  // One event per cleared review, because `counter` counts events — sending one carrying
  // the number would make a ten-review lesson worth one, and a 1000-tier take a decade.
  // Bounded by the answer count, which is already capped at 50 by the parser.
  const cleared = Math.min(Math.max(input.overdueCleared, 0), input.graded.length)
  for (let i = 0; i < cleared; i++) {
    events.push({ name: 'overdue_review_cleared', at, payload: {} })
  }

  if (input.streak !== null) {
    // `streak_extended` rather than `daily_lesson`: the name predates the rule and ships
    // in dashboards, so it is not renameable. `length` is the field the rule reads.
    events.push({ name: 'streak_extended', at, payload: { length: input.streak } })
  }

  events.push({
    name: 'lesson_completed',
    at,
    payload: { accuracy: input.accuracy, durationMs: input.durationMs },
  })

  if (input.questCompleted) {
    events.push({ name: 'daily_quest_completed', at, payload: {} })
  }

  // The regions this lesson actually earned something in. Distinct, because the
  // set-completion rule dedupes by member anyway and a shorter event list is cheaper.
  const regions = new Set<string>()
  for (const answer of input.graded) {
    if (!answer.wasCorrect) continue
    const entity = ANSWER_BY_FACT[answer.factId]
    const region = entity === undefined ? undefined : REGION_BY_ENTITY[entity]
    if (region !== undefined) regions.add(region)
  }
  for (const region of regions) {
    events.push({ name: 'region_started', at, payload: { region } })
  }

  // Absolute rather than incremental — `threshold` compares the stat the event reports.
  events.push({
    name: 'level_reached',
    at,
    payload: { level: levelProgress(Math.max(0, input.xpTotalAfter)).level },
  })

  return events
}

/**
 * The stored progress map, read back into the shape the engine wants.
 *
 * Shape-checked rather than cast, for the same reason the device checks its own copy: a
 * row whose `value` came back as a string makes `"3" + 1` into `"31"` and awards a
 * legendary tier on the fourth event. A bad row is dropped rather than the map — these
 * are independent counters, and one malformed badge must not reset the other twenty-nine.
 */
function readProgress(stored: unknown): Map<string, AchievementProgress> {
  const progress = new Map<string, AchievementProgress>()
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return progress

  for (const [id, row] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof row !== 'object' || row === null) continue
    const candidate = row as AchievementProgress
    if (typeof candidate.value !== 'number' || !Number.isFinite(candidate.value)) continue
    if (candidate.seen !== undefined && !Array.isArray(candidate.seen)) continue
    if (candidate.tier !== null && typeof candidate.tier !== 'string') continue
    progress.set(id, { ...candidate, achievementId: id })
  }
  return progress
}

/** The tier rewards, from the balance table. Unknown tiers pay nothing rather than NaN. */
function tierReward(tier: string): { xp: number; coins: number } {
  const xp = (BALANCE.xp.achievementByTier as Record<string, number | undefined>)[tier]
  const coins = (BALANCE.coins.achievementByTier as Record<string, number | undefined>)[tier]
  return { xp: xp ?? 0, coins: coins ?? 0 }
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

