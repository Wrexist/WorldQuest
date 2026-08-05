-- Append-only has to hold for the statement, not only for the rows it happened to match.
--
-- The hardening pass gave `review_log` a BEFORE UPDATE OR DELETE trigger FOR EACH ROW,
-- and that is a real guarantee for every delete that removes something. It is not the
-- guarantee the table's contract states. `create_learning.sql` opens with "review_log is
-- APPEND-ONLY", and append-only is a property of the *operation*: a DELETE against this
-- table is a bug wherever it is written, whether or not its WHERE clause happens to be
-- selective enough to hit a row today.
--
-- The RLS test found this the honest way. It asserts the refusal with
--
--   delete from review_log where id = -1
--
-- which is the right shape for a test — it must not depend on fixture rows, because a
-- test that deletes a real row can only run once and only in the order it was written.
-- With a row-level trigger the statement matched nothing, fired nothing, and returned
-- DELETE 0 without complaint, so the test read "caught: no exception". The test was
-- correct and the trigger was narrower than the sentence it was enforcing.
--
-- A statement-level trigger closes it. It fires once per DELETE or UPDATE regardless of
-- how many rows are matched, including zero, so the assertion the schema makes in prose
-- is the assertion the schema makes in fact. The row-level trigger stays: it is the one
-- that names the row in a cascade, and two triggers refusing the same thing is a cost of
-- nothing.
--
-- Return type is `trigger` and the function raises before returning, so it serves both
-- timings — a statement-level trigger's return value is ignored either way.

create trigger review_log_is_append_only_stmt
  before update or delete on public.review_log
  for each statement execute function public.refuse_review_log_mutation();
