# ADR 0007 — Zustand + TanStack Query + MMKV

**Status:** Accepted **Date:** 2026-07-31

## Context

Four kinds of state with genuinely different lifetimes: server data (progress,
leagues), session/UI state (the lesson in progress), durable local state (settings,
cached packs, the offline queue), and ephemeral component state. Conflating them is
the usual cause of stale UI and impossible-to-debug sync bugs.

## Decision

- **TanStack Query** — all server state. It is the cache; nothing else copies it.
- **Zustand** — session and UI state, one small slice per feature.
- **MMKV** (via a typed, versioned repository) — durable local state.
- **`useState`** — ephemeral component state.
- **The lesson runner is an explicit state machine** in `packages/engines`.

## Alternatives considered

| Option | Why not |
|---|---|
| **Redux Toolkit** | Capable and well-understood, but substantial ceremony for a small team, and RTK Query is not better than TanStack Query here. |
| **Everything in Zustand** | Means hand-rolling caching, invalidation, retries and background refetch — i.e. rewriting TanStack Query, worse. |
| **Context + useReducer** | Fine at first, becomes a re-render problem in a 60fps animated app. |
| **Jotai / Recoil** | Atomic models are elegant; the granularity isn't what our state needs, and the ecosystem is smaller. |
| **AsyncStorage instead of MMKV** | Async and considerably slower; MMKV is synchronous, which matters on a cold start where we read settings before first paint. |

## Consequences

**Buys us:** one obvious home for every piece of state; no cache-invalidation code of
our own; fast synchronous local reads; a lesson flow that can be tested without a
renderer.

**Costs us:** three libraries to learn; a rule ("never copy server state into
Zustand") that must be enforced in review — it's the one violation that quietly breaks
everything.

## Reconsider when

The rule proves unenforceable in practice, or a genuine need for cross-feature
transactional state appears.
