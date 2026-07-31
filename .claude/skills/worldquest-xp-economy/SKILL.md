---
name: worldquest-xp-economy
description: Change XP, coins, gems, hearts, level curves, prices or any reward number in WorldQuest. Use before touching packages/engines/src/xp, the balance table, the shop, or any award value. Requires running the economy simulation before merge.
---

# Changing the economy

Spec: [`docs/systems/xp-economy.md`](../../docs/systems/xp-economy.md) ·
Decision: [`ADR 0011`](../../docs/adr/0011-xp-and-coins-split.md).

**Economy bugs are discovered by users, loudly, and are near-impossible to walk back
once people have balances.** Treat every number here as a one-way door.

## The four currencies — don't confuse them

| | Earned by | Spent on | Direction |
|---|---|---|---|
| **XP** | Learning | **Nothing, ever** | Only up |
| **Coins** | Learning, quests, achievements | Cosmetics, freezes, refills | Up and down |
| **Gems** | Purchase only | Premium cosmetics, gifts | Paid |
| **Hearts** | Regenerate | Wrong answers | Consumable |

**XP is never spendable.** Spending it would corrupt levels, leagues, and the lifetime
total on the profile. If a proposal involves spending XP, it's really asking for coins.

## One source of truth

Every number lives in `packages/engines/src/xp/balance.ts`. The app and the edge
function import the **same module**, so they cannot drift.

```ts
export const BALANCE = {
  xp: { correctAnswer: 10, dailyQuest: 50, factMastered: 20, dailySoftCap: 1500, … },
  coins: { … },
  hearts: { max: 5, regenMinutes: 45, childRegenMinutes: 22, refillCost: 250 },
  levels: { base: 50, exponent: 1.55 },
} as const
```

Never a literal reward value anywhere else. CI rejects them.

## Before you merge any change

```bash
/wq-balance-check          # or: pnpm engines:simulate
```

Simulates casual (5 min), regular (10 min) and heavy (30 min) cohorts over 90 days and
reports: XP curve, level pacing, coin income vs outflow, day-of-first-cosmetic, and
heart-block rate. **Compare before and after, and put both in the PR.**

## Balance targets

| | Target | If it breaks |
|---|---|---|
| Coin earn ÷ spend, weekly | 0.9 – 1.2 | > 1.5 → not enough sinks; < 0.7 → too expensive |
| Days to first meaningful cosmetic | 4 – 7 | Faster = weightless; slower = pointless shop |
| Median coin balance | < 5 days of earnings | A hoard means nothing is worth buying |
| Heart-block rate | < 15 % of lessons | Too punishing |
| Coin refills after a block | < 20 % | People are paying to keep learning — wrong |
| Daily XP soft-cap hits | < 5 % of DAU | We're encouraging grinding |

## Hard rules

1. **Coins buy delight, never advantage.** No content, no lessons, no difficulty skips,
   no league position, no XP.
2. **Hearts never block learning.** Practice and Review are always free, with zero
   hearts, forever. Premium sells convenience, not access.
3. **No randomised paid rewards.** No loot boxes, gacha, or mystery boxes. Permanent
   no-list — predatory, and illegal for minors in several of our markets.
4. **All awards are computed server-side.** The client's number is a prediction.
5. **Ledgers, not balances.** `xp_ledger` and `coin_ledger` are append-only; a wallet
   is a rebuildable cache.
6. **XP only ever increases.** No negative entries in `xp_ledger`, ever.

## Anti-farming already in place

Daily XP soft cap (1500, then 25 %) · repeating a mastered fact same-day earns 2 not 10 ·
speed bonus capped at 5/lesson · lessons under 5 items earn no completion bonus ·
referral XP requires the invitee to complete 5 lessons across 3 days.

If a change opens a new farming route, close it in the same PR.
