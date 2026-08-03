-- Subscriptions: the server's copy of what the store says.
--
-- `packages/engines/src/entitlements` has modelled this lifecycle since the paywall
-- landed — five states, a grace period, an account hold — and had nowhere to read it
-- from. The client cached a `Subscription` in device storage and nothing ever wrote it.
-- A device-local entitlement is a free subscription for anyone willing to edit their
-- own storage, which is the ADR 0006 rule with a price attached to it.
--
-- The column names and the enum values are the engine's type, deliberately, so the
-- mapping from row to `Subscription` is an identity rather than a translation. A
-- translation layer is somewhere for `in_grace` to quietly become `active`.
--
-- Spec: docs/systems/monetization.md · docs/adr/0006-server-authoritative-progress.md

-- Exactly `SubscriptionStatus` in packages/engines/src/entitlements/index.ts.
create type subscription_status as enum
  ('none','trialing','active','in_grace','on_hold','expired');

-- Exactly `PlanTier`. Named plan_tier rather than tier because the achievements engine
-- already owns "tier" for bronze/silver/gold.
create type plan_tier as enum ('free','premium','family');

create table subscriptions (
  user_id      uuid primary key references profiles(id) on delete cascade,
  status       subscription_status not null default 'none',
  tier         plan_tier not null default 'free',

  -- Paid through this instant, FROM THE STORE. Access survives to here even after a
  -- cancellation: someone who cancels on day 2 of a month they paid for keeps the
  -- month. Ending access at the moment of cancelling is taking money for nothing.
  expires_at   timestamptz,

  -- False once auto-renew is off. They are still a subscriber until `expires_at`; this
  -- only says the next charge will not happen. It is also the win-back signal, and the
  -- only window with real odds — reactivation after someone has actually gone is 5%.
  will_renew   boolean not null default false,

  -- One free trial per user, ever. Re-offering one to somebody who burned theirs is a
  -- promise the store refuses at the till, which is the worst moment to find out.
  has_used_trial boolean not null default false,

  -- Which store, and its own identifier for this subscription. Apple's
  -- originalTransactionId and Google's purchaseToken both live here; they are what a
  -- notification arrives keyed by, so they are how a notification finds its row.
  platform     text check (platform in ('ios','android')),
  store_ref    text,
  product_id   text,

  -- Sandbox purchases must never grant production access. Kept as a column rather than
  -- assumed from the build, because a sandbox receipt can reach a production server.
  environment  text not null default 'production'
                 check (environment in ('sandbox','production')),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One store subscription belongs to one user. Without this, replaying a notification
-- against a different account is a second free subscription rather than a conflict.
create unique index subscriptions_store_ref_idx
  on subscriptions (platform, store_ref)
  where store_ref is not null;

-- The trial-reminder job asks "whose trial ends tomorrow?" and nothing else. Ours
-- arrives before Apple's and is friendlier, which is the cheapest refund reduction
-- available — but only if this query stays cheap.
create index subscriptions_expiring_idx
  on subscriptions (expires_at)
  where status in ('trialing','in_grace');

-- ── the notification log ────────────────────────────────────────────────────
--
-- Ledgers, not balances — the same rule the economy follows, for the same reason. The
-- `subscriptions` row is a projection of everything the store has told us, and a
-- projection you can rebuild is a projection you can audit and correct. A row you can
-- only mutate is a billing dispute you cannot answer.
create table subscription_events (
  id           bigserial primary key,
  user_id      uuid references profiles(id) on delete cascade,

  -- Apple's notificationUUID / Google's message id. UNIQUE, because both stores retry
  -- until acknowledged and both will deliver the same notification more than once.
  -- Idempotency here is what stops a redelivered RENEWAL granting a second month.
  notification_id text not null unique,

  platform     text not null check (platform in ('ios','android')),
  -- The store's own type string (DID_RENEW, SUBSCRIPTION_RECOVERED, ...), unmapped.
  -- Storing what arrived rather than our reading of it is what makes a replay useful.
  kind         text not null,
  status_after subscription_status,
  payload      jsonb not null,
  received_at  timestamptz not null default now()
);

create index subscription_events_user_time_idx
  on subscription_events (user_id, received_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table subscriptions       enable row level security;
alter table subscription_events enable row level security;

create policy own_subscription_select on subscriptions
  for select using ((select auth.uid()) = user_id);

-- Deliberately NO client write policy on either table. Both are written by the store
-- notification handler running as service_role. The absence IS the control: there is no
-- code path a modified client could use to set its own status to 'active', because
-- there is no policy that would let it.
--
-- And deliberately no client SELECT on subscription_events either. It holds the raw
-- store payload — order ids, prices, and whatever else the store chose to include —
-- which the app has no reason to read and every reason not to ship to a device.

-- `updated_at` is server-owned. A client cannot write this table at all, but the
-- notification handler is code too, and "remember to touch updated_at" is a thing code
-- forgets.
create or replace function touch_subscription_updated_at()
returns trigger language plpgsql
-- Empty search_path, as `harden_security_advisories` requires of every function here.
-- This one is not SECURITY DEFINER and does not need to be — it touches one column of
-- the row being written — but a function with a mutable search_path is a function whose
-- referenced objects can be shadowed, and the advisor flags it regardless.
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger subscriptions_touch_updated_at
  before update on subscriptions
  for each row execute function touch_subscription_updated_at();

-- ── revoke EXECUTE on trigger functions ─────────────────────────────────────
--
-- PostgREST exposes every function in `public` as an RPC endpoint, so a trigger
-- function is reachable at /rest/v1/rpc/<name> unless EXECUTE is taken away. The
-- trigger machinery invokes them as the owner and needs no grant. This is the rule
-- `harden_security_advisories` established for `guard_protected_profile_columns`, and
-- `provision_new_user` followed for `handle_new_user`.
--
-- `wallet_totals_from_ledgers` did not. It added two SECURITY DEFINER functions —
-- functions that write `wallets` — and left them granted. Migrations are forward-only,
-- so that file is not edited; this corrects it, which is the same thing
-- `harden_security_advisories` says about the three before it.
revoke all on function public.touch_subscription_updated_at() from public;
revoke all on function public.touch_subscription_updated_at() from anon;
revoke all on function public.touch_subscription_updated_at() from authenticated;

revoke all on function public.apply_xp_to_wallet() from public;
revoke all on function public.apply_xp_to_wallet() from anon;
revoke all on function public.apply_xp_to_wallet() from authenticated;

revoke all on function public.apply_coins_to_wallet() from public;
revoke all on function public.apply_coins_to_wallet() from anon;
revoke all on function public.apply_coins_to_wallet() from authenticated;
