-- Pay the achievement tiers, which is the last reward in the balance table nothing paid.
--
-- `BALANCE.xp.achievementByTier` (25/50/100/250/500) and `coins.achievementByTier`
-- (10/25/50/100/200) have been in the economy since it was written, and grepping either
-- found the balance table and nothing else. Thirty achievements could unlock, the client
-- celebrated them, and no XP and no coins moved.
--
-- `docs/systems/achievements.md §5` asks for exactly this and says why: "achievements
-- award XP and coins, so a client that could unlock them could mint currency". The
-- section had a status note on it recording that the server half was not built. It is
-- now, and the note goes with it.
--
-- ## What was NOT built, deliberately
--
-- A `claim_achievement(id, tier)` endpoint. It is a tenth of this work and it hands the
-- client the decision the whole section exists to take away — the same shape as the
-- shop before `purchase_item`, where the comment described a spend that did not exist.
--
-- ## Where the evaluation happens
--
-- In `submit-lesson`, with the SAME `evaluateAll` and the same catalogue the device runs,
-- over events the server produced: mastery changes it computed, the streak it decided,
-- the reviews it cleared, the quest it just paid, and the level the XP it just awarded
-- puts the user on. The catalogue is projected into the bundle by `build.ts` — a second
-- hand-maintained copy would not throw when it drifted, it would award the wrong thing.
--
-- ## The one rule whose meaning changed, and why it had to
--
-- `ach.explorer.continents` counted `region_started`, fired by OPENING A CONTINENT PAGE.
-- The server cannot see a navigation, and it should not have to: six taps completed a
-- gold tier, which was harmless while gold paid nothing and is a 100 XP exploit the
-- moment it does. The server emits the event for a region the user answered something
-- correctly in — which is what the copy has always said ("Start learning on every
-- continent") and is a thing that cannot be farmed by navigating.
--
-- ## Two tables, not one
--
-- `achievement_progress` is a cache of a projection: the counters the engine keeps, as
-- one jsonb blob per user, exactly as the device stores them. Losing it costs progress
-- towards the NEXT tier and nothing already earned.
--
-- `achievement_unlocks` is the ledger. Its primary key is (user, achievement, tier), so
-- a replayed evaluation inserts nothing and pays nothing — which is a stronger guarantee
-- than checking the progress blob, because progress is supplied by the caller and an
-- unlock is a fact this table owns.
--
-- Spec: docs/systems/achievements.md · docs/systems/xp-economy.md · ADR 0006

create table achievement_progress (
  user_id    uuid primary key references profiles(id) on delete cascade,
  -- `{ "ach.flags.collector": { achievementId, value, seen?, tier, unlockedAt? } }` —
  -- the engine's own `AchievementProgress`, keyed by id. Stored rather than modelled in
  -- columns because the shape belongs to the rule types, and a pack that adds a rule
  -- type must not need a migration.
  progress   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table achievement_unlocks (
  user_id        uuid not null references profiles(id) on delete cascade,
  achievement_id text not null,
  tier           text not null,
  -- What this tier actually paid, recorded beside the unlock rather than re-derived from
  -- the balance table later. A threshold can be retuned and a tier reward can change; what
  -- somebody was paid on the day is a fact, and a ledger that has to consult today's
  -- prices to explain yesterday's row is not a ledger.
  xp             int not null default 0 check (xp >= 0),
  coins          int not null default 0 check (coins >= 0),
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id, tier)
);

-- Readable by its owner: the achievements screen has a legitimate reason to know which
-- tiers are banked, and it is the user's own row. NO write policy, for the usual reason —
-- the absence is the control. A client that could insert here could pay itself.
alter table achievement_progress enable row level security;
alter table achievement_unlocks  enable row level security;

create policy achievement_progress_select on achievement_progress
  for select using (auth.uid() = user_id);
create policy achievement_unlocks_select on achievement_unlocks
  for select using (auth.uid() = user_id);

create index achievement_unlocks_user_idx on achievement_unlocks (user_id, unlocked_at desc);

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
  p_quest_date     date default null,
  p_quest_slots    text[] default '{}',
  p_quest_complete boolean default false,
  p_quest_task_xp    int default 0,
  p_quest_bonus_xp   int default 0,
  p_quest_bonus_coins int default 0,
  -- The engine's progress map after this lesson's events, as the caller computed it.
  -- Null skips the whole block, which is what a caller too old to send one gets.
  p_achievement_progress jsonb default null,
  -- [{achievement_id, tier, xp, coins}] — the tiers this lesson unlocked. NOT "tiers to
  -- pay": the unique key below decides that, under the same lock as everything else.
  p_achievement_unlocks  jsonb default '[]'::jsonb
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
  -- The achievement award, decided by the same engine the device runs. See the header.
  v_ach        jsonb;
  v_ach_xp     int := 0;
  v_ach_coins  int := 0;
  v_ach_paid   jsonb := '[]'::jsonb;
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

  -- ── achievements ──────────────────────────────────────────────────────────
  --
  -- The last reward in the balance table nothing paid. `achievements.md §5` asks for
  -- exactly this — evaluated "in the same edge function that grades a lesson" — and the
  -- caller has just done that with the same `evaluateAll` and the same catalogue the
  -- device runs, from events the SERVER produced.
  --
  -- Inside this transaction rather than beside it, for the reason the whole function
  -- exists: the progress row and the ledger rows it justifies must land together, or a
  -- user is charged a counter they were never paid for.
  --
  -- `achievement_unlocks` is what makes it once. The primary key is (user, achievement,
  -- tier), so a replayed evaluation inserts nothing and pays nothing — and that is a
  -- stronger guarantee than checking the progress row, because progress is a projection
  -- the caller supplies and an unlock is a fact this table owns.
  if p_achievement_progress is not null then
    insert into public.achievement_progress (user_id, progress, updated_at)
    values (p_user_id, p_achievement_progress, now())
    on conflict (user_id) do update set
      progress   = excluded.progress,
      updated_at = excluded.updated_at;

    -- Only the rows this insert actually created. `on conflict do nothing` plus
    -- `returning` is the whole idempotency: a tier already banked returns no row and is
    -- therefore paid nothing, however many times it is announced.
    with claimed as (
      insert into public.achievement_unlocks (user_id, achievement_id, tier, xp, coins)
      select
        p_user_id,
        u.achievement_id,
        u.tier,
        greatest(u.xp, 0),
        greatest(u.coins, 0)
      from jsonb_to_recordset(
        case when jsonb_typeof(p_achievement_unlocks) = 'array'
             then p_achievement_unlocks else '[]'::jsonb end
      ) as u(achievement_id text, tier text, xp int, coins int)
      on conflict (user_id, achievement_id, tier) do nothing
      returning achievement_id, tier, xp, coins
    )
    select
      coalesce(sum(xp), 0),
      coalesce(sum(coins), 0),
      coalesce(jsonb_agg(jsonb_build_object('achievementId', achievement_id, 'tier', tier)), '[]'::jsonb)
    into v_ach_xp, v_ach_coins, v_ach_paid
    from claimed;

    -- One ledger row for the lot rather than one per tier. `reason` answers "where did
    -- my XP come from", and three badges unlocked by one lesson are one event to the
    -- person who earned them.
    if v_ach_xp > 0 then
      insert into public.xp_ledger (user_id, amount, reason, ref_id)
      values (p_user_id, v_ach_xp, 'achievement', p_lesson_id::text);
    end if;
    if v_ach_coins > 0 then
      insert into public.coin_ledger (user_id, amount, reason, ref_id)
      values (p_user_id, v_ach_coins, 'achievement', p_lesson_id::text);
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
    'questBonusPaid', v_pay_bonus,
    'achievementXp', v_ach_xp,
    'achievementCoins', v_ach_coins,
    'achievementsPaid', v_ach_paid
  );
end;
$$;

-- The signature changed again, so the previous one is still callable under its own
-- argument list. Dropped for the reason the last three migrations gave: two overloads of
-- a SECURITY DEFINER function that writes the XP ledger is one more than anybody can
-- reason about, and the old one cannot pay an achievement.
drop function if exists public.record_lesson(
  uuid, uuid, lesson_kind, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb,
  int, int, int, int, date, text[], boolean, int, int, int
);

revoke all on function public.record_lesson(
  uuid, uuid, lesson_kind, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb,
  int, int, int, int, date, text[], boolean, int, int, int, jsonb, jsonb
) from public;
revoke all on function public.record_lesson(
  uuid, uuid, lesson_kind, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb,
  int, int, int, int, date, text[], boolean, int, int, int, jsonb, jsonb
) from anon;
revoke all on function public.record_lesson(
  uuid, uuid, lesson_kind, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb,
  int, int, int, int, date, text[], boolean, int, int, int, jsonb, jsonb
) from authenticated;
grant execute on function public.record_lesson(
  uuid, uuid, lesson_kind, text, int, int, int, int, timestamptz, text, jsonb, jsonb, jsonb,
  int, int, int, int, date, text[], boolean, int, int, int, jsonb, jsonb
) to service_role;
