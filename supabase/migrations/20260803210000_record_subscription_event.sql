-- Recording a store notification: the event and the projection, in one transaction.
--
-- `NotificationDeps.record` in the edge handler is specified as "append the event and,
-- when there is one, the new subscription. One transaction." Two `supabase-js` calls are
-- two transactions, and the failure between them is the expensive one: the event lands,
-- the subscription does not, the store gets its 200, and nobody ever finds out because
-- the unique index on `notification_id` makes the redelivery a no-op. A paying customer
-- silently stays on the free tier.
--
-- So it is one function, and the insert goes FIRST. The unique index is the idempotency
-- guarantee, and putting the insert first means a duplicate aborts the whole statement
-- before the subscription is touched — a redelivered DID_RENEW cannot grant a second
-- month even if the cheap pre-check in the handler is racing another delivery.
--
-- Spec: docs/systems/monetization.md

-- ── the out-of-order guard needs somewhere to live ──────────────────────────
--
-- `applyStoreNotification` refuses a notification older than the last one applied, by
-- comparing `notification.notifiedAt` with the subscription's own. That guard is the
-- reason it takes the current row at all — a delayed DID_FAIL_TO_RENEW landing after the
-- DID_RENEW that fixed it would otherwise revoke a paying customer.
--
-- The column was missing, which made the comparison always be against `undefined`: the
-- guard was there, tested, and could never fire in production because the value never
-- survived a request. Nullable, because every row that exists today predates it and
-- "never applied one" is exactly what null means here.
alter table subscriptions add column notified_at timestamptz;

create or replace function public.record_subscription_event(
  p_user_id         uuid,
  p_notification_id text,
  p_platform        text,
  p_kind            text,
  p_payload         jsonb,
  -- The new `Subscription`, serialised by the engine, or null when the decision declined
  -- to change anything — an unknown type, a sandbox payload, one that arrived out of
  -- order. Those are still recorded: they are precisely what somebody reads back when a
  -- subscription looks wrong, and dropping them keeps the table tidy while making the
  -- dispute unanswerable.
  p_subscription    jsonb default null,
  -- How this subscription is identified at the store, so later notifications find the
  -- row by (platform, store_ref) instead of falling back to the account token.
  p_store_ref       text default null
)
returns void
language plpgsql
security definer
-- Empty search_path: this is SECURITY DEFINER and writes two tables no client may write,
-- so an attacker-shadowed `subscriptions` would be a free subscription. Every object
-- below is schema-qualified for the same reason.
set search_path = ''
as $$
declare
  v_status public.subscription_status;
  v_expires timestamptz;
begin
  if p_subscription is not null then
    v_status := (p_subscription ->> 'status')::public.subscription_status;
    -- The engine speaks epoch millis; Postgres speaks timestamptz. `null` means the
    -- notification carried no new paid-through date, and the stored one stands — a
    -- cancellation must not shorten a period somebody already paid for.
    v_expires := case
      when p_subscription ->> 'expiresAt' is null then null
      else to_timestamp((p_subscription ->> 'expiresAt')::bigint / 1000.0)
    end;
  end if;

  -- First, and deliberately. A duplicate notification_id raises 23505 here and the
  -- transaction aborts with the subscription untouched.
  insert into public.subscription_events
    (user_id, notification_id, platform, kind, status_after, payload)
  values
    (p_user_id, p_notification_id, p_platform, p_kind, v_status, p_payload);

  if p_subscription is null then
    return;
  end if;

  insert into public.subscriptions as s
    (user_id, status, tier, expires_at, will_renew, has_used_trial,
     platform, store_ref, environment, notified_at)
  values (
    p_user_id,
    v_status,
    (p_subscription ->> 'tier')::public.plan_tier,
    v_expires,
    coalesce((p_subscription ->> 'willRenew')::boolean, false),
    coalesce((p_subscription ->> 'hasUsedTrial')::boolean, false),
    p_platform,
    p_store_ref,
    coalesce(p_subscription ->> 'environment', 'production'),
    to_timestamp((p_subscription ->> 'notifiedAt')::bigint / 1000.0)
  )
  on conflict (user_id) do update set
    status         = excluded.status,
    tier           = excluded.tier,
    -- Only move the date when the notification carried one. `excluded.expires_at` is
    -- null for a cancellation, and overwriting with it takes back a paid month.
    expires_at     = coalesce(excluded.expires_at, s.expires_at),
    will_renew     = excluded.will_renew,
    -- Sticky, in the database as well as in the engine. A trial consumed is consumed,
    -- and belt-and-braces is cheap next to offering a second free week the store refuses.
    has_used_trial = s.has_used_trial or excluded.has_used_trial,
    platform       = excluded.platform,
    store_ref      = coalesce(excluded.store_ref, s.store_ref),
    notified_at    = excluded.notified_at;
end;
$$;

-- PostgREST publishes every function in `public` as an RPC endpoint. This one is
-- SECURITY DEFINER and writes the entitlement row, so leaving it granted would be a
-- /rest/v1/rpc/ call away from a free subscription for anyone with an anon key. Only the
-- notification handler, running as service_role, may call it.
revoke all on function public.record_subscription_event(uuid, text, text, text, jsonb, jsonb, text) from public;
revoke all on function public.record_subscription_event(uuid, text, text, text, jsonb, jsonb, text) from anon;
revoke all on function public.record_subscription_event(uuid, text, text, text, jsonb, jsonb, text) from authenticated;
grant execute on function public.record_subscription_event(uuid, text, text, text, jsonb, jsonb, text) to service_role;
