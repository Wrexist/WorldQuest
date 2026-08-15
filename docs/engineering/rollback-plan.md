# Rollback plan

The release Definition of Done asks for "migrations applied and reversible; rollback plan
written". This is that plan. It exists because the honest answer to "how do we undo this?"
was previously nothing at all, and the answer turns out to be different for each of the
three things a release changes.

---

## The shape of the problem

A WorldQuest release moves three things that fail independently and roll back
differently:

| What moved | Can it be rolled back? | How |
|---|---|---|
| The app binary | **No.** | Stores do not un-ship a version. You ship a new one, and users update on their own schedule. |
| Edge functions | **Yes, in minutes.** | Redeploy the previous revision. |
| Migrations | **Only forward.** | `supabase/migrations/` is forward-only by repo rule. A "rollback" is a new migration that undoes the change. |

The asymmetry is the whole reason this document is not one line. **The client is the part
you cannot recall**, so the rollback plan has to assume old clients keep talking to the
server for weeks.

---

## Rule 1 — the server must stay compatible with the previous client

Any migration that lands with a release has to be readable by the app version *before* it.
Concretely, and in this order of preference:

1. **Add, never rename or drop.** A dropped column breaks the last release for every user
   who has not updated, and that is not a rollback, it is an outage for the people slowest
   to update.
2. **Widen before narrowing.** A new NOT NULL column needs a default, or the previous
   client's insert fails.
3. **Two releases for a rename.** Add the new name, write both, ship the client that
   reads the new one, then drop the old name a release later.

`supabase/migrations/` is forward-only — never edit a landed file (repo rule). So the undo
for a bad migration is a **new** migration, written and reviewed like any other. Budget
for that: the fastest possible database rollback is as slow as writing a correct
migration.

### The league migration, specifically

`20260813100000_create_leagues.sql` is add-only — three new tables, a view, a trigger and
their policies. It touches nothing an earlier client reads, so a client from before it is
completely unaffected: it does not know the tables exist and never queries them.

Its undo is therefore the easy kind, and worth writing down before it is needed:

```sql
-- the undo, as a NEW migration — never by editing the landed file
drop view if exists public.league_standings;
drop trigger if exists league_members_no_children on public.league_members;
drop function if exists public.league_member_is_not_a_child();
drop table if exists public.league_members;
drop table if exists public.league_opt_outs;
drop table if exists public.league_cohorts;
```

Nothing else references them, so the order above is the only constraint. **No user data is
lost that matters:** a cohort is derived — weekly XP is recomputed from `xp_ledger`, which
is the real record — so dropping these tables costs a week of standings and no progress.

The one thing to check before running it: whether any coins have been paid out from
`leaguePodium`. Those live in `coin_ledger` like every other award and are unaffected by
the drop, which is the point of ledgers.

## Rule 2 — the reward path is the thing to watch

XP, coins, mastery and streaks are server-authoritative (`record_lesson`, the mastery
trigger, `purchase_item`). That is what makes a server rollback *safe* — the client
renders optimistically and reconciles, so a reverted function produces a stale number and
not a wrong one.

It also means a bad reward migration is the highest-severity failure this product has: it
writes to a ledger. `xp_ledger` and `coin_ledger` are append-only by design, so a
mis-award cannot be edited away — it is corrected by a compensating entry, which is the
right shape for money-like data and the wrong shape for panic.

**If a reward bug ships:** stop the bleeding at the edge function (revert it), then write
the compensating migration. Do not attempt to `UPDATE` a ledger.

## Rule 3 — the queue means old clients replay into a new server

`packages/engines/src/sync` parks work rather than dropping it, and a client can replay a
lesson finished days earlier. So a rolled-back edge function will receive submissions
composed by a client version that expected the newer one. `submit-lesson` dedupes on a
client-generated idempotency key, which is what makes the replay safe — but the shape of
the payload still has to be accepted.

Practical consequence: **never change the submission payload shape and the grading logic
in the same release.**

And because that rule can only be obeyed going forward, reverting has to assume it was
once broken. `lessons.id` dedupes on replay, which stops a double award — it does **not**
make an old function able to parse a new payload. A revert that lands on a function which
rejects the payloads currently sitting in users' queues turns queued lessons into parked
ones, which is the failure this whole subsystem exists to prevent.

So, before redeploying a previous edge-function revision:

1. **Contract-test it against a payload the current client produces.** Take a real queued
   submission shape, send it to the candidate revision in staging, and confirm it is
   accepted rather than 4xx'd. This is a five-minute check that distinguishes a clean
   revert from an outage for everyone on a train.
2. **If it rejects them, do not revert blind.** Either keep a compatibility shim in front
   of the old revision that maps the new shape to the old one, or pause replay — the queue
   holds work rather than dropping it, so pausing is safe and losing it is not.
3. **Prefer a fix-forward** when neither is quick. A broken revert is worse than the bug
   it was meant to undo, because it fails for the users who were offline and are least
   able to tell you.

---

## The sequence, when something is wrong

1. **Confirm it is the release.** Crash rate and the `xp_reconciliation_failed` metric are
   the two signals that distinguish "our release" from "the internet". Both need the
   telemetry that does not exist yet — see the gap below.
2. **Revert the edge functions first.** It is the only reversible layer, it is fast, and it
   is where grading lives.
3. **Halt the rollout.** Staged rollout percentages exist in the plan
   (`docs/plan/build-order.md`), and as of 2026-08-09 there is a flag system to enforce
   them — `supabase/migrations/20260809090000_create_feature_flags.sql` and
   `apps/mobile/src/lib/featureFlags.ts`. Setting a flag's `enabled` to `false` (or its
   `rollout_percent` to `0`) in the `feature_flags` table reaches a foregrounded,
   online device within one poll interval (5 minutes) — no store console, no new
   binary. Pulling the release in the store consoles is still the right move for
   anything the flag system does not cover, which today is everything already built
   before this system existed and never wrapped in a flag.
4. **Decide on the database.** If a migration is implicated, write the compensating
   migration. If it is not, change nothing — a database change made in a hurry during an
   incident is how a recoverable release becomes an unrecoverable one.
5. **Ship the fix forward.** Because the binary cannot be recalled, the user-visible
   resolution is always a new version.

---

## What this plan cannot do yet, and who it blocks

One dependency named in the release checklist is still not built; the other resolved
2026-08-09:

- ~~**No feature flags.**~~ **Built, 2026-08-09** — see step 3 above. A release that
  wraps its risky surface in a flag can be halted in minutes; a release built without
  one is still 100 % on arrival the moment it ships, because the flag system can only
  gate code that was written to check it. New risky work should default to shipping
  behind a flag from now on, not because the checklist asks but because "we could not
  halt this" is a choice made at write time, not at incident time.
- **No telemetry.** No Sentry DSN, no analytics backend, 18 of 28 events wired. Sentry
  was in fact built and then removed on 2026-08-09 to hold the 4 MiB bundle budget (see
  `docs/plan/cowork-handoff.md` §6) — so this is now "no telemetry, by a decision" where
  it was previously "no telemetry, not yet built". Step 1 is currently "wait for a user
  to complain", which is not a detection strategy.

Neither is a reason not to have this plan. Both are reasons the first release should be
small.

## The person

A rollback needs someone empowered to decide, available for 48 hours after each release.

**Isac Molin (isacmolin@gmail.com) — named 2026-08-09.** He confirmed this directly
(not inferred from the repo, which is the reason this section sat unfilled — see
`docs/plan/cowork-handoff.md` §6). Re-confirm availability before each release; a name
here is a default reachable person, not a standing guarantee for every release window.

He is also the owner of record for every "built but unverified" row in
`docs/plan/definition-of-done-status.md` and every outstanding waiver in this plan set,
until a specific item is reassigned in writing.
