-- Leagues — weekly competitive cohorts.
-- Spec: docs/systems/social-and-leagues.md §4. Engine: packages/engines/src/leagues.
--
-- ## The safety stance, enforced by the schema rather than by a policy document
--
-- The social spec opens with a prerequisite in bold: moderation, reporting and blocking
-- ship WITH the social graph, not after it. This schema discharges that by removing the
-- surface instead of policing it:
--
--   * there is no free-text column anywhere in this migration. A member's visible name
--     is an ASSIGNED handle from two curated word lists (`handleFor`), so there is no
--     user-generated content to moderate, nothing to report and nobody to block;
--   * `profiles.handle` — which a user could in principle influence — is deliberately
--     NOT used here. A league handle is its own column, written by the server;
--   * under-13 accounts are excluded by a CHECK against `profiles.is_child`, which is
--     set once at signup and immutable by trigger. Not "hidden", not "filtered in the
--     client": a child's row cannot be inserted at all.
--
-- ## What a member may read
--
-- Their own cohort, and only the three facts a leaderboard needs: handle, weekly XP,
-- and whether the row is theirs. No user_id is readable by anyone but its owner, so a
-- cohort cannot be turned into a list of accounts to go looking for. That is what makes
-- "competition without contact" true at the database rather than in a screen.
--
-- ## Placement is the server's, always
--
-- No client-writable column exists. Cohort assignment, weekly XP and the end-of-week
-- roll are all service-role work (ADR 0006) — a client that could write its own
-- `weekly_xp` could write itself a Legend badge.

-- ── the cohort ───────────────────────────────────────────────────────────────

create table public.league_cohorts (
  id           uuid primary key default gen_random_uuid(),
  -- The Monday that opens the week, as YYYY-MM-DD. Matches `weekId()` in the engine,
  -- and sorts chronologically as text. UTC on purpose: thirty people in six zones are
  -- ranked against each other, so the week has to close at one instant — see the
  -- engine's header for why this is the one boundary in the app that is not local.
  week_id      date not null,
  -- Lowest tier first, matching LEAGUE_TIERS. An enum rather than text so a typo is a
  -- constraint violation instead of a cohort nobody can be promoted out of.
  tier         text not null check (
                 tier in ('bronze','silver','gold','sapphire','ruby','diamond','legend')
               ),
  division     smallint not null check (division between 1 and 3),
  -- The activity band this cohort was matched on, so a ten-minute-a-day user competes
  -- with other ten-minute-a-day users. Spec §4: random cohorts are the reason leagues
  -- feel unfair. Null is the newcomer band — a first week is never spent losing.
  band         smallint check (band between 0 and 9),
  created_at   timestamptz not null default now()
);

create index league_cohorts_week on public.league_cohorts (week_id, tier, division, band);

comment on table public.league_cohorts is
  'One weekly league group of up to 30. Server-assigned; never client-writable.';

-- ── membership ───────────────────────────────────────────────────────────────

create table public.league_members (
  cohort_id    uuid not null references public.league_cohorts(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  -- ASSIGNED, never authored. Two curated word lists and a number — see the header,
  -- and `packages/engines/src/leagues/handles.ts` for why this is stronger than a
  -- moderated free-text handle rather than a substitute for one.
  --
  -- The CHECK is the guarantee: `Swift Glacier 42` and nothing else can be stored,
  -- so a future code path that tried to write a display name here fails loudly at the
  -- database instead of quietly publishing it to twenty-nine people.
  handle       text not null check (handle ~ '^[A-Z][a-z]+ [A-Z][a-z]+ [0-9]{2}$'),
  -- The score, and the only thing that decides rank. XP earned THIS WEEK, recomputed
  -- by the server from `xp_ledger` — never sent by a client.
  weekly_xp    int not null default 0 check (weekly_xp >= 0),
  joined_at    timestamptz not null default now(),
  primary key (cohort_id, user_id),
  -- One cohort per user per week. Without this, a retried assignment job could enter
  -- somebody into two cohorts and rank them twice.
  unique (user_id, cohort_id)
);

create index league_members_user on public.league_members (user_id);
create index league_members_board on public.league_members (cohort_id, weekly_xp desc);

comment on table public.league_members is
  'A user''s place in one weekly cohort. `handle` is assigned from a word list, never authored — there is no free text in this feature.';

-- ── who may be in one at all ─────────────────────────────────────────────────

-- Under-13 accounts have NO social features. Not restricted, not hidden — absent.
-- Enforced here rather than in the assignment job, because a job is a thing somebody
-- can rewrite and a constraint is not. `is_child` is set once at signup from the age
-- gate and is immutable by trigger, so this cannot be worked around by editing a field.
create or replace function public.league_member_is_not_a_child()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.user_id and p.is_child) then
    raise exception 'under-13 accounts have no social features (social-and-leagues.md §1)';
  end if;
  return new;
end;
$$;

create trigger league_members_no_children
  before insert or update on public.league_members
  for each row execute function public.league_member_is_not_a_child();

-- ── opting out ───────────────────────────────────────────────────────────────

-- One tap, and off by default in Relaxed and Classroom modes (spec §4, kindness rules).
-- A separate table rather than a column on `profiles` so that opting out is a fact the
-- user owns and can write, while everything else about their profile stays server-set.
create table public.league_opt_outs (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  opted_out  boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.league_opt_outs is
  'Presence of a row with opted_out = true means leagues are off for this user. The one league table a client may write.';

-- ── RLS: default deny, then the narrowest possible reads ─────────────────────

alter table public.league_cohorts enable row level security;
alter table public.league_members enable row level security;
alter table public.league_opt_outs enable row level security;

-- You can see a cohort only if you are in it. Not "any cohort in your tier" — that
-- would let anyone enumerate every board in the game and, joined to the member rows,
-- reconstruct the population.
create policy "read your own cohort"
  on public.league_cohorts for select
  to authenticated
  using (
    exists (
      select 1 from public.league_members m
      where m.cohort_id = league_cohorts.id and m.user_id = (select auth.uid())
    )
  );

-- The rows of your own cohort — everybody's handle and weekly XP, which is what a
-- leaderboard IS. `user_id` is in the row and readable, which is why the client reads
-- through `league_standings` below rather than this table directly.
create policy "read the members of your own cohort"
  on public.league_members for select
  to authenticated
  using (
    exists (
      select 1 from public.league_members mine
      where mine.cohort_id = league_members.cohort_id
        and mine.user_id = (select auth.uid())
    )
  );

create policy "read your own opt-out"
  on public.league_opt_outs for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "set your own opt-out"
  on public.league_opt_outs for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "change your own opt-out"
  on public.league_opt_outs for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Nothing else is writable by anyone. Placement, handles and weekly XP are the
-- server's — a client that could write `weekly_xp` could write itself a Legend badge,
-- and one that could write `handle` would have re-opened the free-text hole this
-- schema exists to close.
revoke insert, update, delete on public.league_cohorts from anon, authenticated;
revoke insert, update, delete on public.league_members from anon, authenticated;
revoke delete on public.league_opt_outs from anon, authenticated;

-- ── the read the client actually makes ───────────────────────────────────────

-- A view, so a cohort can be read as a leaderboard without user ids crossing the wire.
-- `is_you` is computed against the caller, which is the only thing a client needs to
-- mark its own row — and it means a cohort cannot be turned into a list of accounts.
--
-- `security_invoker` so the policies above still apply: the view is a narrower SHAPE,
-- never a wider grant.
create view public.league_standings
with (security_invoker = true)
as
  select
    m.cohort_id,
    c.week_id,
    c.tier,
    c.division,
    m.handle,
    m.weekly_xp,
    (m.user_id = (select auth.uid())) as is_you
  from public.league_members m
  join public.league_cohorts c on c.id = m.cohort_id;

comment on view public.league_standings is
  'A cohort as a leaderboard: handles and weekly XP, with the caller''s own row flagged. Deliberately has no user_id column — competition without contact.';

grant select on public.league_standings to authenticated;
