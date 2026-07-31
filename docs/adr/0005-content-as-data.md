# ADR 0005 — Content as validated data packs

**Status:** Accepted **Date:** 2026-07-31

## Context

The product bet is that WorldQuest is a platform, not a geography app. That bet lives
or dies here: if adding a country or a subject requires a code change and a store
release, we have a geography app with extra abstraction.

## Decision

All content is **JSON packs** — entities, facts, templates, collections — validated in
CI by JSON Schema (for authors) and Zod (at runtime). Questions are **generated** from
`fact × template` at build time. Core packs ship in the binary; extended packs come
from a CDN.

## Alternatives considered

| Option | Why not |
|---|---|
| **Hardcoded question arrays** | Fastest for the first 50 questions, unmaintainable by 500, and impossible to fix without a store release. |
| **Content in the database** | Breaks offline, adds latency to every lesson start, and makes the database large and hot. Content is read-only and identical for everyone — it belongs in the bundle and the CDN. |
| **A CMS** | Real value for a content team, but premature. The packs are a CMS's export format anyway, so adding one later is additive. |
| **AI-generated questions at runtime** | Unverifiable facts, non-deterministic difficulty, latency, cost, and no offline. AI belongs in *authoring* (reviewed by a human), not in serving. |

## Consequences

**Buys us:** a wrong fact is a same-day CDN fix, not a store submission; a new subject
is a pack; ~600 authored facts and 6 templates produce 1,500+ items; content can be
authored by non-engineers and by AI agents under review; everything works offline.

**Costs us:** a build pipeline to write and maintain; distractor generation is a real
design problem (see the content pipeline doc); pack versioning and signature
verification.

## Reconsider when

Never for the model itself. Add a CMS on top when a content team outgrows editing JSON
in pull requests.
