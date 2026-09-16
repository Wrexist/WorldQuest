# D1 lesson and sync implementation

The D1 app adapter remains disabled. This batch extends the account screens with
an account-bound learning transport and durable lesson preparation/submission.
It does not yet establish the complete reward economy or main-app cutover.

## Implemented

- `/v1/lessons/prepare` composes actual questions from the validated geography packs
  and the owner's saved memory. It accepts locale, count and screen-reader preference;
  clients cannot supply facts, answer keys or reward values. Presentation and request
  preferences are immutable per owner/lesson ID. Concurrent retries return the stored
  winner. At most 20 unsubmitted tickets may exist per owner.
- Migration 0006 preserves each ticket's request, presentation and issue time and
  indexes the immutable review stream by owner/revision/slot. It is local only.
- The D1 learning client verifies the owner before and after asynchronous work and
  refreshes only that owner's session. Network questions and memory projections are
  parsed before being exposed to the app.
- The durable queue persists a preparation request before calling the server. A
  restart can resume the same request. Prepared questions are cached for offline
  use; completing one atomically exchanges its cached presentation for submitted
  answers. It persists a completion before acknowledging it to the caller.
- Sync retries unchanged IDs/answers. Receipt persistence and queue removal share
  one atomic value. Network failures, lost responses and failed local writes retain
  work for exact retry. A scope change invalidates old callbacks. Malformed queues
  are preserved and reported, not silently deleted.
- A flush processes at most 20 entries; stored queues cap at 200 submissions and
  100 recent receipts. The host must schedule further wake-ups when work remains.
- `/v1/learning/state` reads wallet/revision and up to 1,000 fact memories in one
  snapshot. It explicitly refuses an oversized projection instead of silently
  truncating it. The current content has 350 facts.
- `/v1/learning/history` returns up to 100 immutable review events per page, ordered
  by accepted revision and slot. A fixed upper revision makes later submissions
  irrelevant to an in-progress history read.

## Evidence and limits

Tests cover concurrent ticket issuance, changed request rejection, cross-owner
submission denial, outstanding-ticket limits and capacity after submission.
The actual portable client and durable queue run against real local workerd/D1:
losing a reward response and retrying leaves the ledger unchanged. Replaying 120
reviews from two history pages reproduces the saved fact memory exactly. Separate
unit tests cover storage failures, malformed queues, late responses after switching,
concurrent flushes and restart during preparation.

The existing grader still assigns server-arrival time and UTC reward day. This is
deterministic for replay of the accepted revision stream; it is **not** evidence of
correct offline completion-day streaks or arrival-independent two-device scheduling.
Those acceptance cases remain open. No new reward values or scheduling weights
have been introduced.

## Required before enabling the main app

1. Canonical daily-quest assignment and reward claims; complete streak, achievement,
   inventory and entitlement projections, including concurrency/forgery tests.
2. Final offline date/timezone rules and two-device acceptance. Queue wake-up,
   ticket refill, expired-session recovery and query-cache hydration in the actual
   mobile learning lifecycle, with the real account-host callbacks.
3. Abandoned-ticket recovery/cleanup, public abuse limits, operational monitoring,
   export/restore and measured hosted capacity. Twenty tickets is a per-owner bound,
   not a global anti-abuse control.
4. Native main-app learning journeys and public email delivery, followed by the
   deliberate development reset and D1 cutover.

The legacy app imports `@worldquest/api`; D1 migration code uses the explicit
`@worldquest/api/d1-auth` and `/d1-learning` entry points. This avoids including
unused D1 runtime code in the legacy app's startup bundle. Local native bundles are
4.59 MB on each platform under the unchanged 4.6 MB gate, with little spare capacity.
