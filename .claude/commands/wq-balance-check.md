---
description: Simulate the WorldQuest economy and report health before/after a change
---

Run the economy simulation and report on it.

Invoke the `worldquest-xp-economy` skill.

1. Run `pnpm engines:simulate` (or `packages/engines/src/xp/simulate.ts`) for three
   synthetic cohorts over 90 days: casual 5 min/day, regular 10 min/day, heavy
   30 min/day.
2. Report, for each cohort: XP curve and level pacing · coin income vs outflow ·
   day of first meaningful cosmetic · heart-block rate · daily soft-cap hits.
3. If this is a change, run **before and after** and show both.

Check against the targets:

| Metric | Healthy |
|---|---|
| Coin earn ÷ spend, weekly | 0.9 – 1.2 |
| Days to first meaningful cosmetic | 4 – 7 |
| Median coin balance | < 5 days of earnings |
| Heart-block rate | < 15 % of lessons |
| Coin refills after a block | < 20 % |
| Daily XP soft-cap hits | < 5 % of DAU |

Flag any new farming route the change opens. Economy bugs are near-impossible to walk
back once users have balances — say clearly if you think a number is wrong.
