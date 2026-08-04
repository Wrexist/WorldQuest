---
name: worldquest-learning-engine
description: Work on WorldQuest's spaced-repetition scheduler, mastery states, item selection or review grading in packages/engines. Use for any change to FSRS scheduling, due dates, difficulty, mastery transitions, lesson composition, or the grading path in the submit-lesson edge function.
---

# Working on the learning engine

Spec: [`docs/systems/learning-engine.md`](../../docs/systems/learning-engine.md).
This is the most consequential code in the product — a bug here silently degrades
everyone's learning and nobody files a ticket about it.

## Purity is the contract

`packages/engines` must import **no** React, **no** network, **no** `Date.now()`,
**no** `Math.random()`.

```ts
❌  const now = Date.now()
❌  const shuffled = items.sort(() => Math.random() - 0.5)
✅  export function review(input: { state, rating, now: number }): MemoryState
✅  export function selectItems(input: { …, rng: Rng }): FactId[]
```

Time and randomness are **injected**. That's what lets the same module run in the app
and in the edge function and produce identical results — which is the whole reason
client optimism is safe.

## The model

- **Stability (S)** — days until recall decays to the target
- **Difficulty (D)** — 1–10, per user per fact
- **Retrievability (R)** — derived: `(1 + FACTOR·t/S)^DECAY`, `DECAY = −0.5`
- Next interval: `I(S) = (S/FACTOR)·(targetRetention^(1/DECAY) − 1)`

`targetRetention` is a **product** decision: 0.85 kids · 0.90 default · 0.93
completionists. Exposed to users in human terms, never as a number.

## Deriving the rating

Our UI is binary; FSRS wants 1–4. Hesitation is real signal — don't throw it away.

```ts
if (!correct) return 1                       // Again
if (elapsedMs > medianMs * 2.5) return 2     // Hard
if (elapsedMs < medianMs * 0.6) return 4     // Easy
return 3                                     // Good
```

Cap `elapsedMs` at 30 s (the user put the phone down); exclude > 60 s from scheduling
entirely.

## Item selection: 60 / 30 / 10

Due reviews / new facts / struggling items — with these adjustments:

- No due items → 90 % new (never show an empty queue)
- Backlog > 50 → 85 % reviews, framed gently, **never a red badge**
- Topic-scoped when the user chose a topic — free choice is non-negotiable (Leo)
- Never two consecutive items from the same fact or the same entity
- Lesson length = daily goal ÷ median item time, clamped to **[5, 20]**

## Never break these

| Rule | Why |
|---|---|
| **≥ 20 % new items** unless the user opts into catch-up | Reviews-only feels like a treadmill and people quit |
| Suspend leeches at 8 lapses | Repeating what someone keeps failing is how you lose them |
| `review_log` is append-only | It is the source of truth; `user_facts` is a cache |
| `rebuild()` must reproduce incremental state exactly | It's how progress survives an algorithm change |
| Answers < 400 ms earn nothing and don't schedule | Anti-cheat and anti-noise |
| Server timestamps win | Clock manipulation must gain nothing |

## Testing (≥ 90 % coverage, gated in CI)

Required cases:
- First review → `dueAt` ~1 day out
- Wrong answer → stability drops, interval shortens
- Consecutive correct → monotonically growing intervals
- `retrievability` ≈ `targetRetention` exactly at `dueAt`
- `masteryOf` transitions at the documented boundaries
- Selection honours 60/30/10 and degrades sanely with empty buckets
- Same seed → identical output
- **`rebuild()` from a log === incrementally-computed state**
- Property tests (10k cases): no `NaN`, no negative stability, no past `dueAt`

## Changing weights or the algorithm

1. Simulate against real `review_log` data first — never ship a scheduler change blind.
2. Check calibration: if predicted R = 0.90, is observed accuracy 0.90?
3. Roll out behind a flag, per cohort.
4. `rebuild()` makes it reversible — that's the safety net, so use it deliberately
   rather than treating it as a fallback you hope never to need.
