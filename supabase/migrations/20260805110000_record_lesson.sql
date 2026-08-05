-- Recording a lesson: the row, the log, the memory, the ledgers and the streak, in one
-- transaction.
--
-- `submit-lesson` made five separate supabase-js calls, which is five transactions, and
-- read the error of exactly one of them. Every failure mode below was reachable:
--
--   · `xp_ledger` fails after `lessons` succeeds. The lesson row says the user earned
--     140 XP, the ledger has nothing, and `lessons.id` being the idempotency key makes
--     that permanent — every replay returns the original result and awards nothing. The
--     wallet triggers cannot help; they fire on a row that was never inserted.
--   · `user_facts` fails after `review_log` succeeds, and the cache no longer matches
--     the log it is supposed to be derivable from.
--   · Two concurrent submissions both pass the rate-limit count, because counting and
--     inserting were separate round trips. `maxLessonSubmitsPerHour` was a suggestion.
--
-- And one thing that was never wired at all: **streaks**. `streaks` has been written by
-- exactly one statement since the schema landed — the row the signup trigger creates.
-- `applyActivity` has existed, tested, in the engine the whole time with no caller, and
-- `fetchProgress` reads `streaks.current` straight onto Home. The streak has been zero
-- for every user who has ever played. The daily-streak mechanic, the freezes, the
-- milestones in the balance table and `ach.streak.keeper` all hang off that column.
--
-- ## Why a function and not four more `await`s with error checks
--
-- The same argument `wallet_totals_from_ledgers` made and this file inherits. Checked
-- errors would tell us a write failed; they would not undo the four that succeeded. Only
-- a transaction does that. And a transaction here is correct for ANY writer — a future
-- quest endpoint, a backfill, an admin correction — rather than for the one endpoint
-- somebody remembered.
--
-- The insert into `lessons` goes FIRST, deliberately, exactly as `record_subscription_event`
-- puts its event insert first: the primary key is the idempotency guarantee, so a
-- duplicate raises 23505 and aborts the statement before a single ledger row exists.
-- Awarding twice is a currency exploit; this ordering is what makes it impossible rather
-- than unlikely.
--
-- Spec: docs/engineering/data-model.md · docs/adr/0006-server-authoritative-progress.md

create or replace function public.record_lesson(
  p_user_id        uuid,
  p_lesson_id      uuid,
  p_kind           text,
  p_topic_id       text,
  p_items          int,
  p_correct        int,
  p_xp             int,
  p_coins          int,
  p_started_at     timestamptz,
  p_client_version text,
  -- [{fact_id, template_id, rating, was_correct, elapsed_ms, created_at}]
  p_reviews        jsonb,
  -- [{fact_id, stability, difficulty, reps, lapses, last_review_at, due_at, suspended}]
  p_facts          jsonb,
  -- {current, longest, last_active_date, freezes_held}, or null when the engine declined
  -- to move the streak — a second lesson on the same day, which must not count twice.
  p_streak         jsonb,
  p_max_per_hour   int
)
returns jsonb
language plpgsql
security definer
-- Empty search_path: SECURITY DEFINER, and it writes six tables no client may write. An
-- attacker-shadowed `xp_ledger` would be free currency. Every object below is qualified.
set search_path = ''
as $$
declare
  v_existing public.lessons%rowtype;
  v_recent   int;
  -- PostgREST hands a JSON `null` to a `jsonb` parameter as `'null'::jsonb`, which is a
  -- value and not SQL NULL — so `p_streak is not null` is TRUE for it and
  -- `jsonb_array_length` raises on it. Normalising once here is the difference between
  -- "no streak change" meaning what the caller meant and meaning a constraint violation.
  v_reviews  jsonb := case when jsonb_typeof(p_reviews) = 'array' then p_reviews else '[]'::jsonb end;
  v_facts    jsonb := case when jsonb_typeof(p_facts)   = 'array' then p_facts   else '[]'::jsonb end;
  v_streak   jsonb := case when jsonb_typeof(p_streak)  = 'object' then p_streak else null end;
begin
  -- One submission per user at a time. Without it the count below and the insert after
  -- it are a classic check-then-act: N concurrent requests with distinct lesson ids each
  -- see the same count and each pass. A transaction-scoped advisory lock is the cheapest
  -- correct answer — it needs no row to lock and it releases on commit or rollback,
  -- including the rollback nobody wrote code for.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- ── idempotency ───────────────────────────────────────────────────────────
  -- Scoped to the user, which the endpoint's own pre-check was not: it looked the lesson
  -- up by id alone, so anyone holding another user's lesson id could read back what they
  -- answered, how many they got right and what they earned.
  select * into v_existing
  from public.lessons
  where id = p_lesson_id and user_id = p_user_id;

  if found then
    return jsonb_build_object(
      'status', 'replayed',
      'items', v_existing.items,
      'correct', v_existing.correct,
      'xpAwarded', v_existing.xp_awarded,
      'coinsAwarded', v_existing.coins_awarded
    );
  end if;

  -- The id exists but belongs to somebody else. Not a replay and not ours to overwrite;
  -- the caller gets a distinct answer so it never reports another account's rewards.
  if exists (select 1 from public.lessons where id = p_lesson_id) then
    return jsonb_build_object('status', 'conflict');
  end if;

  -- ── rate limit ────────────────────────────────────────────────────────────
  select count(*) into v_recent
  from public.lessons
  where user_id = p_user_id and completed_at >= now() - interval '1 hour';

  if v_recent >= p_max_per_hour then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- ── the lesson row, first and on purpose ──────────────────────────────────
  insert into public.lessons
    (id, user_id, kind, topic_id, items, correct, xp_awarded, coins_awarded,
     started_at, completed_at, client_version)
  values
    (p_lesson_id, p_user_id, p_kind, p_topic_id, p_items, p_correct, p_xp, p_coins,
     p_started_at, now(), p_client_version);

  -- ── the append-only log ───────────────────────────────────────────────────
  if jsonb_array_length(v_reviews) > 0 then
    insert into public.review_log
      (user_id, fact_id, template_id, rating, was_correct, elapsed_ms, lesson_id, created_at)
    select
      p_user_id, r.fact_id, r.template_id, r.rating, r.was_correct, r.elapsed_ms,
      p_lesson_id, r.created_at
    from jsonb_to_recordset(v_reviews) as r(
      fact_id text, template_id text, rating smallint,
      was_correct boolean, elapsed_ms int, created_at timestamptz
    );
  end if;

  -- ── the derived cache ─────────────────────────────────────────────────────
  -- `mastery` is deliberately absent: it is derived by a trigger from these columns, so
  -- there is nothing here to get wrong. See 20260805090000_mastery_is_derived.sql.
  if jsonb_array_length(v_facts) > 0 then
    insert into public.user_facts
      (user_id, fact_id, stability, difficulty, reps, lapses,
       last_review_at, due_at, suspended, updated_at)
    select
      p_user_id, f.fact_id, f.stability, f.difficulty, f.reps, f.lapses,
      f.last_review_at, f.due_at, f.suspended, now()
    from jsonb_to_recordset(v_facts) as f(
      fact_id text, stability double precision, difficulty double precision,
      reps int, lapses int, last_review_at timestamptz, due_at timestamptz,
      suspended boolean
    )
    on conflict (user_id, fact_id) do update set
      stability      = excluded.stability,
      difficulty     = excluded.difficulty,
      reps           = excluded.reps,
      lapses         = excluded.lapses,
      last_review_at = excluded.last_review_at,
      due_at         = excluded.due_at,
      suspended      = excluded.suspended,
      updated_at     = excluded.updated_at;
  end if;

  -- ── the ledgers ───────────────────────────────────────────────────────────
  -- The wallet triggers do the rest, inside this same transaction.
  if p_xp > 0 then
    insert into public.xp_ledger (user_id, amount, reason, ref_id)
    values (p_user_id, p_xp, 'lesson:' || p_kind, p_lesson_id::text);
  end if;

  if p_coins > 0 then
    insert into public.coin_ledger (user_id, amount, reason, ref_id)
    values (p_user_id, p_coins, 'lesson:' || p_kind, p_lesson_id::text);
  end if;

  -- ── the streak ────────────────────────────────────────────────────────────
  -- Null when the engine decided today's activity changes nothing, which is the second
  -- lesson of the same day. `applyActivity` owns that decision; this only stores it.
  if v_streak is not null then
    insert into public.streaks
      (user_id, current, longest, last_active_date, freezes_held)
    values (
      p_user_id,
      (v_streak ->> 'current')::int,
      (v_streak ->> 'longest')::int,
      (v_streak ->> 'lastActiveDate')::date,
      (v_streak ->> 'freezesHeld')::smallint
    )
    on conflict (user_id) do update set
      current          = excluded.current,
      -- Monotonic in the database as well as in the engine. A longest streak that can go
      -- down is an achievement that can be taken away by a bug.
      longest          = greatest(public.streaks.longest, excluded.longest),
      last_active_date = excluded.last_active_date,
      freezes_held     = excluded.freezes_held;
  end if;

  return jsonb_build_object(
    'status', 'recorded',
    'items', p_items,
    'correct', p_correct,
    'xpAwarded', p_xp,
    'coinsAwarded', p_coins
  );
end;
$$;

-- PostgREST publishes every function in `public` as an RPC endpoint. This one is
-- SECURITY DEFINER and writes the XP ledger, so leaving it granted is one
-- /rest/v1/rpc/ call away from arbitrary currency. Only the edge function, running as
-- service_role, may call it.
revoke all on function public.record_lesson(
  uuid, uuid, text, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb, int
) from public;
revoke all on function public.record_lesson(
  uuid, uuid, text, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb, int
) from anon;
revoke all on function public.record_lesson(
  uuid, uuid, text, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb, int
) from authenticated;
grant execute on function public.record_lesson(
  uuid, uuid, text, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb, int
) to service_role;
