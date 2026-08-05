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
  -- ── the freeze, first ─────────────────────────────────────────────────────
  --
  -- Two sequential UPDATEs rather than two data-modifying CTEs in one statement, and the
  -- ordering is the reason. CTEs in a single statement all see the SAME snapshot and
  -- execute without a defined order between them, so "break everyone who was not just
  -- frozen" would have been reading a set the planner is free to compute concurrently —
  -- and both branches target `streaks`, where a row reached twice in one statement is
  -- undefined behaviour rather than an error. The overlap is real: a two-day gap with a
  -- freeze in hand matches both WHERE clauses.
  --
  -- Sequential statements make the dependency an ordering rather than a hope, and the
  -- whole function is one transaction, so nothing observes the state in between.
  update public.streaks s
  set freezes_held = s.freezes_held - 1,
      freeze_used_on = ((now() at time zone coalesce(p.timezone, 'UTC'))::date - 1),
      -- Moved forward, so the gap `applyActivity` sees at the next lesson is one day and
      -- it simply extends. Without this the freeze would be spent again tomorrow.
      last_active_date = ((now() at time zone coalesce(p.timezone, 'UTC'))::date - 1)
  from public.profiles p
  where p.id = s.user_id
    and s.last_active_date is not null
    and s.current > 0
    and s.broken_on is null
    and s.freezes_held > 0
    and ((now() at time zone coalesce(p.timezone, 'UTC'))::date - s.last_active_date) = 2;

  -- ── then the breaks ───────────────────────────────────────────────────────
  --
  -- Anything still more than a day behind after the freezes were spent. A user who was
  -- just frozen no longer matches, because their `last_active_date` moved.
  with broken as (
    update public.streaks s
    set current = 0,
        broken_on = (now() at time zone coalesce(p.timezone, 'UTC'))::date,
        -- `now()`, not a cast of the local date: casting a date to timestamptz resolves
        -- against the SESSION timezone, which is the server's and not the user's, and
        -- would put the 48-hour window hours off for most of the world.
        repair_available_until = now() + interval '48 hours'
        -- `longest` is untouched, deliberately. A lost run still leaves an achievement
        -- behind, which is `applyActivity`'s rule and has to be this one's too.
    from public.profiles p
    where p.id = s.user_id
      and s.last_active_date is not null
      and s.current > 0
      and s.broken_on is null
      and ((now() at time zone coalesce(p.timezone, 'UTC'))::date - s.last_active_date) > 1
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
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron unavailable — expire_streaks() exists, unscheduled. Schedule it by hand.';
    return;
  end if;

  create extension if not exists pg_cron;

  -- Unschedule first, so applying this against a database that already has the job is a
  -- no-op rather than a duplicate-name error. Forward-only means a fresh database sees
  -- this once; a branch or shadow database can see it twice.
  perform cron.unschedule('expire-streaks')
  where exists (select 1 from cron.job where jobname = 'expire-streaks');

  perform cron.schedule('expire-streaks', '7 * * * *', $job$ select public.expire_streaks() $job$);
exception
  -- The SCHEDULE is an optimisation of when the function runs; the function is the
  -- feature. pg_cron's schema placement differs between hosted Supabase and a local
  -- stack, and `create extension` can refuse relocation outright — a migration that
  -- cannot apply because a scheduler is laid out differently on one host is a far worse
  -- outcome than a job somebody has to add by hand. `supabase db reset` from empty is
  -- what proves this schema builds, and it has to keep working.
  when others then
    raise notice 'could not schedule expire-streaks (%). The function exists; schedule it by hand.', sqlerrm;
end $$;

-- Seven minutes past, not on the hour. Every scheduled job in every system defaults to
-- :00, and the one time this must not contend for a connection is the hour a user in
-- some timezone is opening the app to keep their streak.

create index streaks_expiry_idx on streaks (last_active_date)
  where broken_on is null and current > 0;
