-- What the schema must do, asserted against a real Postgres.
--
-- Plain SQL rather than pgTAP, because pgTAP is not installed in the environments this
-- repo is built in — see the harness header. `supabase/tests/rls.test.sql` is still the
-- real suite; this checks the same properties well enough to catch a broken plan count,
-- a missing revoke, or a reward that pays twice, which is what has never been checked at
-- all.
--
-- Every assertion raises rather than printing, so the harness fails loudly.

\set ON_ERROR_STOP on
\set u '11111111-1111-4111-8111-111111111111'

create or replace function pg_temp.want(claim text, got anyelement, expected anyelement)
returns void language plpgsql as $$
begin
  if got is distinct from expected then
    raise exception '✗ % — got %, wanted %', claim, got, expected;
  end if;
  raise notice '  ✓ %', claim;
end $$;

-- ── provisioning ────────────────────────────────────────────────────────────
insert into auth.users (id, email) values (:'u'::uuid, 'harness@example.com');
select pg_temp.want('signup creates a profile', (select count(*) from profiles where id = :'u'::uuid), 1::bigint);
select pg_temp.want('signup creates a wallet',  (select count(*) from wallets  where user_id = :'u'::uuid), 1::bigint);
select pg_temp.want('signup creates a streak',  (select count(*) from streaks  where user_id = :'u'::uuid), 1::bigint);

-- ── the reward path ─────────────────────────────────────────────────────────
select public.pin_daily_quest(:'u'::uuid, current_date, '[
  {"slot":"locate","target":2,"factIds":["geo.SE.capital"],"progress":0,"complete":false},
  {"slot":"perform","target":1,"factIds":[],"goal":"streak_keeper","progress":0,"complete":false}]'::jsonb);

select public.record_lesson(
  :'u'::uuid, '22222222-2222-4222-8222-000000000001'::uuid, 'lesson'::lesson_kind, null,
  10, 10, 140, 60, now() - interval '2 minutes', '1.0.0', '[]'::jsonb, '[]'::jsonb,
  jsonb_build_object('current',1,'longest',1,'lastActiveDate',current_date::text,'freezesHeld',0,'freezeUsed',false),
  60, 0, 0, 0,
  current_date, array['locate','perform'], true, 10, 50, 25,
  '{"ach.lessons.done":{"achievementId":"ach.lessons.done","value":1,"tier":"bronze"}}'::jsonb,
  '[{"achievement_id":"ach.lessons.done","tier":"bronze","xp":25,"coins":10}]'::jsonb) as r \gset
select pg_temp.want('the quest pays per slot plus the bonus', (:'r'::jsonb ->> 'questXp')::int, 70);
select pg_temp.want('the quest pays its coins',               (:'r'::jsonb ->> 'questCoins')::int, 25);
select pg_temp.want('the achievement tier pays',              (:'r'::jsonb ->> 'achievementXp')::int, 25);

-- The property the whole design rests on: a second lesson the same day, announcing the
-- same slots and the same tier, must pay for neither.
select public.record_lesson(
  :'u'::uuid, '22222222-2222-4222-8222-000000000002'::uuid, 'lesson'::lesson_kind, null,
  10, 10, 140, 60, now() - interval '1 minute', '1.0.0', '[]'::jsonb, '[]'::jsonb, null,
  60, 0, 0, 0,
  current_date, array['locate','perform'], true, 10, 50, 25,
  '{"ach.lessons.done":{"achievementId":"ach.lessons.done","value":2,"tier":"bronze"}}'::jsonb,
  '[{"achievement_id":"ach.lessons.done","tier":"bronze","xp":25,"coins":10}]'::jsonb) as r2 \gset
select pg_temp.want('a second lesson re-pays no quest slot',  (:'r2'::jsonb ->> 'questXp')::int, 0);
select pg_temp.want('a second lesson re-pays no quest bonus', (:'r2'::jsonb ->> 'questCoins')::int, 0);
select pg_temp.want('a banked tier is never paid twice',      (:'r2'::jsonb ->> 'achievementXp')::int, 0);
select pg_temp.want('the unlock ledger holds one row',
  (select count(*) from achievement_unlocks where user_id = :'u'::uuid), 1::bigint);
select pg_temp.want('the wallet is the sum of the ledger',
  (select xp_total from wallets where user_id = :'u'::uuid),
  (select sum(amount) from xp_ledger where user_id = :'u'::uuid)::bigint);

-- A replay of the FIRST lesson id awards nothing and reports itself.
select public.record_lesson(
  :'u'::uuid, '22222222-2222-4222-8222-000000000001'::uuid, 'lesson'::lesson_kind, null,
  10, 10, 140, 60, now(), '1.0.0', '[]'::jsonb, '[]'::jsonb, null, 60) as r3 \gset
select pg_temp.want('a replayed lesson id is a no-op', :'r3'::jsonb ->> 'status', 'replayed');

-- ── the purchases ───────────────────────────────────────────────────────────
insert into coin_ledger (user_id, amount, reason) values (:'u'::uuid, 5000, 'harness:topup');
set session "request.jwt.claim.sub" = '11111111-1111-4111-8111-111111111111';
set session role authenticated;
select pg_temp.want('a continue is bought once per offer',
  public.continue_lesson('33333333-3333-4333-8333-000000000001'::uuid) ->> 'status', 'purchased');
select pg_temp.want('the same offer is a replay, not a second charge',
  public.continue_lesson('33333333-3333-4333-8333-000000000001'::uuid) ->> 'status', 'already_paid');
select pg_temp.want('a cosmetic is never sold twice',
  (select public.purchase_item('title.map-nerd') ->> 'status'), 'purchased');
select pg_temp.want('and says so the second time',
  (select public.purchase_item('title.map-nerd') ->> 'status'), 'already_owned');
select pg_temp.want('a repair is refused on an intact streak',
  public.repair_streak() ->> 'status', 'not_broken');
reset role;

-- ── what a client may not do ────────────────────────────────────────────────
set session role authenticated;
do $$ begin
  insert into public.achievement_unlocks (user_id, achievement_id, tier, xp, coins)
  values (auth.uid(), 'ach.flags.collector', 'legendary', 500, 200);
  raise exception '✗ a client awarded itself an achievement';
exception when insufficient_privilege then raise notice '  ✓ a client cannot award itself an achievement';
end $$;
do $$ begin
  insert into public.xp_ledger (user_id, amount, reason) values (auth.uid(), 999999, 'free money');
  raise exception '✗ a client minted XP';
exception when insufficient_privilege then raise notice '  ✓ a client cannot mint XP';
end $$;
do $$ begin
  perform public.record_lesson(auth.uid(), gen_random_uuid(), 'lesson'::lesson_kind, null,
    1, 1, 999999, 999999, now(), null, '[]'::jsonb, '[]'::jsonb, null, 60);
  raise exception '✗ a client called the lesson recorder';
exception when insufficient_privilege then raise notice '  ✓ a client cannot call the lesson recorder';
end $$;
select pg_temp.want('a client sees nobody else''s unlocks',
  (select count(*) from public.achievement_unlocks where user_id <> auth.uid()), 0::bigint);
select pg_temp.want('a client CAN see its own', 
  (select count(*) from public.achievement_unlocks), 1::bigint);
reset role;

-- ── the shape the pgTAP plan counts ─────────────────────────────────────────
select pg_temp.want('every listed table has RLS on',
  (select count(*) filter (where not relrowsecurity) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in ('profiles','entitlements','user_facts','review_log','lessons',
        'xp_ledger','coin_ledger','wallets','inventory','streaks','subscriptions',
        'subscription_events','shop_items','daily_quests','achievement_progress',
        'achievement_unlocks')), 0::bigint);
select pg_temp.want('no client write policy on a reward table',
  (select count(*) from pg_policies where cmd in ('INSERT','UPDATE','DELETE')
     and tablename in ('xp_ledger','coin_ledger','user_facts','review_log','league_members',
       'entitlements','subscriptions','subscription_events','daily_quests',
       'achievement_progress','achievement_unlocks')), 0::bigint);
select pg_temp.want('record_lesson has exactly one overload',
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_lesson'), 1::bigint);
select pg_temp.want('repair_streak takes no arguments',
  (select pronargs from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'repair_streak'), 0::smallint);
select pg_temp.want('every SECURITY DEFINER pins its search_path',
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')), 0::bigint);
