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
--
-- 21 → 24 → 27: `record_lesson` brought three assertions, two of them the pair every
-- SECURITY DEFINER function in this schema now gets (unreachable by a client, reachable
-- by service_role) and one confirming `streaks` still has no client write path now that
-- it finally has a server-side writer.
select plan(29);

-- Every table that holds user data must have RLS on. This catches the classic
-- failure: a new table added months from now with RLS quietly left off.
select ok(relrowsecurity, 'RLS enabled on ' || relname)
from pg_class
where relname in (
  'profiles','entitlements','user_facts','review_log','lessons',
  'xp_ledger','coin_ledger','wallets','inventory','streaks',
  'subscriptions','subscription_events','shop_items'
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

-- ── the notification handler's RPC ──────────────────────────────────────────
--
-- `record_subscription_event` is SECURITY DEFINER and writes the entitlement row.
-- PostgREST publishes every function in `public` as an RPC endpoint, so leaving it
-- granted is a /rest/v1/rpc/ call away from a free subscription for anyone holding the
-- anon key — which ships in the app bundle and is not a secret.
select is_empty(
  $$ select p.proname
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'record_subscription_event'
        and (has_function_privilege('anon', p.oid, 'EXECUTE')
             or has_function_privilege('authenticated', p.oid, 'EXECUTE')) $$,
  'record_subscription_event is not callable by a client over the REST API'
);

-- ...and still callable by the one caller that needs it. A revoke that took the grant
-- away from service_role too would be a handler that cannot write anything, which fails
-- as a permanent retry loop rather than as an error anyone reads.
select ok(
  (select has_function_privilege('service_role', p.oid, 'EXECUTE')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_subscription_event'),
  'record_subscription_event is callable by service_role'
);

-- ── the lesson recorder's RPC ───────────────────────────────────────────────
--
-- Same shape, higher stakes. `record_lesson` is SECURITY DEFINER and writes `xp_ledger`
-- and `coin_ledger` directly, so a grant left in place is `/rest/v1/rpc/record_lesson`
-- away from arbitrary currency for anyone holding the anon key — which ships in the app
-- bundle and is not a secret. There is no endpoint that accepts "give me 500 XP", and
-- this assertion is part of what keeps that sentence true.
select is_empty(
  $$ select p.proname
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'record_lesson'
        and (has_function_privilege('anon', p.oid, 'EXECUTE')
             or has_function_privilege('authenticated', p.oid, 'EXECUTE')) $$,
  'record_lesson is not callable by a client over the REST API'
);

select ok(
  (select has_function_privilege('service_role', p.oid, 'EXECUTE')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_lesson'),
  'record_lesson is callable by service_role'
);

-- The streak is written by that function and by nothing else. A client write policy on
-- `streaks` would be a client that can set its own streak to 400 — the reachability
-- allowlist has claimed for months that streaks are server-authoritative, and until
-- `record_lesson` existed there was no server writer at all to be authoritative.
select is_empty(
  $$ select policyname from pg_policies
      where tablename = 'streaks' and cmd in ('INSERT','UPDATE','DELETE') $$,
  'no client write policy on streaks'
);

-- The out-of-order guard needs somewhere to live. `applyStoreNotification` compares
-- `notification.notifiedAt` against the subscription's own to refuse a delayed
-- DID_FAIL_TO_RENEW landing after the DID_RENEW that fixed it — and with no column the
-- comparison is always against null, so the guard is tested, present, and unreachable.
select has_column('subscriptions', 'notified_at',
  'subscriptions records when the last applied notification was sent');

-- ── the shop's spend ────────────────────────────────────────────────────────
--
-- `purchase_item` is the single exception to "no function in this schema is callable by a
-- client", and the exception is deliberate: buying a cosmetic is the one server action a
-- user initiates directly. What makes it safe is not the grant but the SIGNATURE — it
-- takes an item id and nothing else, so the price comes from `shop_items` and the spender
-- from `auth.uid()`. A version taking a price or a user id would be a free shop or an
-- emptied wallet, and would look almost identical in review.
select ok(
  (select has_function_privilege('authenticated', p.oid, 'EXECUTE')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'purchase_item'),
  'purchase_item is callable by a signed-in user'
);

select is_empty(
  $$ select p.proname
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'purchase_item'
        and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  'purchase_item is not callable by anon'
);

-- The catalogue is readable and unwritable. A client that could edit `shop_items` could
-- set a price to 1, which is the whole reason the price does not come from the caller.
select is_empty(
  $$ select policyname from pg_policies
      where tablename = 'shop_items' and cmd in ('INSERT','UPDATE','DELETE') $$,
  'no client write policy on shop_items'
);

select * from finish();
rollback;

