-- The flag that stages the weekly league.
--
-- The league engine, the schema and the RLS have been finished and unreachable since
-- 2026-08-13, for a reason `scripts/reachability.ts` records at length: they were written
-- in an environment with no Docker, so the migration never met a real Postgres, the types
-- could not be generated from it, and `supabase test db` could not prove the policies.
-- CI has now run all 35 of those tests green against this schema. So the client half
-- exists, and this row is the switch that lets it out.
--
-- ## Why it ships off
--
-- Every other flag in this table is off for rollout hygiene. This one is off for a
-- second reason as well: it is the only surface in the product where one user sees
-- anything about another. The RLS is proven, the handles are assigned from curated word
-- lists so there is nothing to moderate, and under-13 accounts are blocked by a trigger
-- AND by the client — and it is still worth finding out how the weekly placement, the
-- rollover and a half-empty cohort behave with five per cent of real people before they
-- behave that way for everyone.
--
-- ## What to watch when raising it
--
-- Not engagement. `social-and-leagues.md` §4 exists because a leaderboard can raise
-- engagement while making the product worse: the numbers that decide whether this stays
-- are next-day return among people in the BOTTOM half of a cohort, and the opt-out rate.
-- If people who are losing stop coming back, the feature is working exactly as designed
-- and should be removed anyway.
--
--     update public.feature_flags set enabled = true, rollout_percent = 5
--      where key = 'weekly_league';

insert into public.feature_flags (key, enabled, rollout_percent, description) values
  (
    'weekly_league',
    false,
    0,
    'The weekly league: a cohort of 30, ranked by weekly XP, with a chip on Home and an opt-out in Settings. Off = no chip, no screen, no cohort read. Under-13 accounts never see it whatever this says. Watch next-day return among the BOTTOM half of cohorts, and the opt-out rate — not overall engagement.'
  )
on conflict (key) do nothing;
