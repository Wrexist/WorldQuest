# ADR 0003 — Supabase as the backend

**Status:** Accepted **Date:** 2026-07-31

## Context

We need auth (including anonymous and social), a relational database with per-user
authorisation across eight roles, server-side logic for authoritative rewards, file
storage, and EU data residency for child privacy — run by a small team with no
dedicated infrastructure person.

## Decision

**Supabase**: Postgres + Row-Level Security + Auth + Edge Functions (Deno) + Storage,
EU region.

## Alternatives considered

| Option | Why not |
|---|---|
| **Firebase** | Excellent DX, but the document model fits our relational data badly (ledgers, leagues, orgs), security rules are less expressive than RLS for eight roles, and EU residency plus GDPR posture is more work. |
| **Custom backend (Node/Postgres on a PaaS)** | Maximum control, but we'd rebuild auth, RLS-equivalent authorisation, and storage — months of work for no product value. |
| **AWS Amplify** | Powerful, heavy, and the complexity lands on a team that shouldn't be spending its time there. |
| **PocketBase / self-hosted** | Cheap and pleasant, but operational burden and scaling risk on a consumer app. |

## Consequences

**Buys us:** Postgres (real constraints, transactions, and SQL for analytics); RLS as a
declarative authorisation layer; auth including anonymous→account upgrade, which our
onboarding depends on; edge functions colocated with the data; no servers to run.

**Costs us:** vendor dependency; edge functions are Deno, so engine code must stay
runtime-agnostic (which we wanted anyway); RLS is powerful but easy to get subtly
wrong — hence mandatory RLS tests.

**Mitigation for lock-in:** the data is plain Postgres and the logic is in
framework-free TypeScript. Migrating means swapping adapters, not rewriting the
product.

## Reconsider when

- \> 500 k MAU, or infra cost per MAU exceeds plan.
- p95 latency on the hot path can't be met within Supabase's limits.
- A compliance requirement demands infrastructure Supabase can't provide.
