-- The Supabase-provided objects the migrations assume, stood up so they can be executed.
--
-- NOT part of this repo's schema. It is the platform's half: the `auth` schema and its
-- two functions, the three PostgREST roles, and the schema grants. If Supabase changes
-- what it provides, this diverges silently — which is the standing limitation of any
-- local stand-in and the reason `supabase test db` is still the real suite.
create schema auth;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create function auth.role() returns text language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;

create role anon nologin;
create role authenticated nologin;
-- `bypassrls`, like the platform's: the edge functions run as this and write tables no
-- policy admits.
create role service_role nologin bypassrls;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
