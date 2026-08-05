-- A store subscription that arrives for a second account is a transfer, not a crash.
--
-- `record_subscription_event` upserts with `on conflict (user_id) do update`. There is a
-- second unique index on the table — `subscriptions_store_ref_idx (platform, store_ref)`
-- — and nothing handles it. So when the same Apple `originalTransactionId` or Google
-- `purchaseToken` turns up under a different `user_id`, the insert violates THAT index,
-- `on conflict (user_id)` does not apply, and the function raises 23505.
--
-- The handler returns 500, Apple treats that as undelivered and retries for three days,
-- and every retry hits the same row and fails identically. Meanwhile the notification is
-- never applied, so a real subscriber sits on the free tier and the log fills with an
-- error nobody can act on.
--
-- This is not an edge case invented for a test. It is what a restore-purchase does. One
-- family Apple ID, a child's device signed in to a fresh WorldQuest account, tap
-- "Restore Purchases" — and Apple sends us a notification keyed to a transaction we have
-- already attached to somebody else. The index comment says it makes that "a conflict
-- rather than a second free subscription", which was true and left the conflict
-- unhandled.
--
-- ## Transfer, and say so
--
-- The right reading is that the entitlement moved. The store has one subscription; the
-- person holding it is now signed in as somebody else. So the old row is expired, the new
-- one takes the store reference, and BOTH facts are written to `subscription_events` —
-- the transfer is exactly the sort of thing somebody reads back when a billing dispute
-- arrives, and the table exists so that read is possible.
--
-- Expired rather than deleted: the old account keeps its history, and a row that
-- disappears is a support conversation nobody can reconstruct.

create or replace function record_subscription_event(
  p_user_id         uuid,
  p_notification_id text,
  p_platform        text,
  p_kind            text,
  p_payload         jsonb,
  p_subscription    jsonb default null,
  p_store_ref       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.subscription_status;
  v_expires timestamptz;
  v_previous_owner uuid;
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

  -- ── the transfer ──────────────────────────────────────────────────────────
  --
  -- Done BEFORE the upsert, so the unique index is free by the time we reach it. Doing it
  -- after, or as an exception handler, would mean the statement that discovers the
  -- conflict is the statement that has to undo it.
  if p_store_ref is not null then
    select user_id into v_previous_owner
    from public.subscriptions
    where platform = p_platform and store_ref = p_store_ref and user_id <> p_user_id;

    if found then
      update public.subscriptions
      set status = 'expired', will_renew = false, store_ref = null
      where user_id = v_previous_owner;

      -- Recorded against the account that LOST it, which is the account whose support
      -- ticket this answers.
      insert into public.subscription_events
        (user_id, notification_id, platform, kind, status_after, payload)
      values (
        v_previous_owner,
        p_notification_id || ':transferred-from',
        p_platform,
        'SUBSCRIPTION_TRANSFERRED',
        'expired',
        jsonb_build_object('transferredTo', p_user_id, 'storeRef', p_store_ref)
      );
    end if;
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

revoke all on function public.record_subscription_event(uuid, text, text, text, jsonb, jsonb, text) from public;
revoke all on function public.record_subscription_event(uuid, text, text, text, jsonb, jsonb, text) from anon;
revoke all on function public.record_subscription_event(uuid, text, text, text, jsonb, jsonb, text) from authenticated;
grant execute on function public.record_subscription_event(uuid, text, text, text, jsonb, jsonb, text) to service_role;
