# Audit 7: Convex and inexpensive backend alternatives

13 September 2026. Prices are public USD list prices checked on this date; taxes, exchange rates and external services are excluded. No service was provisioned, benchmarked or migrated. Supabase is the current migration source and is excluded as a destination, as requested.

## Recommendation

**Start with a bounded Convex proof, then choose on measured results.** It fits the existing TypeScript domain engines and can put state reads, lesson grading and resulting writes into one atomic mutation. That addresses a real architectural weakness in the current endpoint, whose SQL lock starts after important state was read. This benefit requires moving the whole decision into the mutation; changing database vendors alone fixes nothing. Convex mutations provide transactional execution and conflict retries. [Mutation documentation](https://docs.convex.dev/functions/mutation-functions)

Keep local content, local memory and a durable account-scoped outbox. Convex's normal client handles network interruptions, but its own sync page says complete offline sync is still being developed. Optimistic updates are temporary client query changes, not a durable lesson log. [Convex sync](https://www.convex.dev/sync), [optimistic updates](https://docs.convex.dev/client/react/optimistic-updates)

Authentication is the largest early unknown. Convex supports external JWT/OIDC identity, while Convex Auth's React Native support is documented as beta. Prove guest creation, guest-to-email linking without data loss, returning-account login, refresh after a long offline period, deep links, deletion and two-device recovery before committing. A mature external auth provider may be preferable, but its own limits and price must be included. [Authentication](https://docs.convex.dev/auth), [React Native client](https://docs.convex.dev/client/react-native)

## Five candidates

| Candidate | Current entry point | WorldQuest fit | Main tradeoff | Recommendation |
|---|---|---|---|---|
| Convex | Free hard-capped tier; Starter pay-as-you-go has $0 base; Professional $25/developer/month | TypeScript functions, reactive progress and transactional grading | Auth choice, offline outbox still yours, document model and usage billing | First proof candidate |
| Cloudflare Workers + D1 | Workers free; paid starts $5/month; D1 included quotas | Low floor, TypeScript API, SQL-shaped domain | Build auth integration, authorization, synchronization and jobs; no PostgreSQL migration drop-in | Cost-focused alternative |
| Firebase | Spark no-cost quotas; Blaze usage billing | Mature client ecosystem and document data model | Read/write fan-out, security-rule and server design, provider coupling | Strong alternative if mobile/auth integration wins the proof |
| Appwrite Cloud | Free; Pro starts $25/month | More integrated auth/database/functions product | Free projects pause after one inactive week; test transactions/offline needs and hosting limits | Worth a small comparison if auth assembly dominates |
| PocketBase | Open-source, self-hosted | Compact backend for a small deployment | You own hosting, backups, restores, uptime, patching and capacity | Prototype/small operation if those duties are deliberate |

Sources: [Convex pricing](https://www.convex.dev/pricing), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Firebase pricing](https://firebase.google.com/pricing), [Appwrite pricing](https://appwrite.io/pricing), [PocketBase FAQ](https://pocketbase.io/faq/).

Cloudflare's paid Workers allowance includes 10 million requests and 30 million CPU milliseconds per month; request and CPU overages are separate. D1 free includes 5 million rows read and 100,000 written daily, with 5 GB storage; paid includes 25 billion reads and 50 million writes monthly and 5 GB. Index writes and unindexed scans matter. D1 is not PostgreSQL: existing PL/pgSQL functions, triggers and RLS need explicit redesign in the API/database capabilities selected. [Workers rates](https://developers.cloudflare.com/workers/platform/pricing/), [D1 rates](https://developers.cloudflare.com/d1/platform/pricing/)

Firestore's standard no-cost allowances include 1 GiB stored, 50,000 document reads and 20,000 writes daily. Deploying Cloud Functions uses Blaze billing, with a no-charge invocation allowance but additional compute/network dimensions. Per-answer document writes and reactive reads make a lesson workload very different from a simple profile app. Appwrite's free plan currently includes 75,000 MAU, 2 GB storage, 5 GB bandwidth and 750,000 executions, alongside resource-count limits. Neither advertised MAU nor executions guarantees WorldQuest fits the other quotas. [Firebase rates](https://firebase.google.com/pricing), [Appwrite rates](https://appwrite.io/pricing)

PocketBase software being free does not make a backed-up production server free. Do not assume high availability, automatic failover or a managed incident team from a single hosted binary. This is an operational judgment, not a claim that the project cannot be used in production. [PocketBase](https://pocketbase.io/)

## Convex cost model

Relevant US Starter monthly included usage: 1 million function calls, 0.5 GB database storage, 1 GB database I/O and 1 GB network egress. Overage rates are $2.20/million calls, $0.22/GB storage, $0.22/GB I/O and $0.132/GB egress. Actions, files and search have separate allowances/rates. Professional includes 25 million calls, 50 GB database storage, 50 GB I/O and 50 GB egress; corresponding overages are $2/million, $0.20/GB, $0.20/GB and $0.12/GB, plus its developer seat charge. [Convex price table](https://www.convex.dev/pricing)

**The following is an illustrative workload, not a benchmark or a bill forecast.** Assumptions: 12 active days per monthly active user; one lesson per active day; 15 reviewed answers per lesson; 20 billable function executions per active session including refreshes; 100 KB database I/O and 20 KB network egress per session. Storage assumes 1.5 KB effective indexed footprint per review plus 100 KB of other persistent state per user. Use decimal KB/GB here. Actual index footprint, query invalidations and request payloads must be measured.

| First-month workload | 1,000 MAU | 10,000 MAU | 100,000 MAU |
|---|---:|---:|---:|
| Lessons | 12,000 | 120,000 | 1,200,000 |
| Answer reviews | 180,000 | 1,800,000 | 18,000,000 |
| Function executions | 240,000 | 2,400,000 | 24,000,000 |
| Database I/O | 1.2 GB | 12 GB | 120 GB |
| Network egress | 0.24 GB | 2.4 GB | 24 GB |
| Stored database | 0.37 GB | 3.7 GB | 37 GB |
| Starter: modeled US dimensions only | **$0.04/month** | **$6.39/month** | **$87.85/month** |
| Starter: EU variable-rate illustration | **$0.06/month** | **$8.31/month** | **$114.20/month** |

US formula: `max(callsMillions - 1, 0) * 2.20 + max(storageGB - 0.5, 0) * 0.22 + max(ioGB - 1, 0) * 0.22 + max(egressGB - 1, 0) * 0.132`.

EU variable rates are documented as 1.3 times US rates. The 1,000-user example already exceeds free database I/O, despite staying under the call allowance. Free and Starter are distinct: free reaches hard limits; pay-as-you-go can bill overages. Quotas are shared across deployments on a team. Function billing includes more than user button presses, including subscriptions and scheduled work. [Limits and usage](https://docs.convex.dev/production/state/limits)

At 100,000 MAU, the same modeled US dimensions on Professional with one developer would total about **$39/month**: $25 seat plus $14 I/O. That illustrates why comparing plan allowances matters; it does not establish that this traffic fits the plan's concurrency or actual usage. At 12 months with constant users and retained reviews, storage in this model grows to 3.34 GB per 1,000 users. Tenfold subscription fan-out could dominate these estimates.

Excluded: auth provider, email, action compute, content downloads/file storage, search, telemetry, backup/export tooling, staging traffic, abuse, taxes, Apple/Google fees and billing provider. Plan a provisional $25–50/month small-beta operations allowance, with measured usage alerts; this is an internal budget hypothesis, not a vendor quote or a ceiling. Avoid promising a fixed number of free users.

## Proposed implementation

Keep `packages/engines` pure and backend-neutral. Introduce a domain-facing repository interface for session identity, memory/progress, lesson submission, preferences, wallet/shop, quests, achievements and entitlements. Implement a Convex adapter behind that interface. Preserve existing stable content IDs and lesson IDs; do not leak generated database IDs into content packs or engine algorithms.

| Data | Suggested keys / indexes | Invariant |
|---|---|---|
| Users and identity links | Stable application user ID; unique provider + subject | One canonical owner; linking is authenticated and conflict-aware |
| User facts | Owner + fact ID; owner + due time | One canonical scheduling state per fact |
| Lesson receipts | Owner + client lesson ID | Replays return the original result without paying twice |
| Review events | Owner + fact + event order; owner + lesson | Versioned event identity and defined replay/retention policy |
| Daily progress / streak | Owner + server-approved day | Timezone/travel policy cannot multiply daily rewards |
| Wallet ledger | Owner + operation ID; owner + effective time | Immutable financial/economy operations, atomic balance change |
| Quest instances / claims | Owner + day + canonical slot | Only approved targets; one payout per claim |
| Achievements / grants | Owner + achievement ID | Progress monotonic where specified; one milestone payout |
| Entitlements / provider events | Provider + event ID; owner + product | Verified events, explicit ordering and reconciliation |
| Content manifests | Version + pack ID | Clients pin content version; old queued lessons remain interpretable |
| Deletion jobs | Owner + job status | Idempotent erasure with bounded batches and verified completion |

These are proposed application invariants, not a claim that declaring a Convex index automatically creates a SQL UNIQUE constraint. Enforce uniqueness with indexed lookups and writes inside the same transaction, including conflict tests.

`submitLesson` should authenticate, validate bounded payloads and known content/template IDs, check the receipt, read current memory/reward state, grade through the pure engines, validate canonical quests, and persist all projections plus receipt in one mutation. Never trust client XP, balance, grade, child flag or entitlement. Reuse a receipt on retry. Keep external email, store verification and analytics outside retriable transactional code; enqueue idempotent follow-up work after committing.

Define out-of-order behavior before implementation. An offline lesson from yesterday must not overwrite today's newer fact state. Either replay an ordered fact event history with bounded checkpoints or apply a documented server-time policy with clear learner implications. A simple last-write-wins document is insufficient. The local UI can show provisional feedback while clearly distinguishing synced progress; it must reconcile returned authoritative memory, quests and wallet.

Use one local outbox per stable account ID and environment. Persist before acknowledging completion. Drain on reconnect, foreground and scheduled retry; bounded exponential backoff needs a wake-up. Account transition must cancel requests, pause drain, dispose subscriptions, clear query state and detach the old outbox before attaching the new account. Never send an ownerless queue under whichever identity is currently logged in.

Do not store a user's lifetime reviews in one document or subscribe to every user's progress. Convex documents have size limits and transaction execution/concurrency limits; use indexed bounded reads, pagination and batch jobs. Current limits include a 1 MiB document maximum and a one-second user-code runtime for ordinary queries/mutations. Confirm plan concurrency against a measured burst, not monthly averages. [Convex limits](https://docs.convex.dev/production/state/limits)

## Migration and rollback

The repository contains 33 SQL migrations plus auth hooks, RLS, grading, rewards, subscription handlers and scheduled responsibilities. A Convex migration is a rewrite of these boundaries, not replacing a URL. Estimate only after inventorying actual hosted schema drift and whether real user data exists; this audit did not access the hosted service.

1. Build an isolated development proof with synthetic accounts and the existing pure engines. Demonstrate identity lifecycle, one full lesson transaction, offline/relaunch replay and entitlements without moving users.
2. Add contract tests shared by current and candidate adapters. Compare canonical memory, XP, wallet and receipts across deterministic histories, concurrent submissions and intentional failures.
3. Export the actual source schema/data securely, map auth subjects to stable app IDs, preserve review/content/receipt IDs, and import in dependency order. Reconcile per-user counts and balances plus aggregate checksums. Convex import/export is useful, but it is not a PostgreSQL dump restore or an auth migration. [Import/export](https://docs.convex.dev/database/import-export)
4. Test deletion, restore from backup, quota exhaustion, rejected tokens, device time skew, abuse limits and interrupted imports. Load-test realistic subscriptions and report calls, I/O, storage and latency per completed lesson.
5. Choose one authoritative writer per account. Use a write fence and explicit cutover marker. If old offline clients cannot safely forward to the new authority, retain a compatibility endpoint or require a deliberate upgrade with outbox migration. Never silently drop pending lessons.
6. Start with internal/beta accounts. Verify identity, counts, balances and entitlement state after cutover. Keep a tested rollback journal: after new writes, rollback requires reverse replay/reconciliation, not merely changing an environment variable. Decommission the source only after the recovery window and verified deletion/retention obligations.

## Action list

| ID | Priority / owner / effort | Action and completion evidence |
|---|---|---|
| B01 | P1 / Backend / M | Inventory current tables, RPCs, functions, auth hooks, jobs and hosted drift; map every responsibility to a destination. |
| B02 | P0 / Mobile + Backend / L | Prove guest/link/login/logout/recovery/deletion on real Expo native builds with the chosen auth provider. |
| B03 | P1 / Engineering / M | Extract backend-neutral ports; engines compile without backend SDK imports. |
| B04 | P0 / Backend / L | Implement transactional lesson grading, receipt idempotency and reward invariants; conflicting lessons preserve both results. |
| B05 | P0 / Backend / M | Enforce canonical quest slots, eligibility and payout uniqueness; the eight-slot probe is rejected. |
| B06 | P0 / Mobile + Backend / L | Design per-fact history hydration and offline event ordering; next-day reviews and multi-device replay are correct. |
| B07 | P0 / Mobile / L | Implement account-scoped durable outbox and transition barrier; queued work cannot cross users. |
| B08 | P1 / Backend / M | Define tables, compound indexes, pagination and projections; representative queries avoid full-history scans. |
| B09 | P0 / Backend / M | Centralize ownership checks on every public query/mutation; cross-user reads and writes fail. |
| B10 | P0 / Backend + Privacy / M | Enforce child policy and minimize age data on the server; client flags cannot upgrade permissions. |
| B11 | P0 / Backend / L | Integrate one entitlement authority with verified, deduplicated events and reconciliation. |
| B12 | P1 / Backend / M | Add payload limits, abuse controls and per-user work budgets; replay storms cannot exhaust ordinary users' service. |
| B13 | P1 / Operations / M | Select region and inspect processing/retention terms; document subprocessors and auth/email costs. |
| B14 | P1 / Backend + QA / L | Measure burst concurrency, p95 latency and metered dimensions per lesson with realistic subscriptions. |
| B15 | P1 / Operations / M | Configure usage alerts and quota-exhaustion behavior; verify which controls actually stop spend. |
| B16 | P0 / Operations / L | Build and test export, restore and erasure procedures with counts/checksums and access controls. |
| B17 | P1 / Backend / L | Write reversible identity/data migration and reconciliation tooling; interrupted import resumes safely. |
| B18 | P0 / Release + Backend / L | Rehearse authoritative cutover, old-client compatibility and post-write rollback before moving live accounts. |
| B19 | P1 / Product + Engineering / M | Compare Convex proof with a minimal Workers/D1 alternative if auth or measured cost fails the gate; record an ADR. |
| B20 | P1 / Operations / M | Decommission old services only after reconciled migration, backup recovery rehearsal and retention decision. |

P0 migration items apply before moving real users to the candidate, not as a request to rebuild everything immediately. Effort scale: [audit 2](02-learning-content.md).
