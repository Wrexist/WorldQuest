-- The revokes that belong with `clear_streak_break_on_activity`.
--
-- A trigger function is reached by the trigger, never by a caller — but PostgreSQL grants
-- EXECUTE on new functions to `public` by default, and PostgREST exposes anything in the
-- `public` schema that a role may execute. So a function nobody is supposed to call was
-- one `POST /rpc/clear_streak_break_on_activity` away from being callable, and this file
-- exists because the RLS suite said so:
--
--   # Failed test 17: "no trigger function is callable over the REST API"
--   #     Unexpected records:
--   #         (clear_streak_break_on_activity)
--
-- That assertion is doing exactly the job it was written for. Every other trigger
-- function in this schema carries these three lines; the newest one did not, and the
-- default is permissive, which is the combination that makes this class of gap silent.
-- Calling it directly would be harmless — it returns a trigger record and would error
-- outside a trigger context — but "harmless when called wrong" is not the standard, and
-- an inventory of what a client can reach is only useful if it is complete.
--
-- Forward-only, so this is its own file rather than an edit to the migration that
-- created the function.

revoke all on function public.clear_streak_break_on_activity() from public;
revoke all on function public.clear_streak_break_on_activity() from anon;
revoke all on function public.clear_streak_break_on_activity() from authenticated;
