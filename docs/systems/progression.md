# Progression

> "Not just levels. Have multiple systems."

Ten parallel progression systems. That sounds like a lot until you notice what it
buys: **at any moment, every user has something close to finishing.** One system means
one plateau; ten systems mean a user is always ~80 % through *something*.

They also serve different personas — Alex chases completion, Emma chases collections,
Priya chases the streak, Kenji chases mastery, and none of them are competing for the
same reward.

---

## The ten

| # | System | Unit | Ends? | Primary persona |
|---|---|---|---|---|
| 1 | **Explorer Level** | XP | Never | All |
| 2 | **Region Mastery** | Facts mastered / region | Per region | Leo, Alex |
| 3 | **Country Completion** | Facts mastered / country | Per country | Kenji |
| 4 | **Global Completion** | Countries mastered / 195 | Yes — and that's the point | Alex |
| 5 | **Streak** | Consecutive days | Never | Priya, Emma |
| 6 | **Collections** | Items owned / total | Per collection | Emma, Alex |
| 7 | **Achievements** | Unlocked / total | Grows with content | All |
| 8 | **League Rank** | Weekly XP | Weekly cycle | Alex, Leo |
| 9 | **Season Rank** | Season points | ~8-week cycle | Alex |
| 10 | **Prestige** | Post-100 % re-mastery | Never | Kenji, Alex |

---

## 1. Explorer Level

`xpForLevel(n) = round(50 · n^1.55)` — see
[`xp-economy.md`](xp-economy.md#level-curve). Uncapped. Every 10 levels grants a
**Title**:

| Level | Title |
|---|---|
| 1 | Wanderer |
| 10 | Scout |
| 20 | Navigator |
| 30 | Cartographer |
| 40 | Pathfinder |
| 50 | Voyager |
| 60 | Circumnavigator |
| 70 | Trailblazer |
| 80 | Globetrotter |
| 90 | Worldkeeper |
| 100 | Atlas |

Titles are displayed on the profile and next to your league row. They cost nothing to
build and are chased for months.

## 2. Region Mastery

```
regionMastery(r) = facts in r with mastery >= 'proficient' / total facts in r
```

Displayed as the continent progress in Explore (`Europe 48 / 48`). Tiers at
**25 / 50 / 75 / 100 %**, each granting a badge and coins. The 100 % tier grants a
map skin for that region — a cosmetic that only means something if you earned it.

## 3. Country Completion

A country is **complete** when all its core facts (flag, capital, location, region)
reach `mastered`. Shown on the country page as `18 / 25`.

Completion decays: if a fact drops out of `mastered` (a lapse), the country loses its
completion badge until it's restored. This is honest — it's the difference between
"you learned this once" and "you know this" — but it must be communicated gently:
a quiet indicator and a review suggestion, **never** a notification saying you lost
something.

## 4. Global Completion

`countries mastered / 195`. The headline number. The mockup's profile shows
`183 / 195`, and the psychological pull of those last 12 is the strongest retention
mechanic we have that isn't a streak.

**This one is designed to end.** Reaching 195/195 unlocks the **Worldkeeper** title, a
permanent profile marker, and access to Prestige (§10). A finished thing that stays
finished is a better memory than an infinite grind.

## 5. Streak

Consecutive days with ≥ 1 lesson completed, evaluated in the **user's own timezone,
server-side**.

**The kind version:**
- **Streak Freeze** — 400 coins, hold up to 2, auto-consumed on a missed day.
- **Streak Repair** — 600 coins within 48 h, once per 30 days.
- **Weekend Pass** — Premium; weekends never break a streak.
- **Milestones** at 7 / 30 / 100 / 365 with XP, coins and a badge.
- **Losing a streak is stated, never mourned:** "Streak reset. Today's a good day to
  start a new one." No red, no sad mascot, no notification about it.
- **Streaks can be hidden entirely** in Settings (Ingrid) and are off in Relaxed Mode.

**Longest streak is remembered forever** and shown on the profile — so a lost streak
still leaves an achievement behind rather than an erased year.

## 6. Collections

Cross-cutting sets: All Flags (195) · World Capitals (195) · Landmarks (300) ·
Island Nations (47) · Flags with Stars · UNESCO Sites · seasonal sets.

Completing one grants XP, coins and an exclusive cosmetic. **Locked items are always
visible but dimmed** — seeing the gap is the motivation, and hiding unearned content
just makes the app feel empty.

Collections are queries over entities, so a new one is a config row, not a release.
That makes them the cheapest live-ops lever we have.

## 7. Achievements

~68 at v1.5, growing towards ~300. Full taxonomy and rule engine:
[`achievements.md`](achievements.md).

## 8. League Rank *(v2.0)*

Weekly cohorts of 30, matched by activity band so a casual user isn't dropped into a
pool of grinders. Tiers: Bronze → Silver → Gold → Sapphire → Ruby → Diamond →
Legend, each with I / II / III.

- Top 7 promote · bottom 5 demote · **never demoted out of Bronze**.
- Rewards: coins + a seasonal badge. **Never XP** (that would compound), never content.
- Opting out is a one-tap setting, and leagues are off in Classroom and Relaxed modes.

Full design: [`social-and-leagues.md`](social-and-leagues.md).

## 9. Season Rank *(v2.0)*

~8-week seasons with a themed track (e.g. "The Silk Road"), ~40 tiers, earned through
Season Points from any activity. Free track for everyone; a Premium track adds
cosmetics — **never content, never XP, never advantage.**

Seasons exist so that someone who joins in month nine still has something to start
from zero on. That's the point of a season.

## 10. Prestige

Unlocked at 195/195. Resets *display* completion (never the underlying `user_facts` —
progress is never actually destroyed) and re-runs the world at a higher target
retention with harder templates: free text instead of multiple choice, tighter timers,
reverse questions.

Prestige levels are shown as stars beside the profile name. Kenji will do this three
times.

---

## How they combine on Home

The Home screen shows **at most three** progression surfaces at a time, chosen by
proximity to completion:

```
priority = (1 − remaining / total) × systemWeight
```

Show the three highest. A user 96 % through Flags sees Flags. A user with nothing
close sees their streak and today's quest. **Never show all ten** — that's a dashboard,
not a game.

## Progression anti-patterns we avoid

| Anti-pattern | Why it's bad | Our rule |
|---|---|---|
| A single grind bar | One plateau, no variety | Ten systems |
| Progress that can be lost permanently | Punitive; drives quitting | Streaks repair; mastery rebuilds; nothing is deleted |
| Progression bought with money | Kills the meaning of every badge | Premium sells cosmetics and convenience only |
| Infinite everything | Nothing ever feels finished | Global Completion is finite and celebrated |
| Hidden requirements | Feels arbitrary and unfair | Criteria always visible (except `hidden` achievements) |
| Progress requiring social features | Excludes Sarah's classroom and Ingrid | Every system is completable solo |
