---
name: worldquest-notifications
description: Write or change WorldQuest push notification copy, types, timing or triggers. Use when adding a notification, editing its copy, or changing scheduling. Enforces the 2/day budget, quiet hours, child limits, and the no-guilt rule.
---

# Notifications

Spec: [`docs/systems/notifications.md`](../../docs/systems/notifications.md).

## The test every notification must pass

> **"Would I be glad to receive this?"**

If it works only by making someone anxious, it doesn't ship. Duolingo's notification
*craft* is superb and its notification *tone* is one of its most-criticised features —
we take the former and reject the latter.

## The budget is code, not convention

| Limit | Value |
|---|---|
| Max/day | **2** (default 1) |
| Max/week | 8 |
| Min gap | 4 hours |
| Quiet hours | 21:00–08:00 local, no exceptions |
| **Child accounts** | **1/day max, never after 19:00** |

Enforced by a rate limiter in the scheduling service. A new type cannot bypass it, and
there is no "just this once" override.

When several notifications qualify for one slot, **the highest priority wins and the
rest are dropped, not queued.** Deferring creates a backlog that eventually fires as a
burst.

## Copy

```
✅  Europe is waiting. 5 minutes?
✅  Japan is almost mastered — one lesson to go.
✅  Your streak is at 12. Nice run.
✅  The world missed you.

❌  Don't lose your 12-day streak!!
❌  😢 We haven't seen you in 3 days
❌  You're falling behind your friends
❌  LAST CHANCE — 2 hours left!
```

**Rules:** ≤ 60 chars where possible · second person, present tense · **no exclamation
marks in failure contexts** · no guilt, fear, or loss framing · at most one emoji,
never a sad one · a whole ICU sentence, never assembled fragments · personalised with
real state (an actual country they're close to), because a generic nudge is noise.

## Deep links

Every notification opens somewhere specific. **A notification never starts a lesson
directly** — the user always chooses to begin. That one rule is most of the difference
between an invitation and a shove.

| Type | Destination |
|---|---|
| Daily / streak | Home, quest card focused |
| Almost mastered | `worldquest://country/JP` |
| Review due | `worldquest://quest/daily` |
| Event | `worldquest://event/<slug>` |
| Comeback | Home, "welcome back" state |

## Adding a type requires all five

1. A row in the type table in the spec
2. Its own Settings toggle
3. Localised copy in `en` and `sv`
4. A deep-link destination
5. A measurement plan

## Suppression

Don't send if: they already learned today (except league/friend/event) · the app was
open in the last 2 h · quiet hours · budget spent · reminders paused · child account
after 19:00 · the same type fired in 24 h · three comeback notifications already
ignored.

## Measurement

Watch **opt-out rate < 8 %** and **uninstall-within-24h-of-push < 2 %**. Either
breaking means stop and fix, not tune.

Keep the permanent **5 % holdout** that receives nothing. Without it you cannot tell
whether notifications cause retention or merely correlate with users who'd have
returned anyway.

Every 90 days: delete any type whose measured lift is ≤ 0.
