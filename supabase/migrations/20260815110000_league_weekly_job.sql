-- The league's weekly machinery: place people, keep the score, close the week.
--
-- `20260813100000_create_leagues.sql` built the tables and said "Placement is the
-- server's, always — cohort assignment, weekly XP and the end-of-week roll are all
-- service-role work". It shipped none of them, so `league_members` was a table nothing
-- ever wrote to and the client half reads an empty cohort for everybody. This is the
-- half that was missing.
--
--   · `league_handle(uuid)`      — the SQL side of `handleFor`, asserted equal to it.
--   · `league_refresh_xp()`      — hourly. Recomputes `weekly_xp` from `xp_ledger`.
--   · `league_place_members()`   — hourly. Places eligible users into this week's cohort.
--   · `league_close_week()`      — Monday 00:05 UTC. Promotes, relegates, pays the podium.
--
-- ## Why XP is recomputed rather than incremented
--
-- `weekly_xp` is a cache of a question `xp_ledger` already answers: how much has this
-- user earned since Monday. Incrementing it from `record_lesson` would make it a second
-- source of truth that can drift — a replayed submit, a corrected row, a backfill — and
-- `supabase/CLAUDE.md` rule 6 is explicit that ledgers are the record and everything else
-- is a rebuildable cache. Recomputing costs one indexed aggregate per active member and
-- can never disagree with the ledger it came from.
--
-- The user-visible consequence is a leaderboard up to an hour behind. That is the right
-- trade for a WEEKLY competition, and it is why the screen shows hours remaining rather
-- than a live position: nothing in this feature is a race against a clock.
--
-- ## Cohorts are matched on activity, not shuffled
--
-- Spec §4: "random cohorts are the reason leagues feel unfair". `band` buckets recent
-- earning by order of magnitude, so a ten-minute-a-day learner meets other ten-minute-a-day
-- learners rather than somebody doing two hours. Bucketed rather than percentile-ranked
-- because a percentile moves whenever the population does, and the same user with the same
-- habit would drift between bands for reasons they cannot see. No history means the
-- newcomer band (`band is null`) — a first week spent in last place is the surest way to
-- lose somebody in week two.
--
-- ## Idempotent, all of it
--
-- Every function is safe to run twice: placement skips users already placed this week,
-- the XP refresh is an overwrite, and the close is guarded by `closed_at`. pg_cron does
-- not promise exactly-once, and the first production run of any of these will be somebody
-- running it by hand.

-- ── where the week leaves you ────────────────────────────────────────────────
--
-- The rank a member carries INTO next week, written by `league_close_week`. Stored
-- rather than recomputed at placement time because the cohort a member was in does not
-- say what the week did to them, and recomputing it would mean re-deriving thirty
-- positions from a ledger that has since moved on.

alter table public.league_members add column next_tier text
  check (next_tier in ('bronze','silver','gold','sapphire','ruby','diamond','legend'));
alter table public.league_members add column next_division smallint
  check (next_division between 1 and 3);

alter table public.league_cohorts add column closed_at timestamptz;

-- ── the handle, in SQL ───────────────────────────────────────────────────────
--
-- The same construction as `packages/engines/src/leagues/handles.ts`: FNV-1a over the
-- user id, then an adjective, a noun and two digits. Two copies of a word list is
-- exactly the drift this repo keeps finding, so `handles.test.ts` reads THIS FILE and
-- asserts both lists and a sample of generated handles match the TypeScript. If somebody
-- adds a word to one, the test fails rather than two users quietly getting different
-- names on the server and the client.
--
-- It lives here rather than being called from the app because placement is the server's
-- (ADR 0006), and a handle proposed by a device is a display name by another route.

create or replace function public.league_handle(p_user_id uuid, p_salt int default 0)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  adjectives constant text[] := array[
    'amber', 'arctic', 'bold', 'brave', 'bright', 'brisk', 'calm', 'cheerful',
    'clever', 'cobalt', 'coral', 'cosmic', 'curious', 'daring', 'dawn', 'deft',
    'dusty', 'eager', 'early', 'emerald', 'far', 'fleet', 'gentle', 'golden',
    'granite', 'hardy', 'high', 'jade', 'keen', 'kind', 'lively', 'lunar',
    'mellow', 'merry', 'misty', 'noble', 'north', 'olive', 'opal', 'patient',
    'quick', 'quiet', 'rapid', 'ready', 'roving', 'ruby', 'sage', 'sandy',
    'silver', 'snowy', 'solar', 'south', 'spry', 'steady', 'sunny', 'swift',
    'tidy', 'tranquil', 'true', 'vivid', 'wandering', 'warm', 'west', 'wild',
    'wise'
  ];
  nouns constant text[] := array[
    'atlas', 'basin', 'bay', 'beacon', 'bluff', 'canyon', 'cape', 'cavern',
    'channel', 'cliff', 'coast', 'compass', 'cove', 'crater', 'creek', 'delta',
    'dune', 'estuary', 'fjord', 'forest', 'geyser', 'glacier', 'glade', 'gorge',
    'grove', 'harbour', 'highland', 'hollow', 'inlet', 'island', 'isthmus', 'lagoon',
    'lake', 'lantern', 'ledge', 'marsh', 'meadow', 'mesa', 'moor', 'oasis',
    'orbit', 'peak', 'plateau', 'prairie', 'quarry', 'rapids', 'reef', 'ridge',
    'river', 'savanna', 'sextant', 'shoal', 'sound', 'spring', 'steppe', 'strait',
    'summit', 'tundra', 'valley', 'wharf'
  ];
  input      text := case when p_salt = 0 then p_user_id::text else p_user_id::text || '#' || p_salt end;
  value      bigint := 2166136261;
  i          int;
begin
  -- FNV-1a, 32-bit. `& 4294967295` is the `>>> 0` the JavaScript ends on: the same bits,
  -- read unsigned. A UUID is ASCII, so `ascii()` and `charCodeAt()` agree character for
  -- character.
  for i in 1..length(input) loop
    value := (value # ascii(substr(input, i, 1)))::bigint;
    value := (value * 16777619) & 4294967295;
  end loop;

  return initcap(adjectives[(value % 65) + 1])
      || ' ' || initcap(nouns[((value / 65) % 60) + 1])
      || ' ' || lpad(((value / (65 * 60)) % 100)::text, 2, '0');
end;
$$;

revoke all on function public.league_handle(uuid, int) from public;
revoke all on function public.league_handle(uuid, int) from anon;
revoke all on function public.league_handle(uuid, int) from authenticated;

comment on function public.league_handle(uuid, int) is
  'The SQL side of handleFor(). handles.test.ts reads this file and asserts it agrees with the TypeScript.';

-- ── the score ────────────────────────────────────────────────────────────────

create or replace function public.league_refresh_xp()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched int;
  week_start date := (date_trunc('week', now() at time zone 'utc'))::date;
begin
  update public.league_members m
     set weekly_xp = earned.total
    from public.league_cohorts c,
         lateral (
           select coalesce(sum(l.amount), 0)::int as total
             from public.xp_ledger l
            where l.user_id = m.user_id
              and l.created_at >= c.week_id::timestamptz
         ) earned
   where c.id = m.cohort_id
     and c.week_id = week_start
     and m.weekly_xp is distinct from earned.total;

  get diagnostics touched = row_count;
  return touched;
end;
$$;

revoke all on function public.league_refresh_xp() from public;
revoke all on function public.league_refresh_xp() from anon;
revoke all on function public.league_refresh_xp() from authenticated;

comment on function public.league_refresh_xp() is
  'Recomputes weekly_xp from xp_ledger for the current week. The ledger is the record; this is a cache (supabase/CLAUDE.md rule 6).';

-- ── placement ────────────────────────────────────────────────────────────────

create or replace function public.league_band(p_user_id uuid)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when coalesce(sum(l.amount), 0) = 0 then null
           else least(9, (log(10, greatest(coalesce(sum(l.amount), 1), 1)) * 2)::int)::smallint
         end
    from public.xp_ledger l
   where l.user_id = p_user_id
     and l.created_at >= now() - interval '14 days';
$$;

revoke all on function public.league_band(uuid) from public;
revoke all on function public.league_band(uuid) from anon;
revoke all on function public.league_band(uuid) from authenticated;

create or replace function public.league_place_members()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  week_start date := (date_trunc('week', now() at time zone 'utc'))::date;
  placed     int := 0;
  candidate  record;
  target     uuid;
  want_tier  text;
  want_div   smallint;
  want_band  smallint;
  try        int;
  candidate_handle text;
begin
  for candidate in
    select p.id as user_id
      from public.profiles p
     where not p.is_child
       -- Absence of a row means opted IN, which is what "opt-out in one tap" (§4) means.
       and not exists (
             select 1 from public.league_opt_outs o
              where o.user_id = p.id and o.opted_out
           )
       and not exists (
             select 1
               from public.league_members m
               join public.league_cohorts c on c.id = m.cohort_id
              where m.user_id = p.id and c.week_id = week_start
           )
       -- Active recently. A dormant account placed into a cohort is a zero row that
       -- `standings()` removes anyway — so placing them costs a row and achieves nothing.
       and exists (
             select 1 from public.xp_ledger l
              where l.user_id = p.id
                and l.created_at >= now() - interval '14 days'
           )
     limit 5000
  loop
    -- Where the last completed week left them, or the bottom of the ladder.
    select m.next_tier, m.next_division
      into want_tier, want_div
      from public.league_members m
      join public.league_cohorts c on c.id = m.cohort_id
     where m.user_id = candidate.user_id
       and m.next_tier is not null
     order by c.week_id desc
     limit 1;

    want_tier := coalesce(want_tier, 'bronze');
    want_div  := coalesce(want_div, 3);
    want_band := public.league_band(candidate.user_id);

    -- An open cohort at that rank and band, or a new one. `skip locked` so two
    -- concurrent runs cannot both fill the last seat of the same cohort.
    select c.id
      into target
      from public.league_cohorts c
     where c.week_id = week_start
       and c.tier = want_tier
       and c.division = want_div
       and c.band is not distinct from want_band
       and c.closed_at is null
       and (select count(*) from public.league_members m where m.cohort_id = c.id) < 30
     order by c.created_at
     limit 1
       for update skip locked;

    if target is null then
      insert into public.league_cohorts (week_id, tier, division, band)
      values (week_start, want_tier, want_div, want_band)
      returning id into target;
    end if;

    -- Salt until the handle is unique WITHIN the cohort. Thirty draws from 390,000 make
    -- a collision a rounding error, and `handleFor`'s salt parameter exists for exactly
    -- this: the scheme stays deterministic per (user, cohort) without a global uniqueness
    -- index over 390,000 strings.
    try := 0;
    loop
      candidate_handle := public.league_handle(candidate.user_id, try);
      exit when not exists (
        select 1 from public.league_members m
         where m.cohort_id = target and m.handle = candidate_handle
      ) or try >= 20;
      try := try + 1;
    end loop;

    insert into public.league_members (cohort_id, user_id, handle, weekly_xp)
    values (target, candidate.user_id, candidate_handle, 0)
    on conflict (cohort_id, user_id) do nothing;

    placed := placed + 1;
  end loop;

  return placed;
end;
$$;

revoke all on function public.league_place_members() from public;
revoke all on function public.league_place_members() from anon;
revoke all on function public.league_place_members() from authenticated;

comment on function public.league_place_members() is
  'Places eligible users into a cohort for the current week, matched on rank and activity band. Idempotent.';

-- ── closing the week ─────────────────────────────────────────────────────────
--
-- Promotion, relegation and the podium, mirroring `outcomeFor` and `podiumCoins` in
-- packages/engines/src/leagues. The rank arithmetic is the engine's `rankIndex` laid
-- out as a ladder of 21 rungs: Bronze III is 0 and Legend I is 20.
--
-- Relegation is measured from the BOTTOM OF THIS COHORT rather than from 30, exactly as
-- the engine does: a cohort that lost members to inactivity is smaller, and relegating
-- "positions 26–30" out of a cohort of 22 would relegate nobody at all.
--
-- Bronze III has nowhere to fall. That floor is a kindness rule, not a balance one —
-- a ladder that only ever says you are getting worse is one people leave.

create or replace function public.league_close_week()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  tiers constant text[] := array['bronze','silver','gold','sapphire','ruby','diamond','legend'];
  closed  int := 0;
  cohort  record;
  member  record;
  size    int;
  idx     int;
  new_idx int;
begin
  for cohort in
    select c.* from public.league_cohorts c
     where c.closed_at is null
       and c.week_id < (date_trunc('week', now() at time zone 'utc'))::date
     for update skip locked
  loop
    -- Inactive members are not ranked — the same rule as `standings()`, and the same
    -- reason: nobody's absence becomes somebody else's leaderboard.
    select count(*) into size
      from public.league_members m
     where m.cohort_id = cohort.id and m.weekly_xp > 0;

    idx := (array_position(tiers, cohort.tier) - 1) * 3 + (3 - cohort.division);

    for member in
      select m.user_id, m.weekly_xp,
             row_number() over (order by m.weekly_xp desc, m.handle asc) as position
        from public.league_members m
       where m.cohort_id = cohort.id and m.weekly_xp > 0
    loop
      new_idx := case
                   when member.position <= 7 then least(20, idx + 1)
                   when member.position > size - 5 then greatest(0, idx - 1)
                   else idx
                 end;

      update public.league_members m
         set next_tier = tiers[(new_idx / 3) + 1],
             next_division = (3 - (new_idx % 3))::smallint
       where m.cohort_id = cohort.id and m.user_id = member.user_id;

      -- The podium, from BALANCE.coins.leaguePodium — 300 / 200 / 100. Coins, never XP:
      -- rewarding XP would compound rank into rank (§4 Rewards).
      if member.position <= 3 then
        insert into public.coin_ledger (user_id, amount, reason, ref_id)
        values (
          member.user_id,
          case member.position when 1 then 300 when 2 then 200 else 100 end,
          'league_podium',
          cohort.id::text
        );
      end if;
    end loop;

    -- Members who earned nothing keep their rank rather than falling. They were never
    -- ranked, so there is no position to relegate them from.
    update public.league_members m
       set next_tier = cohort.tier, next_division = cohort.division
     where m.cohort_id = cohort.id and m.weekly_xp = 0;

    update public.league_cohorts c set closed_at = now() where c.id = cohort.id;
    closed := closed + 1;
  end loop;

  return closed;
end;
$$;

revoke all on function public.league_close_week() from public;
revoke all on function public.league_close_week() from anon;
revoke all on function public.league_close_week() from authenticated;

comment on function public.league_close_week() is
  'Promotes, relegates and pays the podium for every cohort whose week has ended. Idempotent via closed_at.';

-- ── the schedules ────────────────────────────────────────────────────────────
--
-- Same shape and the same caveat as `expire_streaks`: the SCHEDULE is an optimisation of
-- when the functions run, and the functions are the feature. pg_cron's schema placement
-- differs between hosted Supabase and a local stack, and a migration that cannot apply
-- because a scheduler is laid out differently is a far worse outcome than a job somebody
-- adds by hand. `supabase db reset` from empty has to keep working.

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron unavailable — the league functions exist, unscheduled. Schedule them by hand.';
    return;
  end if;

  create extension if not exists pg_cron;

  perform cron.unschedule(jobname)
    from cron.job
   where jobname in ('league-refresh-xp', 'league-place', 'league-close');

  -- Thirteen and nineteen past, not on the hour: every scheduled job in every system
  -- defaults to :00, and these should not contend with `expire-streaks` at :07.
  perform cron.schedule('league-refresh-xp', '13 * * * *', $job$ select public.league_refresh_xp() $job$);
  perform cron.schedule('league-place',      '19 * * * *', $job$ select public.league_place_members() $job$);
  -- Monday 00:05 UTC — five past the boundary `weekStart()` computes, so a lesson landing
  -- in the last seconds of Sunday is counted before the week is closed on it.
  perform cron.schedule('league-close',      '5 0 * * 1',  $job$ select public.league_close_week() $job$);
exception
  when others then
    raise notice 'could not schedule the league jobs (%). The functions exist; schedule them by hand.', sqlerrm;
end $$;
