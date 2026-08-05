-- Identity, roles and entitlements.
-- RLS is enabled with NO write policy on anything a client must not forge.
-- Spec: docs/engineering/data-model.md

create extension if not exists citext;

create type user_role as enum
  ('guest','user','premium','teacher','parent','admin','moderator','support');

create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  handle        citext unique not null check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name  text,
  avatar_id     text not null default 'avatar.default',
  locale        text not null default 'en',
  -- IANA zone. Streaks are evaluated server-side in the user's own day, and a
  -- local day can be 23 or 25 hours long. Never assume 86400s.
  timezone      text not null default 'UTC',
  -- Year only: enough to age-gate, minimal PII. Deliberately not a full DOB.
  birth_year    smallint check (birth_year between 1900 and 2100),
  role          user_role not null default 'user',
  -- Set ONCE at signup from the age gate, then immutable (see trigger below).
  -- A child must not be able to age out of protection by editing a field.
  is_child      boolean not null default false,
  parent_id     uuid references profiles(id),
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table entitlements (
  user_id     uuid references profiles(id) on delete cascade,
  product     text not null,
  source      text not null,
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,
  rc_id       text,
  primary key (user_id, product)
);

-- is_child and role are server-owned. Enforced in a trigger because RLS cannot
-- restrict individual columns.
create or replace function public.guard_protected_profile_columns()
returns trigger language plpgsql security definer
-- An empty search_path is required on SECURITY DEFINER: without it a caller can
-- shadow a referenced object and run code as the function owner.
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if new.is_child is distinct from old.is_child then
    raise exception 'is_child is immutable';
  end if;
  if new.role is distinct from old.role then
    raise exception 'role may only be changed server-side';
  end if;
  return new;
end $$;

create trigger profiles_guard_protected
  before update on profiles
  for each row execute function guard_protected_profile_columns();

alter table profiles enable row level security;
alter table entitlements enable row level security;

create policy own_profile_select on profiles
  for select using ((select auth.uid()) = id and deleted_at is null);
create policy own_profile_update on profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy own_entitlements_select on entitlements
  for select using ((select auth.uid()) = user_id);
-- No insert/update/delete policy on entitlements: purchases are granted by the
-- RevenueCat webhook running as service_role. The absence IS the control.
