-- Two smaller corrections from the same review pass.
--
-- ── 1. the transfer read has to lock the row it is about to move ────────────
--
-- `record_subscription_event` finds the previous owner of a `store_ref` and expires them
-- before claiming it. The SELECT took no lock, so two notifications for the same
-- `store_ref` arriving together — a re-subscribe racing a transfer, which is exactly when
-- a store retries — both read the same old owner, both expired them, and both went on to
-- the upsert against the `(platform, store_ref)` unique index. One of them loses there,
-- and the transfer machinery this migration series added exists precisely so that
-- collision is handled rather than surfaced.
--
-- `for update` makes the second caller wait and re-read, so it sees the row the first one
-- already moved and does the right thing with it. Replaced whole, because a function is
-- replaced whole; the SELECT is the only line that changes.

create or replace function public.record_subscription_event(
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
    -- Serialise on the store reference BEFORE the read, because `for update` locks a
    -- row and the dangerous case is the one where there is no row yet. Two first-time
    -- claims of the same `store_ref` both find nothing, both skip the transfer, and both
    -- reach the upsert — whose conflict target is `(user_id)`, so it does not absorb a
    -- collision on the `(platform, store_ref)` unique index. The second one raises 23505,
    -- which is the exact failure the transfer path exists to prevent.
    perform pg_advisory_xact_lock(hashtextextended(p_platform || ':' || p_store_ref, 0));

    -- `for update` on the read, not just the write. Two notifications for the same
    -- store_ref arriving together — a re-subscribe racing a transfer, which is when the
    -- store retries — both saw the old owner, both expired them, and both then reached
    -- the upsert below against the `(platform, store_ref)` unique index. The lock makes
    -- the second one wait and re-read, so it finds the row this one already moved.
    select user_id into v_previous_owner
    from public.subscriptions
    where platform = p_platform and store_ref = p_store_ref and user_id <> p_user_id
    for update;

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
    -- `coalesce`, like the two nullable columns above it. `notified_at` is derived from
    -- `p_subscription ->> 'notifiedAt'`, which is null whenever a notification omits the
    -- field — so an unconditional assignment erased the stored timestamp, and the column
    -- exists to answer "which notification did we last apply".
    notified_at    = coalesce(excluded.notified_at, s.notified_at);
end;
$$;
