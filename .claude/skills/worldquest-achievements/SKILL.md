---
name: worldquest-achievements
description: Add or change a WorldQuest achievement. Use when creating achievements, editing tiers or thresholds, or working on the achievement rule engine. Enforces the six rule types, permanent IDs, and the backfill policy.
---

# Adding an achievement

Spec: [`docs/systems/achievements.md`](../../docs/systems/achievements.md).
Definitions live in `packages/content/packs/achievements/` — **data, not code.**

## Definition

```json
{
  "id": "ach.flags.collector",
  "category": "flags",
  "hidden": false,
  "icon": "flag-collection",
  "name": { "key": "achievements:flags.collector.name" },
  "description": { "key": "achievements:flags.collector.desc" },
  "rule": {
    "type": "counter",
    "event": "fact_mastered",
    "where": { "attribute": "flag" },
    "distinctBy": "entityId"
  },
  "tiers": [
    { "tier": "bronze", "threshold": 10 },
    { "tier": "silver", "threshold": 50 },
    { "tier": "gold", "threshold": 100 },
    { "tier": "platinum", "threshold": 195 }
  ],
  "showProgress": true,
  "backfill": true,
  "minVersion": "1.5.0"
}
```

## The six rule types — resist adding a seventh

| Type | Use |
|---|---|
| `counter` | Count matching events, optionally distinct |
| `streak` | Consecutive occurrences |
| `threshold` | A stat crossing a value |
| `set-completion` | All members of a set |
| `session` | A condition within one lesson |
| `composite` | AND/OR over other rules |

A special case is one achievement's convenience and every future achievement's tax. If
none of the six fits, the achievement probably wants redesigning.

## Rules

1. **IDs are permanent.** They ship in save data and dashboards.
2. **Tier before inventing a new achievement** — one definition, four unlocks, four
   celebrations.
3. **Reachable by a free, solo user.** No achievement may require money, friends, or
   social features — Sarah's classroom and Ingrid must not be locked out.
4. **Never reward unhealthy behaviour.** No "play at 3 am", no "10 hours this week".
5. **Criteria are visible** unless `hidden: true` (keep those rare — 15 of ~300 — and
   never required for completion).
6. **Evocative names**: "Continental Drift", not "Master 54 countries".
7. **Localised**, including flavour text.
8. **≥ 1 achievement always < 1 day away** for every user, or the system looks dormant.

## Backfill

A user with a 200-day streak must never see "7-day streak" as *locked*.

- Replayable rules (`counter`, `threshold`, `set-completion`) → set `"backfill": true`
  and add a migration job.
- Non-replayable (`session`, some `streak`) → `"backfill": false`, applies from the
  release date.
- Backfilled unlocks are granted **silently in bulk** with one summary. Twelve
  consecutive celebration animations is a bug, not a reward.

## Where it runs

**Server-side**, in `submit-lesson`, because achievements award XP and coins. Client
evaluation exists only for optimistic celebration; a client-only unlock is discarded.

## Rewards by tier

Bronze 25 XP / 10 coins · Silver 50 / 25 · Gold 100 / 50 · Platinum 250 / 100 ·
Legendary 500 / 200. Any change goes through `/wq-balance-check`.

## Testing

Unlocks at exactly the threshold (not before) · tier progression in order · incremental
evaluation equals a full replay · backfill produces the same result as live evaluation ·
no double-award on a replayed lesson.
