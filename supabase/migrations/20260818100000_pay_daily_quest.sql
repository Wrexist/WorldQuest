-- Pay the daily quest the balance table has always funded, and nothing has ever paid.
--
-- `BALANCE.xp.dailyQuestTask` (10 a slot), `BALANCE.xp.dailyQuest` (50 for all five) and
-- `BALANCE.coins.dailyQuest` (25) have been in the economy since the quest engine was
-- written. `applyQuestEvent` computes `xpAwarded` and the client drops it with the comment
-- "the server re-derives the same quest when it grades the lesson and awards the XP there
-- (ADR 0006)". The server did no such thing: grep the whole `submit-lesson` function for
-- the word quest and the only hits are the `lesson_kind` enum.
--
-- So the Daily Quest — the thing `docs/plan/build-order.md` calls "the reason to come
-- back" — paid nothing, every day, for everyone, while `QuestComplete` drew a "+50 XP"
-- tile and a "+25 coins" tile above a comment saying both were already in the ledger. And
-- `pnpm engines:simulate` gates the economy on a model that includes quest income, so the
-- shipped economy and the validated one were different economies.
--
-- ## Why the quest is PINNED rather than re-derived
--
-- The server cannot recompute the quest, and this is not for want of effort.
-- `generateDailyQuest` partitions facts by what is DUE at the moment of generation, and
-- by the time a lesson is submitted the answers in it have moved exactly those dates — so
-- the server would compose a different five tasks and pay for those. Nor can generation
-- move to the server: `docs/systems/quests-and-liveops.md` requires a quest that is
-- "always achievable with the content already on the device", and a quest that needs a
-- round trip is a quest that fails on a plane.
--
-- So the device composes it and the FIRST submission of the day pins it here. After that
-- the tasks are fixed: a client cannot swap in an easier quest once it knows what it
-- answered, because `on conflict do nothing` means the second attempt reads back the
-- first one's tasks. The client chooses the questions; it gets no vote on the answers.
--
-- ## What the server decides
--
-- Everything that pays. `replayQuest` in the engine replays the day's real evidence —
-- distinct correct answers from `review_log`, lessons from `lessons` — through the same
-- `applyQuestEvent` the device runs, so a slot is complete because the work is in the
-- server's own tables and for no other reason. `paid_slots` and `bonus_paid` here are
-- what make it once: a second lesson the same day pays only for slots the first did not.
--
-- Spec: docs/systems/quests-and-liveops.md · docs/systems/xp-economy.md · ADR 0006

create table daily_quests (
  user_id uuid not null references profiles(id) on delete cascade,
  -- The user's LOCAL date, decided server-side from `profiles.timezone`. A quest that
  -- rolls over at 2 a.m. local is a quest that resets in the middle of someone's evening.
  date    date not null,
  -- The five tasks as the device composed them, pinned on first sight. Stored rather than
  -- re-derived; see the header.
  tasks   jsonb not null,
  -- Slots already paid for. An array rather than five booleans because `Slot` is content's
  -- vocabulary, not the schema's — a pack that adds a sixth slot must not need a migration.
  paid_slots text[] not null default '{}',
  bonus_paid boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- Default-deny, like every other table here. Nothing on the client reads this: the device
-- composes its own quest and renders its own progress, and what it must NOT be able to do
-- is write the row that decides what it gets paid. The absence of any policy is the
-- control — `record_lesson` and `pin_daily_quest` are SECURITY DEFINER and bypass RLS.
alter table daily_quests enable row level security;

/**
 * Record the quest the device composed, unless one is already recorded for that day.
 *
 * `on conflict do nothing` and then a read, deliberately in that order: the return value
 * is always the PINNED quest, which is the first one seen and not necessarily the one just
 * offered. A client that re-composes a friendlier quest halfway through the day gets the
 * morning's tasks back and is scored against those.
 */
create or replace function public.pin_daily_quest(
  p_user_id uuid,
  p_date    date,
  p_tasks   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.daily_quests%rowtype;
begin
  insert into public.daily_quests (user_id, date, tasks)
  values (p_user_id, p_date, p_tasks)
  on conflict (user_id, date) do nothing;

  select * into v_row
  from public.daily_quests
  where user_id = p_user_id and date = p_date;

  return jsonb_build_object(
    'tasks', v_row.tasks,
    'paidSlots', to_jsonb(v_row.paid_slots),
    'bonusPaid', v_row.bonus_paid
  );
end;
$$;

-- Service role only, like `record_lesson`. A client that could pin its own quest could
-- pin one whose tasks were already complete.
revoke all on function public.pin_daily_quest(uuid, date, jsonb) from public;
revoke all on function public.pin_daily_quest(uuid, date, jsonb) from anon;
revoke all on function public.pin_daily_quest(uuid, date, jsonb) from authenticated;
grant execute on function public.pin_daily_quest(uuid, date, jsonb) to service_role;

create or replace function public.record_lesson(
  p_user_id        uuid,
  p_lesson_id      uuid,
  p_kind           lesson_kind,
  p_topic_id       text,
  p_items          int,
  p_correct        int,
  p_xp             int,
  p_coins          int,
  p_started_at     timestamptz,
  p_client_version text,
  p_reviews        jsonb,
  p_facts          jsonb,
  p_streak         jsonb,
  p_max_per_hour   int,
  p_hearts_lost    int  default 0,
  p_streak_xp      int  default 0,
  p_streak_coins   int  default 0,
  -- The user's local date, or null when this lesson carried no quest. Null is the
  -- ordinary case for a review or a taster, and it skips the whole block.
  p_quest_date     date default null,
  -- Slots the day's evidence completed, from `replayQuest`. NOT "slots to pay": this
  -- function subtracts what it has already paid, under the lock.
  p_quest_slots    text[] default '{}',
  p_quest_complete boolean default false,
  -- The rates, from `BALANCE`, exactly as `p_max_per_hour` comes from `BALANCE.integrity`.
  -- The caller here is the edge function under the service role, not a device.
  p_quest_task_xp    int default 0,
  p_quest_bonus_xp   int default 0,
  p_quest_bonus_coins int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.lessons%rowtype;
  v_recent   int;
  v_reviews  jsonb := case when jsonb_typeof(p_reviews) = 'array' then p_reviews else '[]'::jsonb end;
  v_facts    jsonb := case when jsonb_typeof(p_facts)   = 'array' then p_facts   else '[]'::jsonb end;
  v_streak   jsonb := case when jsonb_typeof(p_streak)  = 'object' then p_streak else null end;
  -- The quest award, decided HERE rather than by the caller. See the header.
  v_paid       text[];
  v_bonus_paid boolean;
  v_new_slots  text[];
  v_pay_bonus  boolean := false;
  v_quest_xp   int := 0;
  v_quest_coins int := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

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

  if exists (select 1 from public.lessons where id = p_lesson_id) then
    return jsonb_build_object('status', 'conflict');
  end if;

  select count(*) into v_recent
  from public.lessons
  where user_id = p_user_id and completed_at >= now() - interval '1 hour';

  if v_recent >= p_max_per_hour then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  insert into public.lessons
    (id, user_id, kind, topic_id, items, correct, hearts_lost, xp_awarded, coins_awarded,
     started_at, completed_at, client_version)
  values
    (p_lesson_id, p_user_id, p_kind, p_topic_id, p_items, p_correct,
     greatest(coalesce(p_hearts_lost, 0), 0), p_xp, p_coins,
     p_started_at, now(), p_client_version);

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

  if p_xp > 0 then
    insert into public.xp_ledger (user_id, amount, reason, ref_id)
    values (p_user_id, p_xp, 'lesson:' || p_kind::text, p_lesson_id::text);
  end if;

  if p_coins > 0 then
    insert into public.coin_ledger (user_id, amount, reason, ref_id)
    values (p_user_id, p_coins, 'lesson:' || p_kind::text, p_lesson_id::text);
  end if;

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
      longest          = greatest(public.streaks.longest, excluded.longest),
      last_active_date = excluded.last_active_date,
      freezes_held     = excluded.freezes_held;

    -- The milestone, in its own row so the ledger can say what it was for. Guarded by
    -- `v_streak is not null`, which is exactly the condition that stops a second lesson
    -- on the same day counting — so the bonus cannot be farmed by playing twice on day 7.
    if coalesce(p_streak_xp, 0) > 0 then
      insert into public.xp_ledger (user_id, amount, reason, ref_id)
      values (p_user_id, p_streak_xp, 'streak:' || (v_streak ->> 'current'), p_lesson_id::text);
    end if;
    if coalesce(p_streak_coins, 0) > 0 then
      insert into public.coin_ledger (user_id, amount, reason, ref_id)
      values (p_user_id, p_streak_coins, 'streak:' || (v_streak ->> 'current'), p_lesson_id::text);
    end if;
  end if;

  -- ── the daily quest ───────────────────────────────────────────────────────
  --
  -- Inside the same advisory lock as everything above, and that is the whole point of
  -- doing the arithmetic here rather than in the edge function. The caller evaluates
  -- WHICH slots the day's evidence completed; this decides which of those have not been
  -- paid yet, under a lock, so two lessons finishing together cannot both pay for the
  -- same slot. A caller that decided it would be performing a check-then-act across two
  -- transactions, which is the shape of every double-award bug.
  if p_quest_date is not null then
    select paid_slots, bonus_paid into v_paid, v_bonus_paid
    from public.daily_quests
    where user_id = p_user_id and date = p_quest_date
    for update;

    -- No pinned quest means nothing to pay against. A caller that skipped `pin_daily_quest`
    -- gets no award rather than an award for a quest nobody recorded.
    if found then
      -- The slots this lesson completed that have not been paid for. `array_agg` returns
      -- null on no rows, which every arithmetic below coalesces.
      select array_agg(distinct s) into v_new_slots
      from unnest(coalesce(p_quest_slots, '{}'::text[])) as s
      where s <> all (coalesce(v_paid, '{}'::text[]));
      v_quest_xp := coalesce(array_length(v_new_slots, 1), 0) * greatest(coalesce(p_quest_task_xp, 0), 0);

      v_pay_bonus := coalesce(p_quest_complete, false) and not v_bonus_paid;
      if v_pay_bonus then
        v_quest_xp := v_quest_xp + greatest(coalesce(p_quest_bonus_xp, 0), 0);
        v_quest_coins := greatest(coalesce(p_quest_bonus_coins, 0), 0);
      end if;

      if array_length(v_new_slots, 1) is not null or v_pay_bonus then
        update public.daily_quests
        set paid_slots = (
              select coalesce(array_agg(distinct s), '{}'::text[])
              from unnest(coalesce(v_paid, '{}'::text[]) || coalesce(v_new_slots, '{}'::text[])) as s
            ),
            bonus_paid = bonus_paid or v_pay_bonus
        where user_id = p_user_id and date = p_quest_date;
      end if;

      -- Its own ledger rows, like the streak milestone and for the same reason: "where
      -- did my XP come from" is the question `reason` exists to answer, and `lesson:lesson`
      -- cannot answer it for a quest bonus.
      if v_quest_xp > 0 then
        insert into public.xp_ledger (user_id, amount, reason, ref_id)
        values (p_user_id, v_quest_xp, 'quest:' || p_quest_date::text, p_lesson_id::text);
      end if;
      if v_quest_coins > 0 then
        insert into public.coin_ledger (user_id, amount, reason, ref_id)
        values (p_user_id, v_quest_coins, 'quest:' || p_quest_date::text, p_lesson_id::text);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'recorded',
    'items', p_items,
    'correct', p_correct,
    'xpAwarded', p_xp,
    'coinsAwarded', p_coins,
    'streakXp', coalesce(p_streak_xp, 0),
    'streakCoins', coalesce(p_streak_coins, 0),
    'questXp', v_quest_xp,
    'questCoins', v_quest_coins,
    'questSlotsPaid', to_jsonb(coalesce(v_new_slots, '{}'::text[])),
    'questBonusPaid', v_pay_bonus
  );
end;
$$;

-- The signature changed again, so the previous one is still callable under its own
-- argument list. Dropped for the reason the last migration gave: two overloads of a
-- SECURITY DEFINER function that writes the XP ledger is one more than anybody can reason
-- about, and the old one cannot pay a quest.
drop function if exists public.record_lesson(
  uuid, uuid, lesson_kind, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb, int, int, int, int
);

revoke all on function public.record_lesson(
  uuid, uuid, lesson_kind, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb,
  int, int, int, int, date, text[], boolean, int, int, int
) from public;
revoke all on function public.record_lesson(
  uuid, uuid, lesson_kind, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb,
  int, int, int, int, date, text[], boolean, int, int, int
) from anon;
revoke all on function public.record_lesson(
  uuid, uuid, lesson_kind, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb,
  int, int, int, int, date, text[], boolean, int, int, int
) from authenticated;
grant execute on function public.record_lesson(
  uuid, uuid, lesson_kind, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb,
  int, int, int, int, date, text[], boolean, int, int, int
) to service_role;
