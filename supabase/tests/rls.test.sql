-- RLS regression tests.
--
-- RLS bugs are silent and total: nothing errors, data just leaks. They get tests
-- like any other logic. Run: pnpm db:test

begin;
-- 12 tables named in the RLS-enabled query below (one assertion each, because
-- `select ok(...) from pg_class` emits a row per match) + 6 standalone assertions.
--
-- It said 14 for 13 tests, and nothing noticed for as long as this file had never
-- actually run:
--
--   Parse errors: Bad plan.  You planned 14 tests but ran 13.
--
-- The plan is worth keeping rather than replacing with `no_plan` — it is what catches a
-- table quietly dropping out of the list. Adding a table means adding it to the query
-- AND incrementing this number.
select plan(18);

-- Every table that holds user data must have RLS on. This catches the classic
-- failure: a new table added months from now with RLS quietly left off.
select ok(relrowsecurity, 'RLS enabled on ' || relname)
from pg_class
where relname in (
  'profiles','entitlements','user_facts','review_log','lessons',
  'xp_ledger','coin_ledger','wallets','inventory','streaks',
  'subscriptions','subscription_events'
);

-- No client-facing write path may exist on a reward table. The absence of a
-- policy is the security control, so assert the absence.
--
-- `subscriptions` belongs on this list for a stronger reason than the rest: a client
-- that can write its own row is a client that can set `status` to 'active'. That is not
-- lost progress, it is a free subscription.
select is_empty(
  $$ select policyname from pg_policies
     where tablename in ('xp_ledger','coin_ledger','user_facts','review_log',
                         'league_members','entitlements','subscriptions',
                         'subscription_events')
       and cmd in ('INSERT','UPDATE','DELETE') $$,
  'no client write policy on any reward or billing table'
);

-- The raw store payload is never readable by a device. It holds order ids and prices
-- the app has no reason to see, so `subscription_events` has no SELECT policy at all —
-- unlike `subscriptions`, which a user may read about themselves.
select is_empty(
  $$ select policyname from pg_policies where tablename = 'subscription_events' $$,
  'subscription_events is unreadable by any client, including its owner'
);

select is_empty(
  $$ select policyname from pg_policies where qual = 'true' $$,
  'no policy is unconditionally permissive'
);

-- PostgREST publishes every function in `public` as an RPC endpoint, so a trigger
-- function left with its default grant is reachable at /rest/v1/rpc/<name>. The trigger
-- machinery invokes them as the owner and needs no grant.
--
-- `wallet_totals_from_ledgers` added two SECURITY DEFINER functions that write
-- `wallets` and did not revoke them. Nothing here noticed, because nothing here looked.
select is_empty(
  $$ select p.proname
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prorettype = 'trigger'::regtype
        and (has_function_privilege('anon', p.oid, 'EXECUTE')
             or has_function_privilege('authenticated', p.oid, 'EXECUTE')) $$,
  'no trigger function is callable over the REST API'
);

-- XP can never decrease.
select throws_ok(
  $$ insert into xp_ledger (user_id, amount, reason)
     values ('00000000-0000-0000-0000-000000000001', -10, 'test') $$,
  '23514',
  null,
  'xp_ledger rejects a negative amount'
);

-- A sandbox receipt must not be able to describe itself as production access by
-- inventing a third environment. The check constraint is what makes that true.
select throws_ok(
  $$ insert into subscriptions (user_id, environment)
     values ('00000000-0000-0000-0000-000000000001', 'staging') $$,
  '23514',
  null,
  'subscriptions rejects an unknown environment'
);

select * from finish();
rollback;
