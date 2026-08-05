# The learning engine

**The most important document in this repository.**

Everything else is a wrapper around this. The brief said it best:

> Don't build quizzes. Build a learning engine.

The engine knows nothing about geography. It knows about **facts**, **items**,
**reviews**, and **memory**. That is what lets geography become history become
astronomy without a rewrite.

Implementation: `packages/engines/src/learning/` — pure TypeScript, no React, no
network, no clock, no randomness (both injected). Testable in a plain Node process.

---

## 1. The model

```
Fact          an atomic piece of knowledge      geo.JP.capital
Template      a way of asking about a fact      tpl.capital.mc4
Item          fact × template                   geo.JP.capital@tpl.capital.mc4
                = the unit of scheduling
Review        one answer to one item            {itemId, rating, elapsedMs, at}
UserFact      a user's memory state for a fact  {stability, difficulty, due, mastery}
```

**Why the item is fact × template, but memory is tracked per *fact*:**
Knowing "Tokyo is the capital of Japan" is one piece of knowledge, whether we ask it
as multiple choice, as free text, or backwards. We schedule the *fact* and vary the
*presentation*. Varying presentation is a well-supported way to strengthen encoding —
and it prevents users from memorising the position of an answer instead of the answer.

**Consequence:** `user_facts` is keyed on `(user_id, fact_id)`, and the template used
is recorded in `review_log` for analysis, not in the scheduler state.

---

## 2. Scheduling: FSRS

We use **FSRS** (Free Spaced Repetition Scheduler) rather than SM-2/Anki-classic.

| | SM-2 | FSRS |
|---|---|---|
| Model | Heuristic ease factor | Three-component memory model (D, S, R) |
| Fit to data | None | Weights fitted to review logs |
| Retention control | Implicit | Explicit target retention parameter |
| Reviews for the same retention | Baseline | ~20–30 % fewer, in published benchmarks |
| Licence | — | Open, MIT-family implementations available |

ADR: [`../adr/0004-spaced-repetition.md`](../adr/0004-spaced-repetition.md).

### 2.1 State per fact

| Field | Meaning |
|---|---|
| `stability` (S) | Days until recall probability decays to the target. The memory's strength. |
| `difficulty` (D) | 1–10. How hard this fact is *for this user*. |
| `retrievability` (R) | Derived: probability of recall right now. |
| `reps` | Successful reviews |
| `lapses` | Times forgotten after being known |
| `lastReviewAt`, `dueAt` | Timestamps |
| `mastery` | Derived label for the UI (see §4). Stored by a trigger, never by a writer — the three levels at `proficient` and above are pure functions of the row; `familiar` depends on retrievability and so exists only live on the client. |
| `avgMs` | Rolling mean answer time — feeds confidence, not scheduling |

### 2.2 Forgetting curve

```
R(t, S) = (1 + FACTOR · t / S) ^ DECAY        DECAY = −0.5, FACTOR = 19/81
```

`t` = days since last review. `R` falls from 1.0 towards 0 as `t` grows past `S`.

### 2.3 Next interval

```
I(S) = (S / FACTOR) · (targetRetention ^ (1/DECAY) − 1)
```

Capped at **365 days**. That cap is a product decision, not a mathematical one: FSRS
will happily schedule a well-known fact decades out, but a geography app that never
checks in on Japan again has quietly stopped being able to claim you know it. The
consequence is that for a burnished fact, retrievability at `dueAt` is *above* the
target rather than equal to it — expected, and asserted in the tests.

**`targetRetention` is a product decision, not a technical one.**

| Audience | Target R | Effect |
|---|---|---|
| Default | **0.90** | Balanced |
| Kids / casual (Emma, Ingrid) | 0.85 | Fewer reviews, more new content, more fun |
| Completionists (Alex, Kenji) | 0.93 | More reviews, higher accuracy, "I really know this" |
| Exam cram (Leo) | 0.95 until the date | Then relaxes back |

Exposed as a Settings slider labelled in human terms ("More new places ↔ Remember
better"), not as a number.

### 2.4 Ratings

FSRS takes a 1–4 rating. Our UI is binary (right/wrong), so we **derive** it — and
this mapping is one of the highest-leverage tuning knobs in the product:

```ts
function deriveRating(correct: boolean, elapsedMs: number, medianMs: number): Rating {
  if (!correct) return 1                                  // Again
  if (elapsedMs > medianMs * 2.5) return 2                // Hard  — right, but slow
  if (elapsedMs < medianMs * 0.6) return 4                // Easy  — instant recall
  return 3                                                // Good
}
```

`medianMs` is per template type, computed from the user's own history with a global
prior. Hesitation is real signal about memory strength — we'd be throwing it away by
treating every correct answer identically.

**Guard:** cap `elapsedMs` at 30 s so a user who put the phone down isn't scored as
having forgotten. Reviews longer than 60 s are logged but excluded from scheduling.

---

## 3. Item selection — what the user actually sees next

The 60/30/10 rule, per lesson:

| Share | Bucket | Rule |
|---|---|---|
| **60 %** | **Due reviews** | `dueAt <= now`, ordered by most overdue |
| **30 %** | **New facts** | From the active topic, easiest-first by global difficulty |
| **10 %** | **Struggling** (leeches) | `lapses >= 4` and `mastery < proficient` |

### Adjustments

- **No due items** (a new user) → 90 % new, 10 % recent reinforcement.
- **Backlog > 50 due** → 85 % reviews, 15 % new, with a gentle "let's catch up" framing —
  never a red badge, never a guilt screen. Backlog shame is the #1 reason people quit
  spaced-repetition tools.
- **Topic-scoped session** (Leo picks "Europe") → the 60 % due is drawn from that topic
  first, then globally. Users must be able to choose. A forced global queue loses Leo.
- **Interleaving** — never two consecutive items from the same fact, and never the
  same country twice in a row. Interleaving beats blocking for retention, and blocked
  repetition feels broken to users.
- **Lesson length** is a fixed unit of **~2 minutes**, clamped to **[5, 20] items**.
  The daily goal (5/10/20 min) controls **how many lessons a day**, not how long one
  lesson is.

  > Deriving length from the goal directly (goal ÷ item time) collapses: at realistic
  > item times every goal from 5 to 20 minutes lands above the 20-item cap, so the
  > setting does nothing. Sizing the lesson and counting lessons keeps "five minutes
  > is a complete experience" true at every goal — and a lesson always ends.

### Leeches
Failing a fact that already has `lapses >= 8` **suspends** it and rests it for at least
`LEECH_COOLDOWN_DAYS` (14). We do not keep showing someone the same thing they keep
failing — that's the fastest way to make them quit.

**Suspension is a rest, not a removal**, and the distinction is the whole rule. Once the
cooldown has passed the fact rejoins through the *struggling* slot — capped at 10 % of a
session, so a backlog of leeches can never crowd out the reviews and new content a
session is for — with a presentation `itemsForFact` shuffles independently. The first
correct answer releases it, in one answer, and `lapses` is left untouched because FSRS
and the struggling filter both read it.

> This was a life sentence until 2026-08. `suspended` was derived from lifetime `lapses`,
> a number that only rises, and `selectItems` dropped every suspended candidate — so a
> fact that crossed the threshold once could not be shown, therefore could not be answered
> correctly, therefore could never come back. The app stopped teaching it and went on
> reporting the user had not learned it. The selection test asserted the behaviour, which
> is why it read as correct for so long.

The richer treatments — a mnemonic, an Atlas explanation — remain v3.0.

---

## 4. Mastery states (what the UI shows)

The user never sees "stability = 12.4". They see a state:

| State | Condition | UI |
|---|---|---|
| `unseen` | No review | Dimmed tile |
| `learning` | `reps < 2` or `S < 1 day` | Blue dot |
| `familiar` | `S >= 1d` and `R >= 0.9` | Half-filled |
| `proficient` | `S >= 7d`, `reps >= 3`, `lapses <= 1` | Filled |
| `mastered` | `S >= 21d`, `reps >= 5` | Gold |
| `burnished` | `S >= 180d`, `lapses = 0` | Gold + glow, review ~yearly |

**`mastered` is what "183 / 195 countries" means** — a claim we can defend, which is
gap #3 in [`../product/competitive-research.md`](../product/competitive-research.md).

Region and global completion are aggregations over these:
`regionMastery = countFacts(mastery >= 'proficient') / totalFacts(region)`.

---

## 5. Public API

The engine's whole surface. Anything not here is internal.

```ts
// packages/engines/src/learning/index.ts

export type FactId = string
export type Rating = 1 | 2 | 3 | 4
export type Mastery =
  | 'unseen' | 'learning' | 'familiar' | 'proficient' | 'mastered' | 'burnished'

export type MemoryState = {
  factId: FactId
  stability: number
  difficulty: number
  reps: number
  lapses: number
  lastReviewAt: number | null   // epoch ms
  dueAt: number                 // epoch ms
}

export type ReviewInput = {
  factId: FactId
  state: MemoryState | null     // null = first ever review
  rating: Rating
  now: number                   // injected clock — never Date.now()
  targetRetention?: number      // default 0.90
}

/** Pure. The single scheduling entry point. */
export function review(input: ReviewInput): MemoryState

/** Probability of recall right now. */
export function retrievability(state: MemoryState, now: number): number

/** Derived UI label. */
export function masteryOf(state: MemoryState, now: number): Mastery

/** 1–4 from a binary answer plus timing. */
export function deriveRating(
  correct: boolean, elapsedMs: number, medianMs: number
): Rating

export type SelectionInput = {
  candidates: MemoryState[]
  newFactIds: FactId[]
  count: number
  now: number
  rng: Rng                      // injected — never Math.random()
  topicFilter?: (id: FactId) => boolean
}

/** Deterministic given the same rng seed. Applies 60/30/10 + interleaving. */
export function selectItems(input: SelectionInput): FactId[]

/** Replay a review log to rebuild state — the recovery path. */
export function rebuild(log: ReviewEvent[], targetRetention?: number): MemoryState[]
```

`rebuild()` is not optional. `review_log` is append-only and authoritative;
`user_facts` is a **derived cache**. If the weights change, a bug corrupts state, or
we migrate the algorithm, we recompute from the log. Users never lose progress to an
engine change. This is worth the storage cost several times over.

---

## 6. Where the code runs

| Concern | Where | Why |
|---|---|---|
| Scheduling maths | `packages/engines` | Pure, shared, tested |
| Grading a lesson | **Edge function** | Authoritative; the client cannot forge mastery |
| Optimistic UI | Client, same engine code | Instant feedback |
| Reconciliation | Server response overwrites client | Server always wins |
| Offline session | Client engine → queued review events | Replayed and re-graded server-side |

The *same* engine module runs in both places, so client and server agree. That is the
main reason the engine is framework-free.

---

## 7. Tuning & measurement

Ship with the published default FSRS weights. Then:

1. Log every review (`review_log`) with rating, elapsed time, template and outcome.
2. Monthly, fit weights on the aggregate log; compare predicted vs actual recall.
3. Optimise **per cohort** first (kids / adults / completionists), personal weights
   only once a user has ≥ 500 reviews.
4. Track **calibration**: if predicted R = 0.90, is observed accuracy 0.90? A
   miscalibrated scheduler is worse than a simple one.

**Honest metric:** *30-day true retention* — the % of facts still answered correctly on
their first review ≥ 30 days after reaching `proficient`. Target ≥ 85 %. This is the
number that proves the whole product works, and nobody else in the category publishes
it.

---

## 8. Failure modes we design against

| Failure | Mitigation |
|---|---|
| **Review backlog shame** | Never show a red count. Cap the visible backlog. Offer "catch up in 5 minutes". |
| **All reviews, no new content** | Hard floor: ≥ 20 % new items unless the user opts into catch-up. Reviews-only feels like a treadmill. |
| **Leech loops** | Suspend at 8 lapses; switch treatment. |
| **Clock manipulation** | Server timestamps are authoritative; client `now` is advisory. |
| **Timezone drift** | Streaks use the user's stored IANA timezone, evaluated server-side. |
| **Engine change breaks progress** | `rebuild()` from `review_log`. |
| **New user with 0 items** | The cold-start path is 90 % new — never show an empty queue. |
| **Bulk answering / bots** | Reviews faster than 400 ms are flagged and excluded from scheduling. See [`../engineering/security-privacy.md`](../engineering/security-privacy.md#anti-cheat). |

---

## 9. Test plan (Phase 1 exit criterion)

`packages/engines/src/learning/*.test.ts`, ≥ 90 % coverage:

- A first correct review yields `dueAt` a few days out (~3 d at the default weights)
- A wrong answer reduces stability and shortens the interval
- Intervals grow monotonically across consecutive correct reviews
- `retrievability` decays with time and equals ~`targetRetention` at `dueAt`,
  **except where the 365-day cap binds**, in which case it is higher
- Initial difficulty for a first "Good" answer lands mid-range (~5), not on a clamp
  boundary — this is the check that catches a bad weight vector immediately
- `masteryOf` transitions at exactly the documented boundaries
- `selectItems` respects 60/30/10 with a full queue, and degrades correctly when a
  bucket is empty
- `selectItems` never returns adjacent duplicates or two facts about the same entity
- Same rng seed → identical output (determinism)
- `rebuild()` over a log reproduces incrementally-computed state **exactly**
- Property test: 10,000 random review sequences never produce `NaN`, a negative
  stability, or a `dueAt` in the past
