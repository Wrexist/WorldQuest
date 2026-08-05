-- Pay the streak milestone the balance table has always funded.
--
-- `BALANCE.xp.streakMilestones` (50 / 200 / 500 / 1000) and
-- `BALANCE.coins.streakMilestones` (50 / 200 / 500) have been in the economy since it was
-- written, and nothing has ever read them. `isMilestone` existed to answer the question
-- and had no caller that paid anything; `applyStreakBonus` was on the reachability
-- allowlist as "server-authoritative reward maths" for a function that did not exist.
--
-- So a user reaching a hundred-day streak got the same reward as a user reaching
-- ninety-nine: nothing beyond the lesson itself. In a product whose retention model IS
-- the streak, the four moments most worth celebrating paid out zero.
--
-- ## Two extra arguments, not a second endpoint
--
-- The milestone is decided by the engine (`streakMilestoneReward`) from the outcome of
-- `applyActivity`, and lands here as two integers. It has to be inside `record_lesson`
-- rather than beside it for the reason that function exists at all: a bonus written in a
-- second transaction is a bonus that can be paid for a streak that rolled back, or lost
-- for one that did not.
--
-- Paid on the day the streak REACHES the number. `p_streak` is null when the engine
-- decided today's activity changed nothing — the second lesson of a day — so the bonus
-- cannot be collected twice by playing twice, and the guard is the same null that already
-- stops the streak itself being double-counted.
--
-- Recorded as its own ledger row rather than folded into the lesson's XP. "Where did my
-- XP come from" is the question `reason` exists to answer, and `streak:7` answers it in a
-- way `lesson:lesson` cannot.

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
  -- Hearts lost in this lesson. The column has existed since the schema landed and has
  -- been 0 on every row ever written, because nothing passed it — so "how often do hearts
  -- actually end a lesson?" was unanswerable from production while the economy simulation
  -- gated on its own model of it.
  p_hearts_lost    int  default 0,
  -- From `streakMilestoneReward(outcome.current)`, or 0.
  p_streak_xp      int  default 0,
  p_streak_coins   int  default 0
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

  return jsonb_build_object(
    'status', 'recorded',
    'items', p_items,
    'correct', p_correct,
    'xpAwarded', p_xp,
    'coinsAwarded', p_coins,
    'streakXp', coalesce(p_streak_xp, 0),
    'streakCoins', coalesce(p_streak_coins, 0)
  );
end;
$$;

-- The signature changed, so the old one is still there under its own argument list and
-- would still be callable. Dropped explicitly: two overloads of a SECURITY DEFINER
-- function that writes the XP ledger is one more than anybody can reason about, and the
-- old one does not know about `hearts_lost` or the milestone.
drop function if exists public.record_lesson(
  uuid, uuid, text, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb, int
);

revoke all on function public.record_lesson(
  uuid, uuid, lesson_kind, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb, int, int, int, int
) from public;
revoke all on function public.record_lesson(
  uuid, uuid, lesson_kind, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb, int, int, int, int
) from anon;
revoke all on function public.record_lesson(
  uuid, uuid, lesson_kind, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb, int, int, int, int
) from authenticated;
grant execute on function public.record_lesson(
  uuid, uuid, lesson_kind, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb, int, int, int, int
) to service_role;
