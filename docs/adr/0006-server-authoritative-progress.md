# ADR 0006 — Server-authoritative rewards and progress

**Status:** Accepted **Date:** 2026-07-31

## Context

XP, coins, streaks, hearts, league position and achievements all have value to users.
Anything valuable and client-controlled will be forged — and once a leaderboard is
full of forged scores, it's worthless to the honest majority. But the app must also
feel instant, and must work offline.

## Decision

**The client predicts; the server decides.** The client renders rewards optimistically
using the same engine module, then submits the raw answers. An edge function re-derives
ratings, re-grades with the same code, writes the ledgers, and returns the
authoritative result. The client reconciles; the server always wins.

Clients have **no insert or update rights** on `xp_ledger`, `coin_ledger`,
`user_facts`, `review_log`, `league_members`, or `entitlements`.

## Alternatives considered

| Option | Why not |
|---|---|
| **Client-authoritative with server validation heuristics** | Simpler, and it's what many apps do. Heuristics are an arms race you lose quietly, and you can never fully trust historical data. |
| **Fully server-side lessons (no local grading)** | Trustworthy, but breaks offline and adds a round trip to every answer. Unacceptable for Priya on the metro. |
| **Trust the client entirely** | Fine for a single-player toy. We have leaderboards, a shop, and children whose parents pay for it. |

## Consequences

**Buys us:** leaderboards that mean something; an economy that can't be minted;
offline that still reconciles correctly; a single source of truth for support
questions.

**Costs us:** the engine must be runtime-agnostic (which we wanted); reconciliation UX
must be designed so a correction is quiet, not alarming; edge function cost per lesson.

**Key enabler:** `lessons.id` is a client-generated UUID and a primary key, so replay
is safe — a duplicate submit is a no-op returning the original result. That single
property is what makes offline queuing safe.

## Reconsider when

Never for rewards. Purely cosmetic client state (which theme is applied) does not need
this treatment.
