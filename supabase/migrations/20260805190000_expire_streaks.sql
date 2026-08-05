-- Notice the day somebody did NOT play.
--
-- `markBroken` is the last entry on the reachability gap list, and it has been there
-- because of a genuine asymmetry: every other streak transition is a reaction to
-- activity, and `record_lesson` handles those. A break is the ABSENCE of activity, and
-- nothing in a request-driven system ever runs on an absence.
--
-- The consequence is not cosmetic. `repairAvailability` opens on `brokenOn` and returns
-- `not-broken` when it is null — so streak repair, a 600-coin sink with a 48-hour window
-- and a 30-day cooldown, all of it written and tested, could never be offered to anyone.
-- The column it reads was never written by anything, so the feature was unreachable in
-- the same way the freeze was, for a subtler reason.
--
-- ## Per user, in the user's own day
--
-- A streak is a local-day rule, and "yesterday" in Auckland is two calendar days from
-- "yesterday" in Los Angeles. So the job compares each user's `last_active_date` against
-- `now() at time zone profiles.timezone`, which is the same question `startOfLocalDay`
-- answers in TypeScript. Running it hourly rather than daily is what makes that work: at
-- any given hour it is "tomorrow" for somebody, and a single daily run at UTC midnight
-- would break a Sydney streak twelve hours late and a Honolulu one twelve hours early.
--
-- Hourly and idempotent: a user whose streak is already recorded as broken is skipped, so
-- twenty-four runs a day cost twenty-four index scans and one write per user per break.
--
-- ## The freeze is spent here, not at the next lesson
--
-- `applyActivity` consumes a freeze when the next lesson lands, which is correct for the
-- streak number and too late for the user: somebody who misses Tuesday should see on
-- Wednesday morning that their run is safe, not discover it after they next play. So this
-- spends it — one day missed, a freeze in hand, `last_active_date` moves forward and the
-- run survives — and `applyActivity` then sees a one-day gap and simply extends.
--
-- Spec: docs/systems/progression.md · packages/engines/src/time/streak-recovery.ts

-- `repair_available_until` is a derived value the engine computes from `brokenOn` plus
-- REPAIR_WINDOW_HOURS, so storing both would be storing an answer beside its question.
-- The date the streak broke is the fact; the window is arithmetic on it.
alter table streaks add column broken_on date;

create or replace function public.expire_streaks()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired int := 0;
begin
  with due as (
    select
      s.user_id,
      s.current,
      s.freezes_held,
      s.last_active_date,
      -- The user's own today. `profiles.timezone` is validated on write, so this cannot
      -- raise on a zone Postgres does not know.
      (now() at time zone coalesce(p.timezone, 'UTC'))::date as local_today
    from public.streaks s
    join public.profiles p on p.id = s.user_id
    where s.last_active_date is not null
      and s.current > 0
      -- Already recorded. Idempotent, which is what makes an hourly schedule cheap.
      and s.broken_on is null
  ),
  -- A freeze covers exactly one missed day, and it is spent the moment that day passes
  -- rather than at the next lesson — a user who misses Tuesday should learn on Wednesday
  -- morning that their run is safe.
  frozen as (
    update public.streaks s
    set freezes_held = s.freezes_held - 1,
        freeze_used_on = d.local_today - 1,
        -- Moved forward, so the gap `applyActivity` sees at the next lesson is one day
        -- and it simply extends. Without this the freeze would be spent twice.
        last_active_date = d.local_today - 1
    from due d
    where s.user_id = d.user_id
      and d.local_today - d.last_active_date = 2
      and d.freezes_held > 0
    returning s.user_id
  ),
  broken as (
    update public.streaks s
    set current = 0,
        broken_on = d.local_today,
        -- `longest` is untouched, deliberately. A lost run still leaves an achievement
        -- behind, which is `applyActivity`'s rule and has to be this one's too.
        repair_available_until = (d.local_today::timestamptz + interval '48 hours')
    from due d
    where s.user_id = d.user_id
      and d.local_today - d.last_active_date > 1
      and s.user_id not in (select user_id from frozen)
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

-- ── the schedule ────────────────────────────────────────────────────────────
--
-- `pg_cron` rather than an edge function on a timer: the work is one statement over an
-- indexed table, and a function that wakes up to issue one query is a deployment, a
-- secret and a failure mode for no gain. Guarded because the extension is available on
-- hosted Supabase and not in every local stack — a migration that cannot apply from
-- empty is a migration CI cannot check, and `supabase db reset` from scratch is the one
-- thing that proves this schema builds.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema extensions;
    -- Unschedule first so re-running the migration against a database that already has
    -- the job does not raise. Forward-only means this file may be applied to a fresh
    -- database only, but a shadow/branch database can see it twice.
    perform extensions.cron.unschedule('expire-streaks')
    where exists (select 1 from extensions.cron.job where jobname = 'expire-streaks');

    perform extensions.cron.schedule(
      'expire-streaks',
      '7 * * * *',
      $job$ select public.expire_streaks() $job$
    );
  else
    raise notice 'pg_cron unavailable — expire_streaks() exists but is unscheduled. See the migration.';
  end if;
end $$;

-- Seven minutes past, not on the hour. Every scheduled job in every system defaults to
-- :00, and the one time this must not contend for a connection is the hour a user in
-- some timezone is opening the app to keep their streak.

create index streaks_expiry_idx on streaks (last_active_date)
  where broken_on is null and current > 0;
