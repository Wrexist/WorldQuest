# XP & economy

> "Without sinks, XP becomes meaningless."

Correct — and the fix is not to make XP spendable. **XP is a permanent progression
score.** If you spend it, your level goes down, your league position becomes
incoherent, and "12,850 / 15,000 XP" on the profile screen stops meaning anything.

So we split the currency, exactly as the mockup already implies with its `+10 XP`
**and** `🪙 +5`:

| Currency | Earned by | Spent on | Direction |
|---|---|---|---|
| **XP** | Learning | **Nothing** | Only ever goes up |
| **Coins** 🪙 | Learning, quests, achievements | Cosmetics, streak freezes, lesson continues | Up and down |
| **Gems** 💎 | **Purchase only** | Premium cosmetics, gifting | Paid |
| **Hearts** ❤️ | Reset every lesson | Wrong answers on *review* items | Consumable |

Recorded as a Product Bible amendment (2026-07-31).

---

## 1. XP — the progression score

**Sources**

| Action | XP | Notes |
|---|---|---|
| Correct answer | **10** | The atom of the economy |
| Correct on a review that was overdue | **+2** | Rewards coming back, not grinding |
| Perfect lesson (no mistakes) | **+15** | |
| Lesson completed | **+5** | Completion, not correctness |
| Daily Quest completed | **+50** | Matches the mockup |
| Daily Challenge completed | **+30** | |
| Speed bonus (< 3 s, correct) | **+2** | Capped at 5/lesson so speed ≠ strategy |
| First lesson of the day | **+10** | The habit nudge |
| Streak milestone (7/30/100/365) | **+50 / +200 / +500 / +1000** | |
| Achievement unlocked | **+25 … +500** | By tier |
| Collection completed | **+100** | |
| Friend invited (activated) | **+100** | Once per friend, on *their* first lesson |
| Fact reaching `mastered` | **+20** | **Rewards learning, not activity** |

That last row matters more than its size: it is the only XP source that cannot be
farmed by volume. Getting the same fact right ten times in a day earns diminishing
XP; getting it right across three weeks earns the mastery bonus.

**Anti-farming**
- Daily XP soft cap: **3,000** (≈ 60 min), after which XP earns at 25 %. Users are told plainly
  ("You've done plenty today — come back tomorrow for full XP"), which is on-brand.
- Repeating an already-`mastered` fact in the same day earns 2 XP, not 10.
- A lesson with < 5 items earns no completion bonus.
- **All XP is computed server-side.** The client's number is a prediction.

**XP is used for:** Explorer level · weekly league standing · season rank · lifetime
total on the profile. Nothing else. Ever.

### Level curve

```
xpForLevel(n) = round(50 · n^1.9)        // cumulative XP to reach level n
```

Computed values, and the pacing for a regular user earning ~300 XP/day:

| Level | Cumulative XP | Days at 300 XP/day |
|---|---|---|
| 2 | 187 | 1 |
| 5 | 1,064 | 4 |
| 10 | 3,972 | 13 |
| 20 | 14,823 | 49 |
| 30 | 32,026 | 107 |
| 38 | 50,183 | 167 *(the mockup's "Explorer Max, Level 38")* |
| 50 | 84,530 | 282 |
| 70 | 160,198 | 534 |
| 100 | 315,479 | ~3 years |

**Why 1.9.** A shallower curve (1.55) puts level 100 inside the first year and leaves
Alex nothing to chase; a steeper one (2.2) makes the first ten levels feel like work
and loses Emma. 1.9 gives L10 in two weeks, L38 in five months, L100 in three years.

> The mockup's `12,850 / 15,000` is an illustrative label, not a target — the curve is
> defined by the formula above. The bar shows progress *within* the current level:
> `(total − xpForLevel(n)) / (xpForLevel(n+1) − xpForLevel(n))`.

Levels are **uncapped**; every 10 levels grants a **Title** (Wanderer · Navigator ·
Cartographer · Pathfinder · Voyager · Circumnavigator …). Titles are the cheapest
possible status reward, and Alex will chase them for months.

---

## 2. Coins — the spendable currency

**Sources** (roughly ⅓ of XP volume, so prices stay legible)

| Action | Coins |
|---|---|
| Correct answer | **5** |
| Perfect lesson | **+10** |
| Daily Quest | **+25** |
| Daily Challenge | **+15** |
| Streak milestone (7/30/100) | **+50 / +200 / +500** |
| Achievement | **+10 … +200** |
| Collection completed | **+150** |
| League top 3 | **+300 / +200 / +100** |
| Watching Atlas explain a mistake | **+2** | *(v3.0 — pays you to learn from errors)* |

**Sinks** (this is the half everyone forgets)

| Item | Cost | Note |
|---|---|---|
| Continue a lesson after running out | 250 | The next lesson is always free and fresh |
| Streak freeze | 400 | Max 2 held |
| Streak repair (within 48 h) | 600 | Once per 30 days |
| Avatar item | 300 – 2,000 | The main sink |
| Pet | 1,500 – 5,000 | Emma's whole reason for existing |
| Map skin | 2,000 | Alex's status symbol |
| Theme | 1,500 | |
| Title unlock (cosmetic) | 1,000 | |
| Celebration animation | 800 | |
| Gift to a friend | item cost + 10 % | v2.0 — cheapest possible virality |

**Balance target:** a daily 10-minute user earns ~250–400 coins/day. A meaningful
cosmetic should take **4–7 days** to save for. Faster and rewards feel weightless;
slower and the shop feels pointless.

**Never purchasable with coins:** content, lessons, difficulty skips, league position,
XP. **Coins buy delight, never advantage.**

### What the shop actually sells today

The whole cosmetic half of that table was filed as "blocked on an illustrator" and
shipped as nothing, which left coins earned everywhere and spendable on three utility
items — a violation of Product Bible principle 10 sitting in plain sight. Sorting the
six categories by what each one actually needs:

| Category | Needs | Status |
|---|---|---|
| Avatar item, pet, map skin, celebration | Illustration (`asset-prompts.md` §6, §11) | Genuinely blocked |
| Theme | **Runtime theming**, not art | Blocked on architecture |
| Title unlock | A string | **Shipped** |

Themes are worth stating precisely, because "we need an artist" would send the next
person to the wrong place. A theme *is* design tokens, and this repo's tokens are
deliberately semantic so exactly that swap is possible. What stops it is that `colors`
resolves at module load inside 34 `StyleSheet.create` calls — runtime theming means a
context and a re-architecture of every stylesheet. Real work, but not a commission.

So the shop opened with titles, in `packages/content/packs/shop/titles.v1.json`. They
are **flavour** titles, deliberately not rank titles: the level ladder in
`packages/i18n/locales/*/titles.json` is earned and must stay earned, and selling
"Circumnavigator" to a level-3 player would devalue every hour somebody spent climbing
to it. A bought title is a different hat, and the level title is always one tap away.

The "More to come" section on the shop screen is a heading and a sentence, **never** a
row of greyed-out items with prices on them. A disabled price tag is a promise with a
number attached, and the number is the part people remember.

---

## 3. Hearts — the friction mechanic, defanged

The mockup shows 5 hearts. Hearts create stakes. Duolingo's version is also the single
most-hated mechanic in the category, because it **blocks learning behind a wait or a
payment**. We keep the tension and remove the harm.

**The rules, all four of them verified by simulation** (`pnpm engines:simulate`):

1. **5 hearts, reset at the start of every lesson.** Not once a day. Carried across a
   session they compound — a casual learner doing three short lessons back to back was
   blocked on **42 %** of them, because five hearts cannot survive three lessons at
   beginner accuracy. That is a day-long lockout in everything but name, which our own
   principles forbid.
2. **New items never cost a heart.** Only review items can. You cannot lose a life for
   not knowing something you have never been taught — and the alternative aims the
   mechanic backwards: heart loss scales with error rate, so simulation showed a
   struggling 10-year-old at 75 % accuracy blocked on 59 % of lessons while a
   completionist at 92 % was blocked on 9 %.
3. **A run of 5 correct answers restores a heart** (capped at 5). Rewards recovery and
   breaks the death spiral that makes hearts the most-hated mechanic in this category.
4. **Out of hearts ends the lesson, never the app.** Practice and Review are always
   free at zero hearts, forever. This is the line we do not cross.

**Measured block rate after these changes:** casual 10.1 % · regular 1.6 % · heavy 0.1 %.
Note the direction — the struggling learner is protected *most*. Before the fixes it was
exactly inverted.

**Other heart rules**
- Regeneration between sessions: 1 per **45 min**, full in ~4 h (child accounts: 22 min).
- A correct answer on a previously-failed review restores 1.
- **Premium = never interrupted.** The correct paywall: it sells *convenience*, never
  *access*.
- **Relaxed Mode and Classroom Mode: hearts off entirely.**

**The coin sink moved.** Because hearts reset per lesson, "refill hearts" is no longer a
meaningful purchase. It is replaced by **Continue this lesson** (250 coins) — spent in
the moment, when you have 2 items left and want to finish.

## 4. Gems 💎 — paid only

Purchased or granted with Premium. Buy premium cosmetics, seasonal exclusives, and
gifts. **Never buy hearts, XP, league position, or progression.**

**Never**: randomised paid rewards, loot boxes, gacha, mystery boxes. Predatory, and
illegal for minors in several of our markets. On the permanent no-list.

---

## 5. The balance table (single source of truth)

Every number above lives in **one** place:

```ts
// packages/engines/src/xp/balance.ts
export const BALANCE = {
  xp: {
    correctAnswer: 10, overdueReviewBonus: 2, perfectLesson: 15,
    lessonComplete: 5, dailyQuest: 50, dailyChallenge: 30,
    speedBonus: 2, speedBonusMaxPerLesson: 5, firstLessonOfDay: 10,
    factMastered: 20, friendActivated: 100, collectionComplete: 100,
    streakMilestones: { 7: 50, 30: 200, 100: 500, 365: 1000 },
    dailySoftCap: 3000, softCapMultiplier: 0.25,
    repeatMasteredSameDay: 2,
  },
  coins: { /* … */ },
  hearts: {
    max: 5, resetPerLesson: true, newItemsCostHearts: false,
    restoreEveryCorrectStreak: 5, regenMinutes: 45, childRegenMinutes: 22,
  },
  levels: { base: 50, exponent: 1.55 },
} as const
```

**Rules**
1. The app **and** the edge function import this same module. They cannot drift.
2. Changing a value requires running `/wq-balance-check` (economy simulation) and
   updating this document in the same PR.
3. The client's award is a **prediction**; the server recomputes and reconciles.
   Mismatches are logged as `xp_reconciliation_failed` — a spike means a bug or a
   cheat.
4. XP and coins are **append-only ledgers** (`xp_ledger`, `coin_ledger`), never
   mutable balances. A balance you can only compute is a balance you can audit,
   replay, and correct.

---

## 6. Anti-cheat

The client is not trusted with anything that produces a reward.

| Vector | Defence |
|---|---|
| Forged lesson results | Edge function re-grades from `review_log`; client XP is advisory |
| Replay attacks | Idempotency key per lesson; duplicates are no-ops |
| Impossibly fast answers | < 400 ms → excluded from XP and from scheduling |
| Clock manipulation | Server timestamps authoritative for streaks, dailies, regen |
| Scripted play | Rate limits + behavioural flags (inhuman consistency, 100 % accuracy at speed) |
| Leaderboard manipulation | Server-computed; shadow-segregate flagged accounts rather than banning outright |
| Modified client | Signed content packs; server-side validation of every award |

Detail: [`../engineering/security-privacy.md`](../engineering/security-privacy.md#anti-cheat).

---

## 7. Economy health metrics

| Metric | Healthy range | Meaning if it breaks |
|---|---|---|
| Coins earned vs spent, weekly | 0.9 – 1.2 | > 1.5: not enough sinks; < 0.7: prices too high |
| Median coin balance | < 5 days of earnings | A hoard means nothing is worth buying |
| % of users owning ≥ 1 cosmetic by day 14 | > 40 % | The shop isn't landing |
| Heart-block rate | < 15 % of lessons | Too punishing. Watch it **per accuracy band** — if it rises as accuracy falls, the mechanic is aimed backwards. |
| Paid lesson continues | < 20 % of blocks | People are paying to keep learning — wrong |
| Daily XP soft-cap hits | < 5 % of DAU | We may be encouraging grinding. Cap is 3000 ≈ 60 min; at 1500 it throttled a 30-minute learner on 84 of 90 days, which taxes exactly the behaviour we want. |

Reviewed monthly. A change to any number in §5 requires a before/after simulation.

---

## 8. Simulation

`/wq-balance-check` runs `packages/engines/src/xp/simulate.ts`, projecting a synthetic
cohort (casual 5 min · regular 10 min · heavy 30 min) over 90 days and reporting XP
curve, level pacing, coin income/outflow, first-cosmetic day, and heart-block rate.

**Run it before merging any economy change.** Economy bugs are discovered by users,
loudly, and are near-impossible to walk back once people have balances.
