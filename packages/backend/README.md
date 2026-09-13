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
URLs. Remote migration inspection found no pending migrations. This verifies
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

Not yet accepted: native auth and secure credential storage, email linking/recovery,
production ticket issuance, timezone/offline replay, complete progress hydration,
quests/streaks/achievements/purchases, export/restore/erasure, abuse budgets, and the
mobile repository adapter. Keep the API disabled until those gates are met.
