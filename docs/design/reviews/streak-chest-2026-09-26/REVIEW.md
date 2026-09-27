# Daily streak chest review ? 26 September 2026

Implemented the user's explicit choice: coins stay spendable; streak gems are
collectible dated badges. The chest uses original layered artwork and a bounded
1.8-second animation. Home gains a daily goal and a seven-day activity strip.

## Evidence

- `pnpm verify`: passed, including 906 mobile tests and all content, economy,
  translation, contrast, type, accessibility-source and architecture gates.
- Browser end-to-end flow: 109/109 steps passed, including a real lesson followed
  by opening the chest.
- Browser accessibility tree: passed. This does not substitute for VoiceOver or
  TalkBack on devices.
- Full design screenshot sweep: passed, including 111 flow-state captures.
- Final Home and Streak captures at 320, 390 and 768 points: no measured target,
  horizontal-overflow or unlabeled-control problems.
- `review-streak-chest.cjs`: actual lesson completion, animated lid samples,
  reduced-motion samples, reload protection and one saved collectible. See
  `report.json`, `chest-in-app.webm` and the PNGs in this directory.
  At 320 points and 200% text, Continue remains visible with no sideways overflow.

Inspected closed/opened chest frames, the collection and Home. The chest silhouette
is clear; the opened state exposes gems; the badge copy distinguishes collecting
from spending. Home retains the course action and scrolls to it on short screens.
The daily goal card above it remains reachable by scrolling.

## Release limitations

Both native bundles compile, but the startup-size gate fails at 4.85 MB against
4.6 MB. Native asset payload is 5.72 MB iOS / 5.71 MB Android. The budget was not
raised. Native performance and device screen-reader passes remain outstanding.
Gem badges are device-local and account-scoped, not cloud-synced; this is stated
in the collection UI. No claim of improved retention is made without a measured
experiment.
