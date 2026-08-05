-- Three corrections that each close a gap between a rule this schema states and what it
-- actually enforces.
--
-- ── 1. `search_path` on the wallet functions ────────────────────────────────
--
-- `wallet_totals_from_ledgers` created two SECURITY DEFINER functions with
-- `set search_path = public`. `create_subscriptions` later revoked their EXECUTE and
-- wrote, in the same file, that "a function with a mutable search_path is a function
-- whose referenced objects can be shadowed" — and did not change theirs.
--
-- `public` is not mutable in the way an unset search_path is, so this was never the live
-- hole the advisory describes. It is worth fixing anyway: these two write `wallets` as
-- their owner, and every other function in this schema now qualifies every name. A rule
-- with one grandfathered exception is a rule the next author has to know the history of.

create or replace function public.apply_xp_to_wallet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.wallets (user_id, xp_total, updated_at)
  values (new.user_id, greatest(new.amount, 0), now())
  on conflict (user_id) do update
    set xp_total = public.wallets.xp_total + new.amount,
        updated_at = now();
  return new;
end;
$$;

create or replace function public.apply_coins_to_wallet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- No `greatest` on the update path on purpose. A spend is a negative row, and the
  -- `coins >= 0` check on the table is what refuses an overspend. Clamping here would
  -- silently let a user buy something they could not afford and quietly zero them.
  insert into public.wallets (user_id, coins, updated_at)
  values (new.user_id, greatest(new.amount, 0), now())
  on conflict (user_id) do update
    set coins = public.wallets.coins + new.amount,
        updated_at = now();
  return new;
end;
$$;

revoke all on function public.apply_xp_to_wallet() from public;
revoke all on function public.apply_xp_to_wallet() from anon;
revoke all on function public.apply_xp_to_wallet() from authenticated;
revoke all on function public.apply_coins_to_wallet() from public;
revoke all on function public.apply_coins_to_wallet() from anon;
revoke all on function public.apply_coins_to_wallet() from authenticated;

-- ── 2. `review_log` is append-only in fact, not only in prose ───────────────
--
-- `create_learning.sql` opens with "review_log is APPEND-ONLY and authoritative;
-- user_facts is a derived cache that rebuild() can reproduce exactly. That is what makes
-- an algorithm change safe." The entire recovery guarantee of the learning engine rests
-- on that sentence, and nothing enforced it: the table had a SELECT policy and no other,
-- which stops a CLIENT writing it, while `service_role` — which every edge function
-- runs as — bypasses RLS entirely.
--
-- So "append-only" was a convention held by one endpoint choosing not to. A trigger is
-- what makes it a property of the table.

create or replace function public.refuse_review_log_mutation()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  raise exception 'review_log is append-only: % refused', tg_op;
end;
$$;

revoke all on function public.refuse_review_log_mutation() from public;
revoke all on function public.refuse_review_log_mutation() from anon;
revoke all on function public.refuse_review_log_mutation() from authenticated;

create trigger review_log_is_append_only
  before update or delete on public.review_log
  for each row execute function public.refuse_review_log_mutation();

-- ── 3. `user_facts.stability` needs more than 7 digits ─────────────────────
--
-- `real` is float4: about seven significant decimal digits. `packages/engines/CLAUDE.md`
-- rule 3 requires that `rebuild()` reproduce incremental state EXACTLY, and calls it the
-- test that may never be skipped — but the cache the incremental path writes could not
-- hold what the replay computes. Stability compounds multiplicatively across reviews, so
-- the two diverge with reps rather than staying within a rounding error.
--
-- `difficulty` is clamped to 1..10 and moves in small steps, so float4 holds it fine; it
-- is widened alongside for consistency rather than necessity.
alter table user_facts
  alter column stability  type double precision,
  alter column difficulty type double precision;
