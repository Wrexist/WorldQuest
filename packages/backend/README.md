# WorldQuest Cloudflare Workers + D1

Selected destination: [ADR 0013](../../docs/adr/0013-cloudflare-d1-backend.md).
This package is a development acceptance slice; the mobile adapter is not switched yet.

From the repository root:

```sh
pnpm install
pnpm --filter @worldquest/backend db:local
pnpm --filter @worldquest/backend test
pnpm --filter @worldquest/backend build
pnpm --filter @worldquest/backend dev
```

The test suite bundles the actual Worker and uses Miniflare/workerd with real local
D1 SQLite. It creates fresh synthetic guests and seeds server-held tickets directly
in the test database. No fixture route or admin impersonation ships in the Worker.
Wrangler 4.131.1 currently depends on Miniflare 5.20260911.0-alpha; the test runtime
is pinned to that same version and uses its exported v4-options converter.

The registered database is `worldquest-development`, ID
`4354bdf7-8e07-46d9-93d7-a0700f2f1096`, created with EU jurisdiction.
Account/database IDs are configuration, not credentials. Local state is ignored.
Use Wrangler login for deployment credentials; never put a token in this repository
or the app. Remote migrations and deployment require an authenticated CLI.

The development Worker `worldquest-development-api` was deployed on 2026-09-13
with version `dc8bd22b-f2ec-4ab1-9cb7-6915dd20bb87`. Cloudflare API readback
confirmed the D1 binding, `API_ENABLED=false`, and disabled workers.dev/preview
URLs. Remote migration inspection found no pending migrations at that deployment;
the new identity migrations 0002–0005 have not been applied remotely. This verifies
deployment configuration; connected native behavior and hosted load are still open.
Use `pnpm --filter @worldquest/backend run deploy` (the `run` is required because
pnpm also has a built-in deploy command). Wrangler OAuth needs
`workers_scripts:write` in addition to the existing account/user read, Workers
write and D1 write permissions. Credentials use encrypted storage with a key in
Windows Credential Manager.

The checked-in configuration disables workers.dev, preview URLs, and API access.
For isolated local API development only, pass `--var API_ENABLED:true` to Wrangler.
Do not enable public API access before recovery, abuse controls, child policy and
native acceptance pass. No paid plan is required for these local checks.

Implemented: restricted guest sessions with hashed tokens, account-derived reads,
logout revocation, strict 16 KiB request limits, server grading, idempotent receipts,
atomic reward/review/memory writes and bounded optimistic concurrency retries.

Local-day rules (migration 0007, S14): each account stores a validated IANA zone
(`POST /v1/account/time-zone`, UTC fallback on read). `accounts.day` is the local
date of the latest counted lesson and only moves forward, so DST days of 23/25
hours and time-zone moves never pay a second first-lesson bonus. The streak is
decided by the engines' `applyActivity` inside the same revision-guarded batch,
with milestone XP/coins folded into that lesson's ledger row; receipts carry
`day` and `streak`. The Worker takes an injectable clock (`createWorker(mail,
clock)`, `submitLesson(..., clock)`) and `proof.test.ts` drives it across the
October 2026 Stockholm DST change.

Daily quests (migration 0008, B05/S04): the Worker composes each day's quest
itself with the engines' `generateDailyQuest`, seeded by (account, local day),
and stores it on first sight (`GET /v1/quest/today` or the day's first lesson).
Submissions carry answers only, so there is no slot for a client to duplicate.
Progress is derived from the distinct quest facts answered correctly that day
plus slot five's goal; task XP, the all-five bonus and its coins are paid in the
lesson's own ledger row, once.

Coin spending (migration 0009, S06/A04): `POST /v1/shop/freeze`,
`/v1/streak/repair`, `/v1/lessons/continue` and `/v1/shop/item` take a client
request id, are decided by the engines' streak-recovery and shop rules, and
record each spend once in `spends` plus a negative `ledger` row, under the same
revision guard as lessons. Replays return the stored result (a continue replay
reports `already_paid`); refusals write nothing. `GET /v1/progress` projects the
app's `Progress` shape, showing a lapsed streak as zero and deriving the repair
window at read time, so no nightly job is needed. Hearts reset per lesson and
are not stored. Achievements and entitlements are not yet server-side here.

Protected native credential storage is accepted under [ADR 0014](../../docs/adr/0014-native-credential-storage.md); it does not provide D1 identity by itself.

The local account gateway now uses sessionless Better Auth email verification and
separate stable progress owners ([ADR 0015](../../docs/adr/0015-d1-email-identity.md)).
It supports age-band declaration, guest linking, existing-account login and fresh
proof for linked deletion. Codes are challenge-scoped HMACs; WorldQuest sessions
remain hashed bearer tokens. Provider HTTP/session APIs are not exposed.
`AUTH_SECRET` must contain at least 32 characters. Real mail delivery is deliberately
unconfigured; the default mail port returns `EMAIL_UNAVAILABLE`. Tests inject an
isolated synthetic mailbox and apply every migration to fresh real local D1.

The portable client in `@worldquest/api` uses one awaited protected session/challenge
envelope. `scripts/native-accounts` exercises it with the production credential
vault in separate native proof apps. The loopback HTTP exceptions and synthetic
fixture server are test-only; neither belongs in a store build or hosted Worker.

Deletion now atomically stores a 24-hour acknowledgment bound to the deleting
session hash and operation. Replays can confirm erasure after a lost response;
the receipt cannot authenticate. It retains no owner or email. An hourly scheduled
handler removes up to 1,000 expired receipts per run; hosted cleanup/backlog
monitoring and backup retention still require acceptance before launch.

Session rotation follows [ADR 0016](../../docs/adr/0016-recoverable-session-renewal.md):
30-day sessions renew in their last seven days. The client saves both credentials
before an atomic swap; exact replay acknowledges a lost response, and either
bearer can revoke its device family. Pending email verification keeps the same
owner. Expired credentials are retained locally for an explicit recovery choice.
Migration 0005 and the expanded hourly cleanup are not deployed.

Native synthetic link/login/reinstall/deletion and interrupted-renewal proofs
pass on both platforms, including repeated old-client logout after recovery.
See [the retained native evidence](../../docs/plan/phase-2-evidence/accounts/renewal/README.md).
Not yet accepted: production account screens and real email delivery,
production ticket issuance, timezone/offline replay, complete progress hydration,
quests/streaks/achievements/purchases, export/restore/erasure, abuse budgets, and the
mobile repository adapter. Keep the API disabled until those gates are met.

The [account screens](../../docs/plan/d1-account-screens.md) now have rendered local
D1/browser evidence and a passing Android UI journey; final iOS UI acceptance is
pending. [Issued lessons, the durable queue and bounded review history](../../docs/plan/d1-learning-sync.md)
are implemented locally under migration 0006. Canonical quests, the complete reward
economy, offline date policy and the main-app repository cutover remain open.
