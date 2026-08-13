-- The two flags that stage the quest ceremony.
--
-- `feature_flags` has existed since 2026-08-09 with a deliberate note that it ships
-- empty: "an empty table means every flag reads as not-found, and the client treats
-- not-found the same as enabled=false — a flag is added by a row." This is the first
-- pair of rows, and the first code in the app that gates on anything.
--
-- ## Why rows exist at all when both are off
--
-- Because "off" and "absent" are the same to the client and completely different to an
-- operator. A missing row cannot be raised to 5 % — somebody has to know the key exists,
-- spell it correctly, and insert it during whatever is happening at the time. A row at
-- `enabled = false` is a switch on a wall.
--
-- ## The ladder
--
-- `docs/plan/build-order.md` names 5 → 25 → 50 → 100 %. Raising a flag is two fields:
--
--     update public.feature_flags set enabled = true, rollout_percent = 5
--      where key = 'quest_cover_page';
--
-- and halting one is `enabled = false`, which reaches a foregrounded device within one
-- poll interval (5 minutes) without shipping a binary. That is the whole reason this
-- table was built, and until now nothing used it.
--
-- ## What to watch between rungs
--
-- Both flags insert a screen into the core loop, so the number that matters is
-- daily-quest completion, not screen views. `quest_cover_page` costs a tap BEFORE the
-- lesson and `quest_completion_screen` adds one after it — separate keys precisely so a
-- drop can be attributed to one of them rather than to "the ceremony".

insert into public.feature_flags (key, enabled, rollout_percent, description) values
  (
    'quest_cover_page',
    false,
    0,
    'Home''s quest button opens the quest cover page (what today is, what it pays) instead of going straight into the lesson. Off = the pre-redesign path. Watch daily-quest completion.'
  ),
  (
    'quest_completion_screen',
    false,
    0,
    'Finishing the daily quest shows a celebration after the lesson summary. Off = the summary returns home as before. Watch next-day return rate.'
  )
on conflict (key) do nothing;
