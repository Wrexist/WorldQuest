# Architecture

> "Think in modules. Keeping these responsibilities separate will make the app much
> easier to maintain."

Thirteen engines, one rule about how they talk to each other, and a hard boundary
around the pure core. Everything here exists to protect one bet: **adding a subject is
a content release, not an engineering project.**

---

## 1. The shape

```
┌──────────────────────────────────────────────────────────────┐
│  apps/mobile                Expo · expo-router               │
│  screens · navigation · animation · platform APIs            │
│  ── knows about UI. Knows nothing about scheduling maths. ── │
└───────────────┬──────────────────────────────────────────────┘
                │ hooks + typed clients
┌───────────────▼──────────────────────────────────────────────┐
│  packages/engines           PURE TYPESCRIPT                  │
│  learning · content · progress · xp · quests · achievements  │
│  leagues · shared                                            │
│  ── no React. no network. no clock. no randomness. ──        │
└───────────────┬──────────────────────────────────────────────┘
                │ ports (interfaces)
┌───────────────▼──────────────────────────────────────────────┐
│  adapters      supabase · mmkv · posthog · sentry · expo-*   │
└───────────────┬──────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────┐
│  Supabase      Postgres + RLS · Auth · Edge Functions · CDN  │
│  ── authoritative for anything that produces a reward ──     │
└──────────────────────────────────────────────────────────────┘
```

**Ports and adapters.** The engines define interfaces (`Clock`, `Rng`, `ContentSource`,
`ProgressStore`, `Analytics`); the app wires real implementations; tests wire fakes.
That's what makes the same scheduling code run identically on the client and in an
edge function.

---

## 2. The thirteen engines

| Engine | Owns | Never |
|---|---|---|
| **Auth** | Sessions, roles, entitlements, the child-account branch | Business logic |
| **Learning** | FSRS scheduling, mastery, item selection | Knowing what geography is |
| **Content** | Pack loading, validation, fact→item generation, distractors | User state |
| **Progress** | Levels, region/country/global completion, streaks | Awarding currency |
| **XP** | XP and coin computation from the balance table | Being trusted on the client |
| **Achievement** | Rule evaluation over domain events | Its own event log |
| **Quest** | Daily/weekly generation and evaluation | Content authoring |
| **League** | Cohorting, ranking, promotion, seasons | Talking to users |
| **Notification** | Scheduling, budget enforcement, suppression | Marketing campaigns |
| **Social** | Friends, challenges, blocking | Free text |
| **Analytics** | Typed event emission, batching, consent gating | PII on child accounts |
| **Payment** | RevenueCat entitlements, restore | Granting progression |
| **Sync** | Offline queue, replay, conflict resolution | Deciding truth (the server does) |

Plus **Offline**, which is not really an engine but a property every one of them must
have. Listed separately because calling it a cross-cutting concern is how it gets
forgotten.

### Communication rules

1. Engines **do not import each other** except through `shared`.
2. They communicate by **domain events**: `LessonCompleted`, `FactMastered`,
   `StreakExtended`, `AchievementUnlocked`.
3. The orchestration layer (an edge function server-side, a hook client-side) wires
   them together. Sequencing lives there, not inside an engine.
4. Every engine is independently testable with no mocks beyond its ports.

```ts
// The whole grading flow, in one readable place
const graded   = learning.grade(session, clock.now())
const progress = progressEngine.apply(graded, userProgress)
const rewards  = xp.award(graded, progress, BALANCE)
const events   = toDomainEvents(graded, progress, rewards)
const unlocks  = achievements.evaluateAll(events, achievementState)
const quests   = questEngine.apply(events, todayQuest)
```

---

## 3. Offline-first

Not a feature. The default assumption, because Priya is on the metro and Emma is on a
tablet with no SIM.

### Reads

```
memory cache → MMKV → bundled content pack → network
```

Core content (countries, flags, capitals) **ships in the binary**. A first launch on a
plane still works. Extended packs download and cache with an LRU eviction policy.

### Writes

Every mutation is an **idempotent event** in a durable local queue:

```ts
type QueuedMutation = {
  id: string          // client UUID = idempotency key
  type: 'review' | 'lesson_complete' | 'quest_progress' | 'purchase'
  payload: unknown
  clientTs: number
  attempts: number
}
```

Flushed on reconnect, in order, with exponential backoff. **The server may replay any
mutation safely** — that's what the idempotency key is for, and it is the single most
important line in the sync design.

### Conflicts

The server always wins. On a mismatch the client accepts the server's state, logs
`sync_conflict_resolved`, and — if the difference is user-visible (XP, streak) —
shows a quiet, non-alarming correction. Never a modal. Never "you cheated".

### The offline contract

| Works offline | Requires network |
|---|---|
| Lessons with cached content | Leagues |
| FSRS scheduling and mastery | Friends and challenges |
| Local XP/coin prediction | Purchases |
| Streak display (optimistic) | Downloading new packs |
| Explore, country pages (cached) | The global daily challenge |
| Settings | Account changes |

---

## 4. Server-authoritative logic

Anything that produces a reward runs in an edge function. The client is a renderer.

| Function | Responsibility |
|---|---|
| `submit-lesson` | Re-grade, write `review_log` + `user_facts`, award XP/coins, evaluate achievements and quests, return the authoritative result |
| `evaluate-streak` | Nightly per timezone; extend, freeze, or reset |
| `close-league` | Weekly; rank, promote, demote, award, re-cohort |
| `sync-entitlements` | RevenueCat webhook → `entitlements` |
| `generate-daily-quest` | Per user, per local day |
| `report-content` | Fact reports → moderation queue |
| `export-user-data` / `delete-user` | GDPR |

**Clients have no INSERT/UPDATE on `xp_ledger`, `coin_ledger`, `user_facts`,
`league_members`, or `entitlements`.** RLS denies it; there is no code path to abuse.

---

## 5. Data flow — one lesson, end to end

```
1  User taps Continue
2  Client: contentEngine.buildLesson(dueItems, newItems)      ← local, instant
3  Client: renders items; records {itemId, correct, elapsedMs}
4  Client: learning.review(...) locally → optimistic mastery + XP
5  Client: enqueues LessonSubmitted{idempotencyKey, reviews[]}
6  Sync:   POST /submit-lesson (immediately, or on reconnect)
7  Server: re-derives ratings, runs the SAME engine code
8  Server: writes review_log, user_facts, xp_ledger, coin_ledger
9  Server: emits domain events → achievements, quests, streak
10 Server: returns authoritative {xp, coins, mastery deltas, unlocks}
11 Client: reconciles; server wins; logs any mismatch
12 Client: celebrates unlocks (already shown optimistically where safe)
```

Steps 4 and 7 run **the same module**. That's the point of the pure core.

---

## 6. Performance

| Budget | Target | How |
|---|---|---|
| Cold start → Home interactive | < 2.0 s | Bundled content, no blocking network, deferred non-critical init |
| Next-items selection | < 50 ms p95 | Prebuilt indexes; selection is in-memory over a small candidate set |
| Item transition | < 100 ms | Next item prepared during the current one's feedback |
| Frame rate | ≥ 58 fps | Reanimated on the UI thread; no JS-driven animation |
| Bundle | < 4.1 MiB initial | Lazy routes, packs as assets not JS. **Resolved 2026-08-09** — `scripts/bundle-native.cjs` enforced 6.0 MiB against this row's 4 because `@sentry/react-native` cost 1.92 MiB. Isac decided to hold ~4 and drop Sentry rather than raise the target; a real build measured **4.07 MiB**, so the gate is 4.1 MiB, not the 4.0 first set by arithmetic. See `docs/plan/cowork-handoff.md` §6 and the history comment in `scripts/bundle-native.cjs`. |

**Rendering rules:** every list virtualised (FlashList) · images via `expo-image` with
`contentFit` and a blurhash placeholder · memoise list rows · never a JS-thread
animation · SVG maps simplified per zoom level.

---

## 7. Error handling & resilience

```ts
type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E }
```

Expected failures are values. Throws are for programmer error only.

- **Every screen has an error boundary.** A broken card never blanks the app.
- **Never lose learning.** A failed submit stays in the queue; the user keeps playing.
- **Retry** with exponential backoff + jitter, capped at 5 attempts, then park the
  mutation and surface it in Settings → Sync.
- **Feature flags** wrap every non-core system so a broken league service can be
  switched off server-side without a release.
- Sentry gets the breadcrumbs; the user gets a human sentence and a Retry.

---

## 8. Security boundaries

| Boundary | Control |
|---|---|
| Client ↔ Supabase | RLS on every table, default deny |
| Client ↔ Edge functions | JWT verified, role-checked, rate-limited |
| Content packs | Signed; signature checked before load |
| Secrets | Never in the client bundle; edge functions only |
| Child accounts | Enforced in RLS and in the analytics adapter, not just in the UI |

Detail: [`security-privacy.md`](security-privacy.md).

---

## 9. Extension points

Where a new subject plugs in, and nowhere else:

1. A content pack in `packages/content/packs/<subject>/`
2. A subject entry in the content index
3. *(Optional)* a new question template — if it needs a new UI modality, one component
4. *(Optional)* collections and achievements — data

**If a new subject requires changes in `packages/engines` or `apps/mobile/app/`, the
abstraction leaked.** Fix the abstraction, not the symptom. This is Phase 1's exit
criterion 4 and v3.0's exit criterion.

---

## 10. What we deliberately did not build

| Not built | Why | When we'd reconsider |
|---|---|---|
| Custom backend service | Supabase covers auth, data, RLS, functions and CDN | > 500 k MAU, or a need Postgres can't meet |
| GraphQL | Two clients and a small schema; REST + generated types is simpler | Many clients with divergent needs |
| Microservices | One team, one product | Never, at this size |
| Redux | TanStack Query + Zustand covers it with far less ceremony | Never |
| Native modules | Expo covers our needs; ejecting costs OTA updates | A hard requirement Expo can't meet |
| Server-side rendering for the app | It's a mobile app | The web learner app (v4.0) |
| A monolithic "GameManager" | It's how the engines become spaghetti | Never |
