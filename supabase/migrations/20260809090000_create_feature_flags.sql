-- Feature flags — the staged-rollout mechanism named in docs/plan/build-order.md
-- (5 → 25 → 50 → 100 %) and missing until now. docs/engineering/rollback-plan.md names
-- two things this was blocking: staging a rollout, and halting one without shipping a
-- new binary. See docs/plan/cowork-handoff.md §3 for the constraints this design
-- answers to, and apps/mobile/src/lib/featureFlags.ts for the client half:
--
--   - The server stays authoritative for rewards and entitlements (ADR 0006). A flag
--     is never read on the path that grants XP, coins, mastery or a subscription tier
--     — `entitlementOf` and `record_lesson` do not touch this table, and nothing here
--     writes to `wallets`, `subscriptions` or `xp_ledger`. A flag gates whether a
--     SCREEN or CODE PATH is reachable, never whether an award is valid. If a future
--     caller is tempted to read a flag on that path, that is the design being misused,
--     not extended.
--   - The app works offline. This table is read-only and cached on device; the client
--     fails CLOSED on a cold start with no cache — see featureFlags.ts for why "closed"
--     was chosen over "open" for a code path nobody has confirmed works yet.
--   - No flag may enable third-party tracking on a child account. There is no
--     per-user assignment row here — see below — so there is nothing server-side that
--     ties a flag evaluation to a specific user.
--
-- Rollout is percentage-based and evaluated on the CLIENT, deterministically, from a
-- hash of (flag key, user id). The server holds one row per FLAG, not one row per user
-- — a per-user assignment table would be an entitlement-shaped thing the moment
-- anything joins it to another table, which is exactly what this schema is trying not
-- to become.

create table public.feature_flags (
  key               text primary key,
  enabled           boolean not null default false,
  -- 0 disables even when `enabled` is true; 100 means everyone, once `enabled` is
  -- true. Kept as a second field rather than folded into `enabled` so "off" and "0%
  -- rolled out" are the same switch — an operator reaching for the kill switch during
  -- an incident should not have to remember which field this release used.
  rollout_percent   smallint not null default 0 check (rollout_percent between 0 and 100),
  description       text not null default '',
  updated_at        timestamptz not null default now()
);

comment on table public.feature_flags is
  'Staged-rollout flags. Client-readable, never client-writable. Never a source of truth for entitlements or rewards — see the header of the migration that created this table.';

alter table public.feature_flags enable row level security;

-- Readable by anyone, including the anonymous session every user starts in
-- (packages/api/src/client.ts `ensureSession`). A flag's rollout percentage is not
-- sensitive, and gating the read would mean a signed-out user cannot evaluate flags
-- during the taster lesson, which is most of what a launch flag is FOR.
create policy "feature_flags are readable by anyone"
  on public.feature_flags for select
  to anon, authenticated
  using (true);

-- No insert/update/delete policy for anon or authenticated, and no default grant
-- covers those either — the only way to change a flag is the Supabase dashboard, or a
-- future authenticated-admin path deliberately not built here. A client that could
-- write its own rollout percentage could roll itself out to 100%, which turns the
-- table into exactly the client-trusted entitlement source it is designed not to be.
revoke insert, update, delete on public.feature_flags from anon, authenticated;

-- No seed rows. An empty table means every flag reads as "not found", and the client
-- treats not-found the same as enabled=false — see featureFlags.ts. A flag is added by
-- a row, and a fresh flag defaults to reaching nobody until its rollout is raised on
-- purpose.
