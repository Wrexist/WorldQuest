# Cloudflare D1: implementation audit and next steps

Decision update, 13 September 2026, following the owner's explicit D1 selection.
The eight original audits remain historical findings. This update uses their
existing action IDs and does not add duplicate tasks to the 148-action checklist.

**D1 is now the selected destination and a real development database exists. The
mobile app has not been migrated yet.** The next release-critical step is B02:
complete native identity and recovery before replacing the active app adapter.

## What is implemented

| Area | Evidence | Limit |
|---|---|---|
| Destination | ADR 0013; `packages/backend` now uses Workers/D1 | Legacy app adapter still active |
| Hosted database | `worldquest-development`, EU jurisdiction; eight app tables and migration record verified in Chrome | Zero accounts; no connected app traffic |
| Local execution | Pinned Wrangler/Miniflare; real workerd and SQLite integration tests | Local performance is not hosted performance |
| Ownership | Worker derives account from a hashed, expiring bearer session | Email linking/recovery and native credential handling remain open |
| Rewards | Shared pure grader; receipt, ledger, review history, memory and account revision in one batch | Full quest/streak/achievement/entitlement contract not ported |
| Concurrency | Duplicate requests return one receipt; different lessons preserve both reviews and one daily bonus | Arrival-order/UTC proof, not late offline replay |
| Failure handling | A failure after the ledger write rolls back everything; retry succeeds | Remote overload and quota behavior need connected testing |
| Revocation | Logout rejects the old token; revocation between grading and commit prevents payout | Full account erasure remains open |
| Input limits | Strict answer shape, duplicate-slot rejection, 16 KiB stream cap | Public rate limiting is not implemented; API stays disabled |
| Deployment | Development Worker deployed; active version and D1 binding verified through Cloudflare API | Public routes and API disabled; native and hosted runtime acceptance remain open |

The current proof has ten passing integration tests. It contains no public fixture
or ticket-seeding endpoint. The eight-slot duplicate probe is rejected; accepting
that probe would permit unearned rewards. No Cloudflare credentials are in the app.

## Ordered remaining work

1. **Identity and recovery — B02, S08, B10.** Implement native guest, link, login,
   recovery, logout and deletion flows. Replace the app's hardcoded MMKV credential
   key with protected native credential storage. Preserve one stable owner across
   guest linking and later sign-in. Unknown/protected users must not gain permission
   by submitting a client role. Test expired sessions, replayed verification codes,
   concurrent linking and account switching on both native platforms. Better Auth's
   documented Expo and SQLite/Drizzle integrations are a candidate to evaluate;
   neither is currently installed or accepted. [Expo integration](https://better-auth.com/docs/integrations/expo),
   [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle).
2. **Complete the authoritative contract — B04, B05, B08, B09, E15, S01.** Port all
   eight source RPC responsibilities and the two edge functions. Issue canonical,
   versioned tickets from trusted content; clients submit answers, never answer
   keys. Add quest eligibility/payout uniqueness, streaks, freezes, achievements,
   inventory and entitlement projections. Every writer of learning state must
   participate in the same account-revision protocol. Add owner-isolation tests
   to each new route; D1 has no PostgreSQL RLS fallback.
3. **Connect learning history — B06, B07.** Finish the D1 repository adapter,
   bounded per-fact hydration, explicit local-day policy and deterministic late
   review ordering. Reuse the completed account-scoped outbox and transition
   barrier. Test two devices, airplane mode, app termination, duplicate delivery,
   logout with queued work, guest adoption and reinstallation. Never acknowledge a
   queued lesson before its durable receipt exists.
4. **Operational and privacy controls — B12 through B16.** Add request and work
   budgets, session cleanup, erasure jobs, bounded export, retention and restore
   procedures. Verify deletion also removes auth children and projections; a
   tombstone alone is not complete erasure. Rehearse restoration into a new
   database with counts/checksums before calling backup recovery ready. Review
   required regional processing and email-provider arrangements for the launch.
5. **Measure the service — B14, B15.** Run representative 5/10/20-item lessons,
   duplicate storms, different-lesson conflicts and dashboard/history queries.
   Record p50/p95/p99, CPU milliseconds, rows read/written, storage growth and
   failures. Test quota rejection as an offline/retry state. The SQL statement
   count is not a row-write count, a CPU measurement or a supported-user forecast.
6. **Cut over the development app — B17, B18, then B20.** There are no live users,
   so use a deliberate development-data reset and a single active destination.
   Verify the connected English/Swedish onboarding-to-review journey, restart,
   account recovery and two-device replay. Keep source services until the new
   contract and recovery procedure pass, then decommission them deliberately.

## Cost and scaling audit

Published Free limits are 5 million D1 rows read/day, 100,000 rows written/day and
5 GB across the account. A Free database is limited to 500 MB. Index maintenance
adds writes, and existing Cloudflare projects share account allowances. Free
quota exhaustion rejects database operations rather than silently increasing
capacity. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

Workers has a separate Free allowance of 100,000 requests/day and 10 ms CPU per
invocation. The published Paid entry point is $5/month plus applicable overages;
no upgrade was made. Email delivery and other added services need their own
budget. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

The maximum-size lesson test uses 11 D1 statements plus one authentication query.
Four bounded attempts stay below the published 50-query Free invocation limit.
Bulk review/memory statements prevent question count from exhausting that limit.
That does not prove the 10 ms CPU budget: hosted grading must still be profiled.

Use this budget calculation only after collecting representative hosted metrics:

`daily lesson write capacity = (100,000 - other daily writes) / measured writes per lesson`

Take the minimum of read, write, storage, Worker request, CPU and measured latency
constraints. Include retries, index writes, sessions, cleanup, quests and account
exports. Do not convert the free allowance into an MAU promise.

Each D1 database processes queries on one thread. Keep hot queries indexed,
history paginated and transactions short; measure before adding sharding or other
Cloudflare products. A D1 batch rolls back the entire sequence when a statement
fails, which is why the revision guard can protect the pure grader's snapshot.
[Concurrency limits](https://developers.cloudflare.com/d1/platform/limits/),
[Batch semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/).

EU database jurisdiction limits where this database runs/stores data. It does not
establish that the entire Worker/auth/email system stays in the EU. Keep that
distinction in operational and privacy documentation.
[Data location](https://developers.cloudflare.com/d1/configuration/data-location/).

Full execution order: [Phase 2 checklist](../../plan/execution-plan.md).
Evidence: [Phase 2 work log](../../plan/phase-2-verification.md).
