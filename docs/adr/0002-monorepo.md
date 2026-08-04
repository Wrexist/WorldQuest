# ADR 0002 — pnpm workspaces monorepo

**Status:** Accepted **Date:** 2026-07-31

## Context

The learning engine must run in three places: the mobile app (optimistic UI), Supabase
edge functions (authoritative grading), and tests/tooling. If those diverge, client and
server disagree about what a user knows — the worst class of bug we could design in.

## Decision

A **pnpm workspaces** monorepo with Turborepo for task orchestration.
`apps/*` consume `packages/*`; `packages/engines` is pure TypeScript with no framework
dependency, so it imports cleanly into React Native, Deno, and Node.

## Alternatives considered

| Option | Why not |
|---|---|
| **Separate repos + published packages** | Version skew between client and server is exactly the failure we're avoiding. Publishing on every engine change is friction we'd route around. |
| **Copy the engine into the edge function** | Guaranteed drift. This is not a strawman — it's the shortcut people actually take. |
| **npm/yarn workspaces** | Fine, but pnpm's strict linking catches accidental cross-package imports, which is precisely the discipline the dependency rule needs. |
| **Nx** | More capable than we need; Turborepo's caching is sufficient at this size. |

## Consequences

**Buys us:** one version of the engine, everywhere; enforced dependency boundaries;
atomic changes across app, engine and content; shared tooling config.

**Costs us:** more setup than a single app; CI must be workspace-aware; contributors
must install from the root (documented in `CLAUDE.md`).

## Reconsider when

The web app diverges enough to want its own release cadence — even then, the engines
stay shared.
