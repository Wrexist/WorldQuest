-- `user_facts.mastery` is derived from the row, never written by a caller.
--
-- The bug: `submit-lesson` upserts stability, difficulty, reps, lapses, last_review_at,
-- due_at and suspended — and has never written `mastery`. The column defaults to
-- 'learning', so it has read 'learning' for every row this product has ever created.
-- Three things depend on it, and all three have been quietly wrong since day one:
--
--   · `fetchProgress` counts `mastery in ('mastered','burnished')`. That is the
--     "183 / 195 countries" figure Home leads with, and it has always been zero.
--   · `submit-lesson` builds `masteredBefore` from it, so the repeat-a-known-fact XP
--     penalty could never fire.
--   · the partial index `where suspended = false and mastery <> 'burnished'` filtered
--     on a constant, and `user_facts_mastery_idx` indexed one.
--
-- Adding the column to that upsert would fix today and leave the identical hole open
-- for the next writer. So the column stops being something anyone writes: a BEFORE
-- trigger derives it from the row's own numbers, and a value a caller supplies is
-- overwritten rather than trusted. Forgetting it is no longer possible, and neither is
-- disagreeing with it.
--
-- ## A trigger rather than GENERATED ALWAYS AS
--
-- The expression is immutable, so a generated column would state the same guarantee more
-- declaratively. Converting a plain column into one means dropping and re-adding it —
-- which rewrites the table and takes both dependent indexes with it, on the table on the
-- 50 ms hot path. The trigger buys the same two properties (no writer can set it, no
-- writer can forget it) as an in-place change on a live table.
--
-- ## Three levels, and why that is all of them
--
-- `masteryOf` in packages/engines/src/learning/fsrs.ts distinguishes 'familiar' from
-- 'learning' by RETRIEVABILITY — recall probability right now — which is a function of
-- how long ago the last review was. It has no stored value, because its answer changes
-- while the row sits still. That distinction is presentational, and the client computes
-- it live from `stability` and `last_review_at`, which it has to do anyway for the label
-- to stay true between two syncs.
--
-- Everything that matters server-side sits at 'proficient' and above — the progress
-- count, the XP penalty, the index — and those three are pure functions of the columns
-- below. `fsrs.test.ts` reads this file and asserts the thresholds in the CASE are the
-- same numbers `masteryOf` uses, so the two cannot drift apart silently.

create or replace function public.derive_mastery()
returns trigger
language plpgsql
-- Empty search_path, as every function in this schema carries: a mutable one is a
-- function whose referenced objects can be shadowed. Every name below is qualified.
set search_path = ''
as $$
begin
  new.mastery := case
    when new.stability >= 180 and new.lapses = 0                        then 'burnished'
    when new.stability >= 21  and new.reps   >= 5                       then 'mastered'
    when new.stability >= 7   and new.reps   >= 3 and new.lapses <= 1   then 'proficient'
    else 'learning'
  end::public.mastery_level;
  return new;
end $$;

-- PostgREST publishes every function in `public` as an RPC endpoint. A trigger function
-- needs no grant — the trigger machinery invokes it as the owner. Same rule as
-- `harden_security_advisories` set for `guard_protected_profile_columns`.
revoke all on function public.derive_mastery() from public;
revoke all on function public.derive_mastery() from anon;
revoke all on function public.derive_mastery() from authenticated;

create trigger user_facts_derive_mastery
  before insert or update on public.user_facts
  for each row execute function public.derive_mastery();

-- Backfill every row that predates the trigger. Written out rather than nudged through
-- the trigger with a no-op UPDATE, because the same CASE appearing twice in one file is
-- readable and a `set mastery = mastery` that works by side effect is not.
update public.user_facts
set mastery = case
  when stability >= 180 and lapses = 0                    then 'burnished'
  when stability >= 21  and reps   >= 5                   then 'mastered'
  when stability >= 7   and reps   >= 3 and lapses <= 1   then 'proficient'
  else 'learning'
end::public.mastery_level;
