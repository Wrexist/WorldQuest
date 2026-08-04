# ADR 0011 — XP is not spendable; coins are

**Status:** Accepted **Date:** 2026-07-31

## Context

The founder brief asks, correctly, "Where is XP spent? Without sinks, XP becomes
meaningless." The observation is right — an unspendable currency with no purpose is
noise — but the proposed fix creates a worse problem.

If XP is spendable, then buying a hat lowers your level, corrupts your league
standing, and makes "12,850 / 15,000 XP" on the profile screen meaningless. A
progression score and an economy currency want opposite properties: one must only ever
go up, the other must go down.

## Decision

Split them.

| Currency | Earned by | Spent on | Direction |
|---|---|---|---|
| **XP** | Learning | Nothing, ever | Monotonically up |
| **Coins** | Learning, quests, achievements | Cosmetics, freezes, lesson continues | Up and down |
| **Gems** | Purchase only | Premium cosmetics, gifting | Paid |
| **Hearts** | Regenerate over time | Wrong answers | Consumable |

The v1 mockup already shows both `+10 XP` and `🪙 +5` on the feedback screen, so this
matches the intended design.

## Alternatives considered

| Option | Why not |
|---|---|
| **Spendable XP** | Breaks levels, leagues and lifetime totals. Every status signal becomes "how much have you *not* spent". |
| **XP only, no sink** | The original problem: a number with no meaning beyond itself. |
| **Two XP pools (lifetime + spendable)** | Functionally identical to XP + coins, but harder to explain and harder to name. |

## Consequences

**Buys us:** coherent progression and leaderboards; a real economy with sinks; a clean
place for Premium to sell delight rather than advantage; separate balancing levers for
"how fast do I level" and "how fast can I buy things".

**Costs us:** two numbers to explain in onboarding (mitigated: XP has a bar, coins have
a wallet — the visual grammar does most of the explaining); two ledgers to maintain.

**Hard constraint:** coins buy delight, never advantage. No content, no lessons, no
difficulty skips, no league position. And no randomised paid rewards, ever.

## Reconsider when

Never for the split. Individual prices and earn rates are tuned continuously — that's
what the economy health metrics and the balance simulation are for.
