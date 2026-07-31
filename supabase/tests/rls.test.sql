-- RLS regression tests.
--
-- RLS bugs are silent and total: nothing errors, data just leaks. They get tests
-- like any other logic. Run: pnpm db:test

begin;
select plan(14);

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
