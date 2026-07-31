---
name: worldquest-liveops
description: Design or configure a WorldQuest daily quest, weekly quest, seasonal event, or themed collection. Use when planning the content calendar, building an event, or adding recurring content. Enforces the config-not-code rule and the no-FOMO constraints.
---

# Designing a live-ops event

Spec: [`docs/systems/quests-and-liveops.md`](../../docs/systems/quests-and-liveops.md).

## The rule that makes this work

**An event is a config row plus a content pack — never a release.** If your event
design needs an app build, redesign it. That constraint is what lets a small team run
a 12-month calendar.

```json
{
  "id": "evt.2027.earth-day",
  "slug": "earth-day-2027",
  "startsAt": "2027-04-18T00:00:00Z",
  "endsAt": "2027-04-26T23:59:59Z",
  "config": {
    "banner": { "key": "events:earthDay.banner", "art": "events/earth-day/hero.webp" },
    "theme": { "canvas": "#04210F", "accent": "#3FBF8F" },
    "contentPacks": ["geography.biomes.v1"],
    "quests": ["quest.event.biome-explorer"],
    "collection": "coll.earth-day-2027",
    "rewards": { "cosmetic": "avatar.earth-hat", "coins": 500 },
    "leaderboard": { "enabled": true, "scope": "global" }
  }
}
```

Theme overrides work because every colour goes through the semantic token layer. Don't
break that.

## Hard constraints

1. **Finishable with 3 of 8 days of play.** A family holiday must not cost someone the
   event.
2. **Never required for progression.** Missing an event costs cosmetics, never mastery
   or completion — Sarah's class in September must not fall behind for skipping
   Carnival.
3. **Cosmetic rewards only.** Never power, never content access, never XP multipliers.
4. **One notification per event**, inside the global 2/day budget.
5. **No manufactured urgency.** No "2 HOURS LEFT!!". Show a countdown; don't shout.
6. **A kill switch** — every event can be disabled server-side without a release.
7. **Graceful degradation** — an old client ignores unknown config keys. Never crash.
8. **Event content becomes permanent after 12 months.** Exclusivity is *temporal*
   (a badge dated 2027), never permanent. FOMO-driven permanent exclusivity is a dark
   pattern.

## Daily quest generation

Five slots, composed against the user's real state — never random:

| Slot | Type | Source |
|---|---|---|
| 1 | Locate | Due items |
| 2 | Recognise | Due items |
| 3 | Recall | Due items |
| 4 | Discover | **New** content — the quest should teach something |
| 5 | Perform | Speed / perfect / streak-keeper, scaled to recent accuracy |

Always ≤ 10 minutes. Always completable offline with cached content. Never requires
social features or payment. **A missed daily quest is never mentioned again** — no
make-up guilt.

## Calendar hygiene

- One major event at a time; ≥ 1 week gap between them
- The next **two months** are always fully built and QA'd — live-ops built the week it
  ships is live-ops that breaks on a Saturday
- Opportunistic events (Olympics, World Cup) need a pack ready 4 weeks ahead
- Post-event retro within 7 days: participation, retention lift, complaints

## Preview before shipping

```bash
pnpm dev --previewEvent=earth-day-2027
```

Check: banner, theme, quests, collection, rewards, and the **end** state (what a user
sees the day after it closes — that's the one everybody forgets).
