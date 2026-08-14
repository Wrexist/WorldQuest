-- The revokes that belong with `league_member_is_not_a_child`.
--
-- Exactly the gap `20260805220000_revoke_break_trigger_execute.sql` was written for, in
-- exactly the same shape, one trigger function later:
--
--   # Failed test 17: "no trigger function is callable over the REST API"
--   #     Unexpected records:
--   #         (league_member_is_not_a_child)
--
-- PostgreSQL grants EXECUTE on a new function to `public` by default and PostgREST
-- publishes anything in the `public` schema a role may execute, so the guard that keeps
-- under-13 accounts out of the leaderboard was itself sitting at
-- `POST /rpc/league_member_is_not_a_child`. Calling it there does nothing useful — it
-- returns a trigger record and errors outside a trigger context — but the standard is
-- not "harmless when called wrong", and an inventory of what a client can reach is only
-- worth having if it is complete.
--
-- Worth naming why this landed a second time rather than being caught in review: the
-- leagues migration was written in an environment with no Docker, so `supabase test db`
-- could not run against it locally and the whole reason the leagues client half was left
-- unbuilt was that its RLS was unproven. CI is where that proof lives, and CI found this
-- the first time the migration met a real Postgres. The revoke belongs beside the
-- function; a default that is permissive is what makes this class of gap silent.
--
-- Forward-only, so this is its own file rather than an edit to the migration that
-- created the function.

revoke all on function public.league_member_is_not_a_child() from public;
revoke all on function public.league_member_is_not_a_child() from anon;
revoke all on function public.league_member_is_not_a_child() from authenticated;
