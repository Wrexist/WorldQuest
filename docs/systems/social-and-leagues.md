# Social & leagues *(v2.0)*

> **Status, August 2026.** The league's *rules* and its *schema* have landed —
> `packages/engines/src/leagues` (19 tests) and
> `supabase/migrations/20260813100000_create_leagues.sql`. The client half has not, and
> the reason is written into `scripts/reachability.ts` beside the allowlist entry rather
> than left to look like an oversight: RLS that has never been executed against a real
> Postgres is RLS that has never been tested, and on a children's leaderboard the failure
> mode is every child's cohort being readable by everyone. To finish:
> `pnpm db:start && pnpm db:reset && pnpm db:types && supabase test db`, then the read
> and the screen.
>
> One thing below changed in the building of it, and it is §1's own prerequisite that
> forced it — see **Handles are assigned, never authored**.

Social features are the strongest retention lever available and the single largest
safety liability in a product used by children. Both facts are true, so the design
below is deliberately narrow: **competition without contact.**

> **Prerequisite:** moderation, reporting, and blocking ship *with* the social graph,
> not after it. A kids' app with unsupervised social features is a headline waiting to
> happen.

---

## 1. The safety stance

| Rule | Consequence |
|---|---|
| **No free-text chat. Ever.** | Permanent no-list item |
| **No user-authored display text** beyond a handle, which is moderated | No profile bios, no custom titles |
| **Under-13 accounts have no social features at all** | Not "restricted" — absent |
| **13–17 accounts:** friends by code only, no discovery, no global leaderboard | Cannot be found by strangers |
| **Classroom mode:** social off entirely, class-scoped boards only | Sarah's requirement |
| Interaction vocabulary is fixed | Emoji reactions from a fixed set, and challenge invites. That's all. |
| Report + block on every surface | One tap, always visible |

Everything that follows lives inside those constraints. A social feature that requires
loosening them does not get built.

### Handles are assigned, never authored

The table above said "no user-authored display text beyond a handle, **which is
moderated**". Building it made the cost of that clause visible: a moderated handle needs
a queue, a policy, an appeals path, and somebody reading it on a Sunday. This product has
none of those and will not have them for a leaderboard, so "which is moderated" was a
promise the feature could not keep — and an unkept moderation promise on a kids' app is
the headline the prerequisite above is written to prevent.

So the handle is **assigned**, deterministically, from two curated word lists:
`Swift Glacier 42`. Not a stopgap for real moderation — strictly stronger than it. There
is no free text anywhere in the feature, so there is nothing to moderate, nothing to
report and nobody to block. The surface is removed rather than policed.

It is enforced at three levels, because one is a decision and three is a guarantee:

| Level | What it does |
|---|---|
| `packages/engines/src/leagues/handles.ts` | Generates the handle from the user id. 390,000 of them, deterministic, so it survives a reinstall. |
| A `CHECK` on `league_members.handle` | Only `Word Word 00` can be stored. A future code path that tried to write a display name fails at the database. |
| No writable column | RLS grants no insert or update on `league_members` at all. Handles are the server's. |

A user who wants to be called something else can be, on the one screen where it reaches
nobody: their own profile. The league shows the handle.

### Under-13 is absent, and the database says so

Not filtered in the client, not hidden behind a flag — a trigger on `league_members`
refuses the insert. `profiles.is_child` is set once at signup from the age gate and is
immutable by trigger, so there is no field to edit around it.

---

## 2. Friends

**Adding** — a 6-character friend code, a QR code, or a share link. **No contact
import, no "people you may know", no search by name.** Discovery is the mechanism by
which strangers find children.

**What friends can do**

| Can | Cannot |
|---|---|
| See your level, streak, weekly XP, achievements count | See your email, real name, location, or activity times |
| Send a challenge | Send a message |
| React to a milestone with a fixed emoji | Comment |
| Appear in your friends leaderboard | See your mistakes or your weak facts |

**What friends can never see:** which facts you're bad at. Learning gaps are private —
a leaderboard of weaknesses would be the cruellest possible feature.

## 3. Friend challenges *(v1.5)*

Asynchronous, always. No live matchmaking, no waiting rooms, no "your opponent
left".

```
Alex challenges Leo → 10 items, same seed, same content
Both play whenever they like, within 48 h
Both see the result when both are done (or on expiry)
Winner: accuracy first, then time
```

- **Same seed = same questions.** Fair, and verifiable server-side.
- Rewards: coins and bragging rights. **Never XP** (that would let two friends farm
  league position) and never content.
- Declining is free, silent, and never reported to the challenger.
- Max 3 pending challenges per pair — no spam vector.
- Challenges are disabled for under-13 and in Classroom mode.

## 4. Leagues (mockup #12)

Weekly competitive cohorts. The mockup shows Gold I, "Top 15 %", a season ending in
5 d 12 h, and 30 ranked players.

### Structure

| | |
|---|---|
| Cohort size | 30 |
| Duration | Monday 00:00 UTC → Sunday 23:59 UTC |
| Score | XP earned that week (nothing else) |
| Tiers | Bronze · Silver · Gold · Sapphire · Ruby · Diamond · Legend, each I / II / III |
| Promotion | Top 7 |
| Demotion | Bottom 5 |
| Floor | **Never demoted out of Bronze** |

### Cohorting — the part that decides whether leagues feel good

Random cohorts are the reason leagues feel unfair. Ours are matched on **recent
activity band**, so a 10-minute-a-day user competes with other 10-minute-a-day users:

```
band = quantile(median daily XP over the last 14 days)
cohort = 30 users from the same tier × same band, shuffled with a weekly seed
```

Effects worth stating: a casual user can genuinely win their cohort; a grinder cannot
farm easy promotions by sandbagging (bands are computed on a trailing window); and
new users spend their first week in a "newcomer" cohort so their first league
experience isn't last place.

### Rewards

Top 3 get coins (300 / 200 / 100) and a seasonal badge. Promotion grants a tier badge.
**Never XP, never content, never hearts.** Rewarding XP would compound rank into rank.

### Kindness rules

- Demotion is announced quietly, once, in-app. **No push notification for demotion.**
- The league screen never shows how far *behind* the bottom you are.
- Inactive users (0 XP for the week) are removed from the cohort rather than shown at
  the bottom — nobody's absence becomes someone else's leaderboard.
- **Leagues are opt-out in one tap** and off by default in Relaxed and Classroom modes.
- No streak of promotions is required for anything.

## 5. Leaderboards

| Scope | Who | Notes |
|---|---|---|
| League (30) | Everyone opted in, 18+ or 13–17 | Weekly XP |
| Friends | Your friends | Weekly XP |
| Class | Sarah's class | Teacher-visible; students see first names only |
| Family | Marcus's household | Cooperative framing, not competitive |
| Global daily challenge | Everyone 18+ | Today only, resets daily |

**No all-time global leaderboard.** It would be permanently owned by twelve people
with no path in for anyone else, and it is the single strongest incentive to cheat.

## 6. Family mode *(v2.0, Marcus)*

Up to 6 members. The framing is **cooperative, not competitive** — a family
leaderboard that pits a 7-year-old against a 42-year-old is a bad evening.

- A shared family goal ("400 countries this month") with a shared reward.
- A parent dashboard: per-child time, lessons, countries learned, weak areas.
- Parents can set time limits and a bedtime cutoff for the app.
- **Parents cannot see a child's individual wrong answers** — progress, not surveillance.
  Reviewing a child's every mistake is how you make a child hate a learning app.

## 7. Classroom mode *(v2.0, Sarah)*

- Join by **class code**. No student email required, ever — this is the whole reason
  Kahoot won classrooms.
- Assignments: a topic, a due date, a target mastery.
- Teacher dashboard: completion, mastery per topic, students who are struggling.
- **All social features off.** No friends, no leagues, no global boards. Class-scoped
  leaderboards are opt-in by the teacher and can be set to show effort (lessons
  completed), not rank.
- Progress export as CSV.
- School-level admin for multi-class deployment.

## 8. Moderation & reporting

| Surface | Mechanism |
|---|---|
| Handles | Auto-screened against a multilingual blocklist at creation, plus manual review of reports |
| Avatars | Only pre-made assets. No uploads, ever. |
| Reports | One tap on any profile → queue with a 24 h SLA |
| Blocking | Immediate, mutual, silent to the blocked user |
| Repeat offenders | Handle reset → suspension → ban |
| Cheating | Shadow-segregation into flagged-only cohorts before any ban |

Roles `moderator` and `support` exist in the schema from **day one** so that adding
moderation later is a permission grant, not a migration. See
[`../engineering/security-privacy.md`](../engineering/security-privacy.md).

## 9. Anti-toxicity by design

The best moderation is a system with nothing to moderate.

1. No free text anywhere.
2. No losing streaks, no public failure, no visible "worst" list.
3. No way to see another user's mistakes.
4. Reactions come from a fixed, positive set. There is no thumbs-down.
5. Absence is invisible — an inactive friend simply doesn't appear.
6. Competition is always opt-out, one tap, no explanation required.

## 10. Metrics

| Metric | Target |
|---|---|
| League participation | ≥ 30 % of WAU |
| Users with ≥ 1 friend | ≥ 25 % |
| Challenge acceptance | ≥ 50 % |
| Retention lift from leagues (vs holdout) | > 0 |
| **Reports per 1,000 users** | **< 1** |
| **Safety incidents** | **0** |
| League opt-out rate | < 10 % |

Keep a holdout with leagues disabled. If leagues don't demonstrably lift retention,
they're carrying real safety and complexity cost for nothing — and we should say so
out loud rather than keep them because every competitor has them.
