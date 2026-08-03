-- RLS regression tests.
--
-- RLS bugs are silent and total: nothing errors, data just leaks. They get tests
-- like any other logic. Run: pnpm db:test

begin;
-- 13 = the 10 tables named in the RLS-enabled query below (one assertion each, because
-- `select ok(...) from pg_class` emits a row per match) + 3 standalone assertions.
--
-- It said 14, and nothing noticed for as long as this file had never actually run:
--
--   Parse errors: Bad plan.  You planned 14 tests but ran 13.
--
-- The plan is worth keeping rather than replacing with `no_plan` — it is what catches a
-- table quietly dropping out of the list. Adding a table means adding it to the query
-- AND incrementing this number.
select plan(13);

-- Every table that holds user data must have RLS on. This catches the classic
-- failure: a new table added months from now with RLS quietly left off.
select ok(relrowsecurity, 'RLS enabled on ' || relname)
from pg_class
where relname in (
  'profiles','entitlements','user_facts','review_log','lessons',
  'xp_ledger','coin_ledger','wallets','inventory','streaks'
);

-- No client-facing write path may exist on a reward table. The absence of a
-- policy is the security control, so assert the absence.
select is_empty(
  $$ select policyname from pg_policies
     where tablename in ('xp_ledger','coin_ledger','user_facts','review_log',
                         'league_members','entitlements')
       and cmd in ('INSERT','UPDATE','DELETE') $$,
  'no client write policy on any reward table'
);

select is_empty(
  $$ select policyname from pg_policies where qual = 'true' $$,
  'no policy is unconditionally permissive'
);

-- XP can never decrease.
select throws_ok(
  $$ insert into xp_ledger (user_id, amount, reason)
     values ('00000000-0000-0000-0000-000000000001', -10, 'test') $$,
  '23514',
  null,
  'xp_ledger rejects a negative amount'
);

select * from finish();
rollback;
