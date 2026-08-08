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

---

## The sequence, when something is wrong

1. **Confirm it is the release.** Crash rate and the `xp_reconciliation_failed` metric are
   the two signals that distinguish "our release" from "the internet". Both need the
   telemetry that does not exist yet — see the gap below.
2. **Revert the edge functions first.** It is the only reversible layer, it is fast, and it
   is where grading lives.
3. **Halt the rollout.** Staged rollout percentages exist in the plan
   (`docs/plan/build-order.md`) and **the flag system to enforce them does not exist yet**
   — see the gap below. Today "halt" means pulling the release in the store consoles.
4. **Decide on the database.** If a migration is implicated, write the compensating
   migration. If it is not, change nothing — a database change made in a hurry during an
   incident is how a recoverable release becomes an unrecoverable one.
5. **Ship the fix forward.** Because the binary cannot be recalled, the user-visible
   resolution is always a new version.

---

## What this plan cannot do yet, and who it blocks

Two dependencies are named in the release checklist and are not built. This plan is
written assuming they will be, and says plainly what it means until then:

- **No feature flags.** There is no way to stage a rollout or to turn a feature off
  without shipping a new binary. Until there is, every release is 100 % on arrival, and
  step 3 above degrades to "pull it from the store" — which takes hours and does not help
  users who already updated.
- **No telemetry.** No Sentry DSN, no analytics backend, 18 of 28 events wired. Step 1 is
  currently "wait for a user to complain", which is not a detection strategy.

Neither is a reason not to have this plan. Both are reasons the first release should be
small.

## The person

A rollback needs someone empowered to decide, available for 48 hours after each release.
**This is not assigned.** It is a name, not a task, and it cannot be filled in by anyone
reading the repo — see `docs/plan/cowork-handoff.md`.
