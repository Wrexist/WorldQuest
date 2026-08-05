-- Six corrections from review, each one a rule this schema states and does not hold.
--
-- Forward-only, so none of them edits the migration that introduced the problem. The
-- history keeps the wrong version and the schema ends up right, which is the whole
-- point of the rule.

-- ── 1. one bad timezone stopped the job for everybody ───────────────────────
--
-- `expire_streaks` read `now() at time zone coalesce(p.timezone, 'UTC')` across every
-- user in one statement, and `AT TIME ZONE` RAISES on a zone Postgres does not know.
-- One such row aborts the statement, so no streak anywhere is frozen or broken — every
-- hour, silently, with the only trace in a cron log.
--
-- The comment claimed the column was validated on write. It is, since
-- `guard_profile_columns` — which lands in this same series, and only checks a value
-- that CHANGES. Every row written before it has never been checked, and that migration's
-- own header records that a plain PATCH used to accept nonsense. So the validation is
-- real, and the set of rows it covers is not all of them.
--
-- Verified rather than argued, on a real Postgres 16:
--
--   select (now() at time zone coalesce(timezone,'UTC'))::date from p;
--   ERROR:  time zone "Mars/Olympus" not recognized
--
-- and the same query with the left join below returns a row for all three users. A left
-- join against `pg_timezone_names` turns an unknown zone into UTC for that one user
-- instead of an exception for every user. It is ~1200 rows, hashed once, hourly.

create or replace function public.expire_streaks()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired int := 0;
begin
  -- The freeze first, then the breaks. Two sequential statements rather than two
  -- data-modifying CTEs, because CTEs share a snapshot, have no defined order between
  -- them, and a row reached twice in one statement is undefined behaviour.
  update public.streaks s
  set freezes_held = s.freezes_held - 1,
      freeze_used_on = ((now() at time zone coalesce(tz.name, 'UTC'))::date - 1),
      last_active_date = ((now() at time zone coalesce(tz.name, 'UTC'))::date - 1)
  from public.profiles p
  left join pg_timezone_names tz on tz.name = p.timezone
  where p.id = s.user_id
    and s.last_active_date is not null
    and s.current > 0
    and s.broken_on is null
    and s.freezes_held > 0
    and ((now() at time zone coalesce(tz.name, 'UTC'))::date - s.last_active_date) = 2;

  with broken as (
    update public.streaks s
    set current = 0,
        broken_on = (now() at time zone coalesce(tz.name, 'UTC'))::date,
        repair_available_until = now() + interval '48 hours'
    from public.profiles p
    left join pg_timezone_names tz on tz.name = p.timezone
    where p.id = s.user_id
      and s.last_active_date is not null
      and s.current > 0
      and s.broken_on is null
      and ((now() at time zone coalesce(tz.name, 'UTC'))::date - s.last_active_date) > 1
    returning s.user_id
  )
  select count(*) into v_expired from broken;

  return v_expired;
end;
$$;

revoke all on function public.expire_streaks() from public;
revoke all on function public.expire_streaks() from anon;
revoke all on function public.expire_streaks() from authenticated;
grant execute on function public.expire_streaks() to service_role;

-- ── 2. a broken streak could never break again ──────────────────────────────
--
-- `expire_streaks` skips any row whose `broken_on` is set, which is what makes an hourly
-- schedule cheap and idempotent. Nothing ever set it back to null. So the FIRST break a
-- user suffers is their last: the job excludes them for ever afterwards, `current` keeps
-- whatever the most recent lesson wrote, and the streak becomes unbreakable. The same
-- stale value keeps `repairAvailability` returning a repair offer whose 48-hour window
-- closed weeks ago, because it reads `brokenOn` and treats null as "not broken".
--
-- The event that ends a break is activity, and a trigger is what makes that true of every
-- writer rather than of the one upsert somebody remembers to patch — `record_lesson`
-- today, a repair RPC tomorrow, a backfill after that. The condition is exact: a break
-- recorded on day D means the user last played D-2 or earlier, so `last_active_date`
-- reaching D or later is a resumption and nothing else is.
create or replace function public.clear_streak_break_on_activity()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.broken_on is not null
     and new.last_active_date is not null
     and new.last_active_date >= new.broken_on then
    new.broken_on := null;
    new.repair_available_until := null;
  end if;
  return new;
end;
$$;

create trigger streaks_activity_clears_break
  before insert or update on public.streaks
  for each row execute function public.clear_streak_break_on_activity();

-- ── 3. `review_log` still had one way to be emptied ─────────────────────────
--
-- The append-only triggers cover update and delete. `truncate` is a separate trigger
-- event and fires neither. It is also the one a `service_role` connection — every edge
-- function — can issue, which is the exact threat model the original note described.
create trigger review_log_refuses_truncate
  before truncate on public.review_log
  for each statement execute function public.refuse_review_log_mutation();

-- ── 4. a legacy display name froze the whole profile ────────────────────────
--
-- The 40-character cap was checked on every update rather than on a CHANGE, so a user
-- whose name predates the cap could not edit their timezone, their handle, or anything
-- else: an unrelated PATCH re-validates a column nobody touched and raises. The guard is
-- for what a user is trying to write now. Existing rows are left as they are, because
-- truncating somebody's name behind their back is worse than a long name.
create or replace function public.guard_protected_profile_columns()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'id is immutable';
  end if;
  if new.role is distinct from old.role then
    raise exception 'role is set server-side';
  end if;
  if new.birth_year is distinct from old.birth_year then
    raise exception 'birth_year is set at signup';
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    raise exception 'deleted_at is set server-side';
  end if;
  if new.parent_id is distinct from old.parent_id then
    raise exception 'parent_id is set server-side';
  end if;

  if new.timezone is distinct from old.timezone
     and not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'timezone must be a known IANA zone';
  end if;

  if new.display_name is distinct from old.display_name
     and new.display_name is not null and length(new.display_name) > 40 then
    raise exception 'display_name is at most 40 characters';
  end if;

  if new.handle is distinct from old.handle
     and new.handle ~ '^(admin|administrator|moderator|mod|support|staff|worldquest|system|root|help)([_0-9]*)$' then
    raise exception 'that handle is reserved';
  end if;

  return new;
end;
$$;

-- ── 5. a lost purchase-vs-purchase race in `purchase_item` ──────────────────
--
-- The function checks ownership and then inserts into `inventory`. Two taps that both
-- pass the check leave the second to hit the unique index, which raises and surfaces as
-- an unhandled 500 — for a user who simply owns the thing already. The check answers the
-- common case; the constraint is what is actually true, so both should give the same
-- answer.
create or replace function public.purchase_item(p_item_id text)
returns jsonb
language plpgsql
security definer
-- Empty search_path: SECURITY DEFINER, and it writes the coin ledger. Every object
-- below is schema-qualified.
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_price int;
begin
  if v_user is null then
    return jsonb_build_object('status', 'unauthorized');
  end if;

  select price into v_price from public.shop_items where item_id = p_item_id;
  if not found then
    return jsonb_build_object('status', 'not_for_sale');
  end if;

  -- Never sell something twice. Checked before the ledger row rather than relying on the
  -- inventory primary key, because a second charge followed by a rolled-back insert is
  -- still a second charge in the eyes of whoever reads the ledger.
  if exists (select 1 from public.inventory where user_id = v_user and item_id = p_item_id) then
    return jsonb_build_object('status', 'already_owned');
  end if;

  -- A spend is a negative row. The wallet trigger applies it and the `coins >= 0` check
  -- refuses it if they cannot afford it — which aborts this whole function, so no
  -- inventory row survives a purchase that was never paid for.
  insert into public.coin_ledger (user_id, amount, reason, ref_id)
  values (v_user, -v_price, 'shop:purchase', p_item_id);

  insert into public.inventory (user_id, item_id, source)
  values (v_user, p_item_id, 'shop');

  return jsonb_build_object(
    'status', 'purchased',
    'itemId', p_item_id,
    'spent', v_price,
    'coins', (select coins from public.wallets where user_id = v_user)
  );
exception
  -- 23514 is the `coins >= 0` check. It is the overdraft answer, not an error — the
  -- caller gets a state, and the transaction is already rolled back by the time we are
  -- here, so nothing was charged and nothing was granted.
  when check_violation then
    return jsonb_build_object('status', 'insufficient_funds');
  -- 23505 is the inventory primary key. The ownership check above answers the common
  -- case and the constraint is what is actually TRUE, so two taps that both pass the
  -- check must not end in an unhandled 500 for a user who owns the thing either way.
  -- Same reasoning as the check above: the transaction is already rolled back, so the
  -- coin row from this attempt is gone and only the first purchase was ever charged.
  when unique_violation then
    return jsonb_build_object('status', 'already_owned');
end;
$$;

revoke all on function public.purchase_item(text) from public;
revoke all on function public.purchase_item(text) from anon;
grant execute on function public.purchase_item(text) to authenticated;

-- ── 6. `record_lesson` overwrote a freeze bought mid-flight ─────────────────
--
-- Replaced whole, because a function is replaced whole. The only change is the
-- `freezes_held` line in the streak upsert; see the comment on it.
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
      -- A DELTA, not the client's snapshot. `submit-lesson` reads `freezes_held`,
      -- calls `applyActivity`, and sends back the resulting count — so a freeze bought
      -- in between those two moments was overwritten out of existence by a number that
      -- predated it. 400 coins, gone, and the user finds out on the day the freeze was
      -- supposed to save their run.
      --
      -- What the engine actually decided is one bit: did this lesson spend a freeze.
      -- Applying that to the CURRENT row commutes with a concurrent purchase, which an
      -- absolute write can never do.
      freezes_held     = greatest(
        0,
        public.streaks.freezes_held
          - case when coalesce((v_streak ->> 'freezeUsed')::boolean, false) then 1 else 0 end
      );

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
