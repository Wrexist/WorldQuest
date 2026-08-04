# Notifications

> "Notifications should feel like invitations, not pressure."

That sentence is the spec. Everything below enforces it.

Notifications are the highest-leverage and most-abused retention tool in mobile. Get
them right and they add days of habit; get them wrong and you get uninstalls plus a
1★ review that mentions "guilt-tripping". Duolingo's notification craft is superb and
its notification *tone* is one of its most-criticised features — we take the former
and reject the latter.

---

## 1. The permission ask

**Never on first launch.** The prompt appears after the user's **third completed
lesson**, in context:

> **Want a nudge?**
> One reminder a day, at a time you choose. Nothing else.
> *[Pick a time]* · *[Not now]*

Then, and only then, the OS dialogue. Result: a much higher grant rate, and users who
grant it actually want it.

If denied: we ask **once** more, ninety days later, and never again. A "Notifications
are off" row in Settings with a deep link to OS settings is enough.

## 2. The frequency budget — a hard cap

| Limit | Value |
|---|---|
| Maximum per day | **2** |
| Default per day | **1** |
| Maximum per week | **8** |
| Minimum gap | **4 hours** |
| Quiet hours | 21:00 – 08:00 local, **no exceptions** |
| Child accounts (< 13) | **1 per day, max, and never after 19:00** |

**Enforced in the scheduling service, not by convention.** The budget is a rate limiter
in code; a new notification type cannot bypass it, and a marketing campaign cannot
"just this once" exceed it.

## 3. Types

| Type | Trigger | Priority | Default | Example |
|---|---|---|---|---|
| **Daily reminder** | User-chosen time | 1 | ON | "Europe is waiting. 5 minutes?" |
| **Streak at risk** | 3 h before local midnight, streak ≥ 3, nothing done | 2 | ON | "Your streak is at 12. One lesson keeps it." |
| **Almost mastered** | A country is 1 lesson from `mastered` | 3 | ON | "Japan is almost mastered — one lesson to go." |
| **Review due** | ≥ 20 items due, none done in 2 days | 4 | ON | "20 places are ready for a refresh." |
| **Friend activity** | A friend passes you / challenges you | 3 | ON (v2.0) | "Alex just passed you. Fancy a rematch?" |
| **League** | League ends in 4 h and you're near a boundary | 4 | ON (v2.0) | "You're 3rd. Top 7 promote — 4 hours left." |
| **Event** | An event starts | 4 | ON | "Earth Day starts today. New biomes to explore." |
| **Comeback** | 3, 7, 14, 30 days inactive | 5 | ON | "The world missed you." |
| **Achievement close** | 90 %+ on a tiered achievement | 5 | OFF | "3 more flags to Gold." |
| **Weekly digest** | Sunday evening | 5 | OFF | "This week: 34 places, 5 days, 890 XP." |
| **Parent digest** | Weekly (Marcus) | — | ON for parents | "Emma learned 12 countries this week." |

Lower number = higher priority. When several qualify in one slot, **the highest
priority wins and the rest are dropped, not queued.** Deferring creates a backlog that
eventually fires as a burst — the exact failure we're preventing.

Each type has its **own toggle** in Settings. "All notifications off" is one tap and
does not nag.

## 4. Copy rules

Every notification must pass: **"Would I be glad to receive this?"**

```
✅  Europe is waiting. 5 minutes?
✅  Japan is almost mastered — one lesson to go.
✅  Your streak is at 12. Nice run.
✅  20 places are ready for a refresh.
✅  The world missed you.
✅  Alex just passed you. Fancy a rematch?

❌  Don't lose your 12-day streak!!
❌  😢 We haven't seen you in 3 days
❌  You're falling behind your friends
❌  LAST CHANCE — 2 hours left!
❌  Your streak died. 💀
```

**Rules**
1. ≤ 60 characters where possible; never > 100.
2. Second person, present tense.
3. **No exclamation marks in failure contexts.** One, maximum, in celebration.
4. **No guilt, no fear, no loss framing.** "Your streak is at 12" — never "don't lose
   your streak".
5. State a benefit or an invitation, always.
6. Emoji: at most one, and never a sad one.
7. Localised as a whole sentence with ICU — never assembled from fragments.
8. Personalised with real state (an actual country the user is close to), because a
   generic nudge is noise.

Voice guide: [`../design/voice-and-tone.md`](../design/voice-and-tone.md).

## 5. Deep links

Every notification opens a **specific, sensible** place — never a cold Home screen.

| Type | Destination |
|---|---|
| Daily reminder | Home, quest card focused |
| Streak at risk | Home, quest card focused |
| Almost mastered | `worldquest://country/JP` |
| Review due | `worldquest://quest/daily` (review tab) |
| Friend / league | The relevant screen |
| Event | `worldquest://event/<slug>` |
| Comeback | Home, with the "welcome back" state (H2) |

**A notification never starts a lesson directly.** The user always chooses to begin.
That single rule is most of the difference between an invitation and a shove.

## 6. Timing

- **Daily reminder:** the user picks. Default suggestion = the median hour of their
  last 14 sessions, rounded, with a sensible fallback of 19:00 local.
- **Streak at risk:** 3 h before local midnight — enough time to act, not so early it's
  premature.
- **Comeback:** 3, 7, 14, 30 days. Then **stop**. No 60-day, no 90-day. If someone
  hasn't come back in a month, more push won't fix it — email might, once.
- All timing is computed in the user's stored IANA timezone, server-side, and is
  re-derived when the timezone changes.

## 7. Suppression rules

Do not send if:

- The user has already completed a lesson today (except league/friend/event).
- The app was foregrounded in the last 2 hours.
- We're inside quiet hours.
- The budget is spent.
- The user is on a paused/holiday setting (v1.5 — "Pause reminders for a week").
- The account is a child account and it is after 19:00 local.
- The same type fired in the last 24 h (except the daily reminder).
- It's a comeback notification and the user has already ignored 3 in a row.

## 8. Measurement

| Metric | Target | Meaning if it breaks |
|---|---|---|
| Opt-in rate (after the in-context ask) | > 60 % | The ask is mistimed |
| Open rate | > 8 % | The copy isn't relevant |
| Notification → lesson completed | > 60 % of opens | The deep link is wrong |
| **Opt-out rate** | **< 8 %** | **We are annoying people — stop and fix** |
| **Uninstall within 24 h of a push** | **< 2 %** | **A notification is actively harmful** |
| Retention lift vs a holdout | > 0 | If it's zero, they're pure cost |

**Keep a permanent 5 % holdout that receives no notifications.** Without it you cannot
tell whether notifications cause retention or merely correlate with users who'd have
returned anyway. Most teams never do this and never find out.

## 9. Governance

- Adding a notification type requires: an entry in this table, a Settings toggle,
  localised copy in en + sv, a deep-link destination, and a measurement plan.
- Marketing may not send push. There is no "campaign" channel — every notification is
  triggered by the user's own state.
- Every 90 days, review the table and delete any type whose retention lift is ≤ 0.
- The 2/day cap is changeable only by a Product Bible amendment.

## 10. In-app messaging

Not everything needs to leave the app. The **Inbox** (Home → bell icon) holds
lower-priority messages: weekly digests, achievement summaries, event announcements,
release notes. It carries a quiet dot, **never a red count badge** — a red badge is
just a notification you can't turn off.
