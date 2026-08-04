# Architecture Decision Records

One file per decision that is expensive to reverse. Each records the context, the
choice, the alternatives we rejected, the consequences we accept, and **what would
make us reconsider** — that last section is what stops an ADR becoming dogma.

**Changing a stack element requires a new ADR.** Superseding is normal; silently
drifting is not.

| # | Decision | Status |
|---|---|---|
| [0001](0001-tech-stack.md) | Expo + React Native + TypeScript | Accepted |
| [0002](0002-monorepo.md) | pnpm workspaces monorepo | Accepted |
| [0003](0003-backend-supabase.md) | Supabase as the backend | Accepted |
| [0004](0004-spaced-repetition.md) | FSRS over SM-2 | Accepted |
| [0005](0005-content-as-data.md) | Content as validated data packs | Accepted |
| [0006](0006-server-authoritative-progress.md) | Server-authoritative rewards | Accepted |
| [0007](0007-state-management.md) | Zustand + TanStack Query + MMKV | Accepted |
| [0008](0008-vector-maps.md) | Vector SVG maps, not tiles | Accepted |
| [0009](0009-localization.md) | i18next + ICU from commit one | Accepted |
| [0010](0010-analytics-and-privacy.md) | PostHog EU, no third-party analytics for children | Accepted |
| [0011](0011-xp-and-coins-split.md) | XP is not spendable; coins are | Accepted |

## Template

```markdown
# ADR NNNN — Title
**Status:** Proposed | Accepted | Superseded by ADR-XXXX   **Date:** YYYY-MM-DD

## Context
What forces are at play?

## Decision
What we're doing.

## Alternatives considered
What we rejected, and why.

## Consequences
What this buys us and what it costs us.

## Reconsider when
The concrete trigger that would reopen this.
```
