# ADR 0010 — PostHog (EU), and no third-party analytics for children

**Status:** Accepted **Date:** 2026-07-31

## Context

We need product analytics to know whether the loop works — and a meaningful share of
our users will be under 13, where third-party analytics and advertising identifiers are
a legal and ethical problem (COPPA, GDPR-K). Marcus is buying trust as much as he is
buying a learning app.

## Decision

**PostHog, EU region**, with IP discarded and hashed user IDs. Feature flags and
experiments from the same tool.

**Child accounts (`is_child = true`) emit no third-party analytics at all.** The
analytics adapter is a no-op for them; their events go to first-party aggregate storage
only, with no device or advertising identifiers.

## Alternatives considered

| Option | Why not |
|---|---|
| **Firebase Analytics / GA4** | Free and capable, but a Google advertising-adjacent SDK in a children's app is exactly the association we're selling the absence of. |
| **Amplitude / Mixpanel** | Good products; US-centric data residency and pricing that scales awkwardly for a freemium consumer app. |
| **Fully self-hosted / first-party only** | Best privacy story, most engineering. PostHog can be self-hosted later without changing our adapter — so this stays available. |
| **No analytics** | We would be guessing about the loop, and the loop is the product risk. |

## Consequences

**Buys us:** EU residency by default; funnels, cohorts, flags and experiments in one
tool; a self-host escape hatch; a child-privacy story that is architectural rather than
promised.

**Costs us:** children's behaviour is measured only in aggregate, so some product
questions about young users are harder to answer — an accepted trade, not an oversight.
Cost scales with event volume, hence sampling `question_shown` at 10 %.

**Enforcement:** the no-op is in the adapter and is unit-tested. It is not a UI
condition and not a policy — a developer cannot accidentally bypass it.

## Reconsider when

Cost at scale justifies self-hosting PostHog, or a regulator's guidance requires
stricter handling — in which case the adapter boundary is where the change lands.
