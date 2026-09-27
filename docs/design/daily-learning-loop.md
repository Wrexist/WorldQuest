# Daily learning and collectible streak gems

26 September 2026. Implements the user's choice: keep coins, make streak gems
collectible badges. Serves Emma's interest in playful collecting and Alex's visible
progress. Weekly Learning Days remains the product measure; no retention improvement
is claimed without an experiment.

## Behavior

Home now shows the learner's existing daily lesson target and seven actual activity
days. Completed days have a check mark as well as color. Finishing a lesson updates
the strip immediately, and the summary acknowledges daily-goal progress. Abandoning
a lesson does not count as completing a learning day. The activity hook refreshes
on completion, account changes, midnight and foregrounding.

The first completed lesson of a local day saves one chest receipt. The streak beat
lets the learner tap the chest or its button to open it. Anticipation, a lifting lid
and a short gem burst resolve to a still open chest. Continue remains available.
Reduced Motion reveals the same reward immediately. Sound and haptics use existing
preferences. Timelines stop on unmount or backgrounding.

Opening saves one dated collectible gem. Coins, XP, paid entitlements and server
reward calculations are unchanged. The gem collection is cosmetic, local to this
device and scoped to the active account; it does not claim cloud synchronization.
The streak page shows the total and browsable pages of seven dated gems, newest
first with localized dates, plus an entry
to today's unopened chest. Past gems survive streak breaks. A missed day's unopened
chest is not backfilled; this is a small keepsake for an actual completed lesson,
not a paid or randomized prize. Receipt validation, date deduplication and account
isolation prevent ordinary retries or account changes from duplicating a badge.

All new visible copy is translated into English and Swedish. Original chest and gem
SVG masters are exported to transparent WebP assets by `build-playful-art.cjs`.

## Verification

See `reviews/streak-chest-2026-09-26` for actual Expo browser screenshots, animation
video and transform samples. The browser review completes a real lesson before
opening the chest, repeats with reduced motion, reloads, and verifies one collected
gem. Unit tests cover missing/mismatched receipts, repeated opening, gaps between
days, corrupted storage and account isolation. The main end-to-end flow also opens
the chest after a lesson.

Native device performance, VoiceOver and TalkBack still require device testing.
PR #21 resolved the earlier native bundle budget failure by excluding the unused
legacy SDK from D1 builds. The integrated redesign measures 4.39 MiB per platform
against the unchanged 4.6 MiB budget. Opening a chest from the collection now returns
to that collection; restoring server activity refreshes mounted week/month charts.
