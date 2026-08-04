-- Hardening from the Supabase security advisor, run against the real database.
--
-- Forward-only: the three preceding migrations have been applied and are never
-- edited. This corrects them.

-- 1. Keep extensions out of the exposed API schema. citext backs profiles.handle,
--    so the type must stay resolvable — Supabase roles already search `extensions`.
create schema if not exists extensions;
alter extension citext set schema extensions;

-- 2. A trigger function must never be callable directly.
--
--    PostgREST exposes every public function as an RPC endpoint, so
--    guard_protected_profile_columns() — which runs as SECURITY DEFINER precisely
--    so it can veto privilege changes — was reachable at
--    /rest/v1/rpc/guard_protected_profile_columns by anon. Triggers do not need
--    EXECUTE granted to callers; the trigger machinery invokes them as the owner.
revoke all on function public.guard_protected_profile_columns() from public;
revoke all on function public.guard_protected_profile_columns() from anon;
revoke all on function public.guard_protected_profile_columns() from authenticated;
