---
description: Add a WorldQuest achievement with the correct rule type, tiers and localisation
argument-hint: <category> <description of the goal>
---

Add the achievement: **$ARGUMENTS**

Invoke the `worldquest-achievements` skill.

1. Read `docs/systems/achievements.md`.
2. Pick a permanent ID: `ach.<category>.<slug>`. It ships in save data — never reused,
   never renamed.
3. Choose one of the six rule types. If none fits, say so rather than inventing a
   seventh — the achievement probably wants redesigning.
4. Prefer **tiering an existing achievement** over creating a new one.
5. Add it to `packages/content/packs/achievements/`.
6. Add localised name and description (`en` + `sv`), with an evocative name —
   "Continental Drift", not "Master 54 countries".
7. Decide `backfill`: replayable rules yes, `session`-based no.
8. Confirm it is reachable by a **free, solo** user — no money, no friends, no social
   features.
9. Confirm it doesn't reward unhealthy behaviour (no late-night, no hours-played goals).
10. Add tests: unlocks exactly at threshold, tiers progress in order, incremental
    evaluation equals a full replay, no double-award on a replayed lesson.

If it changes reward totals meaningfully, run `/wq-balance-check`.
