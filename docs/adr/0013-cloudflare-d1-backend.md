# 0013: Cloudflare D1 and Workers replace the Convex candidate

Date: 2026-09-13. Status: accepted destination; implementation acceptance remains gated.

The owner explicitly selected Cloudflare D1 instead of Convex. There are no real
users or production progress to migrate. Worldwide English/Swedish launch remains
the product scope. This supersedes the destination in ADR 0012; backend-neutral
ports and account-scoped mobile storage remain useful.

Use D1 SQLite for persistence and a TypeScript Worker for the authenticated API.
Reuse the pure grading engine. Never put Cloudflare credentials in the app. D1
does not supply PostgreSQL RLS or application authentication: ownership checks,
sessions, child policy and abuse controls belong at the Worker boundary.

The first implementation is a development acceptance slice. It uses opaque random
sessions, hashed at rest, and server-issued lesson tickets. Transactions use a D1
batch with an optimistic account-revision guard that aborts the entire batch on
conflict. A retry re-reads and re-grades, preserving both concurrent lessons. Receipt,
ledger, reviews, memory and account totals commit together. Public API access stays
disabled until the wider authentication and mobile acceptance gates pass.

Create a separate EU-jurisdiction development database. This is a database location
restriction, not a claim that every Worker request or subprocessor stays in the EU.
Do not upgrade the account plan. Keep historical Supabase source until the full
mobile adapter is accepted; it is not the destination. The superseded Convex
prototype is recoverable from Git history; its unfinished auth experiment is local
archive material, not an active dependency.

Current published allowances: D1 Free includes 5 million rows read/day, 100,000 rows
written/day and 5 GB account storage (500 MB per database). Free quota exhaustion rejects requests; it
does not silently provide paid capacity. Index maintenance also consumes writes.
Workers has a separate request/CPU allowance. Measure real lesson costs and load
before forecasting users; these allowances are not an unlimited production promise.

Sources checked 2026-09-13:
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/workers/platform/pricing/

Still required before app cutover: email/account recovery and native secure storage,
canonical ticket issuance, complete progress hydration and offline ordering, all
repository operations, child eligibility, bounded export/erasure, remote restore
rehearsal, abuse controls, cost measurements and connected native journeys.
