# WorldQuest — PROJECT.md

> **The single source of truth for this repository.**
> Read this file before writing any code. Every architectural, visual, and product
> decision either lives here or is linked from here. If something contradicts this
> file, this file wins — or this file gets updated first, in the same PR.

| | |
|---|---|
| **Product** | WorldQuest — learn the world in 5 minutes a day |
| **Stage** | Phase 0 → Phase 1 (foundations, pre-code) |
| **Repo** | `wrexist/worldquest` |
| **Design source** | [`docs/design/assets/mockup-v1.png`](docs/design/assets/mockup-v1.png) (15 screens) |
| **Original brief** | [`docs/product/mvp-brief-original.md`](docs/product/mvp-brief-original.md) |
| **Deep docs** | [`docs/`](docs/README.md) |

---

## Table of contents

1. [Product vision](#1-product-vision)
2. [Tech stack](#2-tech-stack)
3. [Folder structure](#3-folder-structure)
4. [Naming conventions](#4-naming-conventions)
5. [Coding standards](#5-coding-standards)
6. [State management rules](#6-state-management-rules)
7. [UI principles](#7-ui-principles)
8. [Design system](#8-design-system)
9. [Database schema](#9-database-schema)
10. [Feature roadmap](#10-feature-roadmap)
11. [Git workflow](#11-git-workflow)
12. [Definition of done](#12-definition-of-done)

---

## 1. Product vision

### The one-liner

**WorldQuest teaches you the world — countries, flags, capitals, landmarks — in five
minutes a day, and makes you want to come back tomorrow.**

### The thesis (read this twice)

WorldQuest is **not a geography quiz app**. It is a **learning engine for visual
knowledge**, and geography is the first subject loaded into it.

That distinction drives every technical decision in this document. Content is
**data**, not code. Questions are **generated from templates over structured facts**,
not hand-written. Mastery is **modelled per-fact per-user**, not counted as a score.
The consequence: adding astronomy, art history, anatomy, wildlife, or flags of
football clubs is a *content* task — a JSON pack and a template — not a rewrite.

> If you are ever about to hardcode a question, a country name, an XP value, or a
> user-facing string: **stop**. It belongs in data. See [§5.4](#54-nothing-is-hardcoded).

### Mission, vision, values

- **Mission** — Make world knowledge feel like an adventure, not homework.
- **Vision** — The default place a curious person goes to learn *anything visual*.
- **Values**
  1. **Curiosity over cramming.** We reward returning, not grinding.
  2. **Kind gamification.** Momentum, never manipulation. No dark patterns, ever.
  3. **Everyone can play.** Accessible and localised from commit one.
  4. **Truthful content.** Every fact is sourced and dated.
  5. **Respect the child.** Safety and privacy for under-13s is a product feature.

### Brand personality

Wondrous · warm · confident · playful-not-childish · a little cinematic.
Voice: an enthusiastic expedition guide who thinks you're capable.
Mascot: **Atlas**, a small robot explorer in a safari hat.

Copy rules: second person, present tense, ≤ 8 words in a button, never shame the
user for a wrong answer or a broken streak. Full voice guide:
[`docs/design/voice-and-tone.md`](docs/design/voice-and-tone.md).

### Target audience

Primary 10–24, secondary 25–45 (self-improvers, parents), tertiary teachers.
Eight personas in [`docs/product/personas.md`](docs/product/personas.md) — **every
feature must serve at least one persona by name.**

### North Star metric

> **Weekly Learning Days (WLD)** — the number of distinct days in the last 7 on which
> a user completed at least one lesson.

Not DAU, not session length. WLD rewards *habit* and cannot be inflated by grinding
or by dark patterns. Supporting metrics, guardrails, and the metric tree:
[`docs/product/metrics.md`](docs/product/metrics.md).

### What WorldQuest is not

- Not a trivia dump (Sporcle/JetPunk) — we schedule, we don't just test.
- Not a street-view guessing game (GeoGuessr) — we teach, then quiz.
- Not a classroom tool first (Kahoot) — classrooms are v2.0, not the wedge.
- Not endless (Duolingo's fatigue trap) — a lesson ends, and we say "that's enough".

---

## 2. Tech stack

Decisions and their alternatives are recorded as ADRs in [`docs/adr/`](docs/adr/).
**Do not change a stack element without adding an ADR.**

| Layer | Choice | Why | ADR |
|---|---|---|---|
| Language | **TypeScript 5.x**, `strict: true` everywhere | One language across app, engines, edge functions, scripts | [0001](docs/adr/0001-tech-stack.md) |
| App | **Expo (React Native)** + **expo-router** | iOS + Android + web from one codebase; OTA updates for content/liveops | [0001](docs/adr/0001-tech-stack.md) |
| Repo | **pnpm workspaces** monorepo + Turborepo | Engines must be importable by app, server, and tests | [0002](docs/adr/0002-monorepo.md) |
| Backend | **Supabase** (Postgres + Auth + RLS + Edge Functions + Storage) | Postgres-first, row-level security fits multi-role, no server to run | [0003](docs/adr/0003-backend-supabase.md) |
| Server logic | **Deno Edge Functions** for anything authoritative | XP, streaks, leagues, purchases must never be client-trusted | [0006](docs/adr/0006-server-authoritative-progress.md) |
| Scheduling | **FSRS** (Free Spaced Repetition Scheduler) | Modern, open, better retention/effort ratio than SM-2 | [0004](docs/adr/0004-spaced-repetition.md) |
| Client state | **Zustand** (session/UI) + **TanStack Query** (server) + **MMKV** (persistence) | See [§6](#6-state-management-rules) | [0007](docs/adr/0007-state-management.md) |
| Content | **JSON packs validated by Zod + JSON Schema** | Content is data; validation is CI | [0005](docs/adr/0005-content-as-data.md) |
| Maps | **react-native-svg** vector maps (not tiles) | Offline, themeable, tappable regions, tiny | [0008](docs/adr/0008-vector-maps.md) |
| Animation | **Reanimated 3** + **Lottie** for celebrations | 60fps on the UI thread; mockup is motion-heavy | — |
| i18n | **i18next** + ICU MessageFormat | Plurals/genders for sv/de/fr/pt | [0009](docs/adr/0009-localization.md) |
| Analytics | **PostHog** (self-hostable, EU region) | GDPR/COPPA posture; product analytics + flags | [0010](docs/adr/0010-analytics-and-privacy.md) |
| Errors | **Sentry** | Crash + performance | — |
| Payments | **RevenueCat** over StoreKit/Play Billing | Cross-platform entitlements, no receipt server | — |
| Testing | **Vitest** (engines) · **Jest + RNTL** (app) · **Maestro** (E2E) | See [`docs/engineering/testing-strategy.md`](docs/engineering/testing-strategy.md) | — |
| CI | **GitHub Actions** + **EAS Build/Submit** | — | — |

**Node 22 LTS · pnpm 9 · Expo SDK 52+.**

---

## 3. Folder structure

```
worldquest/
├── PROJECT.md                  ← you are here (the constitution)
├── CLAUDE.md                   ← how AI agents work in this repo
├── README.md
│
├── apps/
│   ├── mobile/                 Expo app — SCREENS AND NAVIGATION ONLY
│   │   ├── app/                expo-router file routes
│   │   │   ├── (tabs)/         home · explore · quests · profile · more
│   │   │   ├── (auth)/         onboarding · sign-in
│   │   │   ├── lesson/         the lesson runner (modal stack)
│   │   │   └── _layout.tsx
│   │   ├── src/
│   │   │   ├── features/       feature-first: one folder per product feature
│   │   │   │   └── <feature>/  components/ · hooks/ · api/ · store.ts
│   │   │   ├── components/     app-wide composites (not primitives)
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   └── providers/
│   │   └── assets/
│   └── web/                    (v2.0) marketing + teacher dashboard — Next.js
│
├── packages/
│   ├── engines/                ★ THE PLATFORM. Pure TS. No React. No I/O.
│   │   └── src/
│   │       ├── learning/       FSRS scheduler, mastery, item selection
│   │       ├── content/        template → question generation
│   │       ├── progress/       levels, region mastery, completion
│   │       ├── xp/             XP + coin award tables and validation
│   │       ├── quests/         daily/weekly quest generation + evaluation
│   │       ├── achievements/   rule evaluation over an event stream
│   │       ├── leagues/        cohorting, promotion, demotion
│   │       └── shared/         result types, rng (seeded), clock (injected)
│   ├── content/                data-as-content
│   │   ├── schema/             JSON Schema + Zod for packs
│   │   ├── packs/<subject>/    geography/countries.json, flags.json …
│   │   └── scripts/            validate · lint-facts · build-index
│   ├── design/                 tokens.json → tokens.ts + primitives
│   │   └── src/primitives/     Button, Card, Sheet, Progress, Chip …
│   ├── i18n/                   locales/<lang>/<namespace>.json + typed keys
│   ├── analytics/              event registry (typed) + tracker interface
│   ├── api/                    generated Supabase types + typed client
│   └── config/                 eslint · tsconfig · prettier — shared
│
├── supabase/
│   ├── migrations/             timestamped SQL, forward-only
│   ├── functions/              edge functions (authoritative logic)
│   └── seed/
│
├── docs/                       product · design · systems · engineering · adr
└── .claude/                    agents · skills · commands · settings
```

### The dependency rule (enforced in CI)

```
apps/*  →  packages/*        ✅
packages/design → engines    ❌  never
packages/engines → React/RN  ❌  never
packages/engines → network   ❌  never (inject a port)
packages/* → apps/*          ❌  never
```

`packages/engines` must run in a Node test with no mocks, no DOM, no clock, no
randomness. Time and randomness are **injected** (`Clock`, `Rng`). This is what makes
the platform testable and reusable — protect it.

---

## 4. Naming conventions

### Files & folders

| Thing | Convention | Example |
|---|---|---|
| Folders | `kebab-case` | `daily-quest/` |
| React components | `PascalCase.tsx` | `QuestCard.tsx` |
| Hooks | `useThing.ts` | `useStreak.ts` |
| Non-component TS | `kebab-case.ts` | `fsrs-scheduler.ts` |
| Tests | `<name>.test.ts` next to source | `fsrs-scheduler.test.ts` |
| expo-router routes | `kebab-case`, groups in `(parens)` | `app/(tabs)/explore.tsx` |
| SQL migrations | `<utc>_<verb>_<subject>.sql` | `20260801120000_create_user_facts.sql` |
| Content packs | `<subject>.<topic>.v<n>.json` | `geography.countries.v1.json` |

### Code

| Thing | Convention | Example |
|---|---|---|
| Types & interfaces | `PascalCase`, **no `I` prefix** | `LessonItem` |
| Functions & vars | `camelCase` | `scheduleNextReview()` |
| Constants | `SCREAMING_SNAKE` | `MAX_HEARTS` |
| Booleans | `is/has/can/should` | `isMastered`, `canPromote` |
| Event handlers | `handleX` (impl) / `onX` (prop) | `onPressContinue` |
| Zustand stores | `use<Domain>Store` | `useLessonStore` |
| Query keys | `['domain', 'entity', id]` | `['progress','country','JP']` |
| Enums | prefer string union types | `type Mastery = 'new' \| 'learning' \| …` |

### Stable IDs (never renumber, never reuse — they ship in analytics and saves)

| Entity | Format | Example |
|---|---|---|
| Country / region | **ISO 3166-1 alpha-2** | `JP`, `SE` |
| Fact | `<subject>.<entity>.<attribute>` | `geo.JP.capital` |
| Question template | `tpl.<skill>.<variant>` | `tpl.flag-to-country.mc4` |
| Lesson item | `<factId>@<templateId>` | `geo.JP.capital@tpl.capital.mc4` |
| Achievement | `ach.<category>.<slug>` | `ach.flags.collector-100` |
| Quest | `quest.<cadence>.<slug>` | `quest.daily.tap-the-country` |
| Analytics event | `object_action` snake_case | `lesson_completed` |
| i18n key | `<namespace>:<screen>.<element>` | `home:greeting.evening` |
| Feature flag | `ff_<area>_<name>` | `ff_liveops_worldcup` |

---

## 5. Coding standards

### 5.1 TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- **`any` is banned.** `unknown` + a Zod parse at every boundary (network, storage,
  content packs, deep links, push payloads).
- Prefer `type` over `interface` except for declaration merging.
- Model illegal states out of existence: discriminated unions over optional-field soup.
- Public functions in `packages/engines` are **pure**: same inputs → same output.
  No `Date.now()`, no `Math.random()` — take a `Clock` and an `Rng`.
- Errors that a user can hit are **values**, not throws: `Result<T, AppError>`.
  Throw only for programmer error.

### 5.2 React / React Native

- Function components only. One exported component per file.
- Composition over props explosion. If a component takes > 8 props, split it.
- Screens are **thin**: fetch, compose, delegate. Business logic lives in engines or
  hooks — never in JSX.
- No inline styles with literal values. `StyleSheet.create` + tokens only.
- Every list is virtualised (`FlashList`). Every image has a `contentFit` and a
  placeholder.
- Cleanup every effect. Cancel every request. Abort on unmount.

### 5.3 Comments

Explain **why**, never **what**. A comment restating the code is deleted in review.
Do document: non-obvious pedagogy, an economy constant's rationale, a platform
workaround (with a link), and anything a future contributor would otherwise "fix".

### 5.4 Nothing is hardcoded

Four things may **never** be literals in a component or engine:

1. **Copy** → `t('home:greeting.evening')` ([`packages/i18n`](packages/i18n))
2. **Colors / spacing / radii / durations** → design tokens ([§8](#8-design-system))
3. **Content** (countries, facts, questions) → content packs
4. **Economy numbers** (XP, coins, hearts, thresholds) → the balance table in
   [`docs/systems/xp-economy.md`](docs/systems/xp-economy.md), mirrored in
   `packages/engines/src/xp/balance.ts` and validated server-side.

CI fails on a hardcoded hex colour, a raw user-facing string, or a magic economy number.

### 5.5 Performance budgets

| Budget | Target |
|---|---|
| Cold start → interactive Home | < 2.0 s (mid-tier Android) |
| Lesson item transition | < 100 ms |
| Frame rate during animation | ≥ 58 fps |
| JS bundle (mobile, initial) | < 4 MB |
| Offline lesson start | works with **zero** network |

---

## 6. State management rules

Four kinds of state. Put each in exactly one place.

| Kind | Tool | Rule |
|---|---|---|
| **Server state** (progress, leagues, friends, content index) | **TanStack Query** | Never copy into Zustand. Query is the cache. Key by `['domain','entity',id]`. |
| **Session/UI state** (lesson in progress, modal, filters) | **Zustand** slice per feature | Small, flat, actions colocated. No derived data in state — derive in selectors. |
| **Durable local state** (settings, cached packs, offline queue) | **MMKV** via a typed repository | Always versioned + migrated. Never read MMKV directly from a component. |
| **Ephemeral component state** | `useState` | If two siblings need it, lift it *one* level — then reconsider. |

### Non-negotiables

1. **The lesson runner is a state machine.** `idle → loading → presenting → answered
   → feedback → next → summary`, plus `paused` and `abandoned`. Implemented in
   `packages/engines`, driven by the screen. No ad-hoc booleans.
2. **Optimistic UI, authoritative server.** The client may *show* +10 XP instantly; the
   server recomputes and reconciles. On mismatch the server wins, silently, and we log
   `xp_reconciliation_mismatch`.
3. **Offline-first writes.** Every progress mutation is enqueued as an idempotent
   event (`{id, type, payload, clientTs}`) and replayed on reconnect. Idempotency key
   = client-generated UUID. Duplicated replays must be harmless.
4. **One source of truth per fact.** If a value can be derived (level from XP, mastery
   from FSRS state), derive it. Never store both.
5. **No global mutable singletons** except the injected `Clock`, `Rng`, `Analytics`,
   and `Logger` — all provided through a provider so tests can swap them.

---

## 7. UI principles

Distilled from the mockup ([`docs/design/assets/mockup-v1.png`](docs/design/assets/mockup-v1.png)).

1. **Night-sky canvas, glowing content.** Deep navy gradient background; content
   floats on it as softly-lit, rounded cards. Light comes from the content, not a
   light theme.
2. **One primary action per screen.** The green button. If two things look primary,
   one of them is wrong.
3. **Colour carries meaning, never decoration.**
   Green = progress/correct · Blue = navigate/start · Gold = reward/premium ·
   Orange = streak · Red = hearts/destructive.
4. **Always answer "how far along am I?"** Every list, country, continent, and
   collection shows a progress bar or `n / total`. The mockup does this on 9 of 15
   screens — match it.
5. **Celebrate the moment, then get out of the way.** Confetti + haptic + sound on a
   correct answer, ≤ 900 ms, then Continue. Celebration never blocks the next tap.
6. **Thumb-first.** Primary actions live in the bottom third. Nothing critical within
   44 pt of the top edge.
7. **Five tabs, forever.** Home · Explore · Quests · Profile · More. New features
   find a home inside these — they do not add a tab.
8. **Every screen has five states.** Content, loading (skeleton, not spinner), empty,
   error, offline. A screen without all five is not done ([§12](#12-definition-of-done)).
9. **Motion is physical.** Things scale and spring; they don't fade in place.
   Respect `prefers-reduced-motion` — always.
10. **Never punish.** A wrong answer shows the right one and moves on. A lost streak
    offers a repair, not a lecture.

---

## 8. Design system

Full spec: [`docs/design/design-system.md`](docs/design/design-system.md).
Machine-readable: `packages/design/tokens.json` → generated `tokens.ts`.
**Colour values below were sampled from the mockup.**

### 8.1 Colour

```
Background     space.900  #00050F   page base / splash
               space.800  #001227   app background
               space.700  #052342   gradient top
Surface        surface.1  #0A1F3C   card
               surface.2  #102A4D   elevated card / sheet
               surface.3  #16375C   pressed / hover
               border     #1B3A63   hairline (1px, 40% opacity)
Brand          blue.500   #1E86E8   primary navigation action
               blue.600   #1467C4   pressed
Success        green.500  #22A73A   Continue / correct
               green.400  #4FCB5C   progress fill
               green.300  #73DD5A   progress fill (highlight)
Reward         gold.500   #F5A61E   XP, coins, trophies, premium
               gold.600   #E08A22
Streak         flame.500  #FF6A14   streak flame
Danger         red.500    #E5252A   hearts
               red.700    #B01216   destructive (Log Out)
Text           text.1     #FFFFFF
               text.2     #9FB3D1   secondary
               text.3     #6B82A6   tertiary / disabled
```

Continent identity colours (Explore): Europe `#4C7BF3` · Asia `#F59E3C` ·
Africa `#F2C230` · N. America `#3FBF8F` · S. America `#E0663D` · Oceania `#39C0D6` ·
Antarctica `#A7C7E7`.

**Rules** — semantic names only in code (`color.action.primary`, never `blue.500`).
Every text/background pair ≥ **4.5:1** (WCAG AA); large text ≥ 3:1. Never encode
meaning in hue alone — pair with an icon or label (colour-blind safety).

### 8.2 Spacing — 8-point grid

`space.0 0 · 1 4 · 2 8 · 3 12 · 4 16 · 5 24 · 6 32 · 7 40 · 8 48 · 9 64`
Screen gutter `space.4 (16)`. Card padding `space.4`. Section gap `space.5 (24)`.
4 px only for icon↔label pairs. **No other values exist.**

### 8.3 Radius

`sm 8 (chips) · md 12 (buttons, inputs) · lg 16 (cards) · xl 20 (hero cards,
sheets) · 2xl 28 (modals) · full 999 (pills, avatars)`

### 8.4 Elevation

Dark UI: elevation = **surface lightness + glow**, not black shadows.

| Level | Surface | Glow |
|---|---|---|
| 0 flat | `surface.1` | none |
| 1 card | `surface.1` | `0 2 8 rgba(0,0,0,.35)` |
| 2 raised | `surface.2` | `0 6 16 rgba(0,0,0,.45)` |
| 3 sheet/modal | `surface.2` + 1px `border` | `0 12 32 rgba(0,0,0,.55)` |
| accent | — | `0 0 24 rgba(30,134,232,.35)` for the primary CTA |

### 8.5 Typography

Display/headings **Baloo 2** (rounded, friendly) · UI/body **Inter** ·
numerals tabular for scores and timers.

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `display` | 34 / 40 | 700 | "Explore. Learn. Conquer." |
| `h1` | 28 / 34 | 700 | Screen titles |
| `h2` | 22 / 28 | 700 | Section headers |
| `h3` | 18 / 24 | 600 | Card titles |
| `body` | 16 / 24 | 400 | Default |
| `bodyStrong` | 16 / 24 | 600 | Answers, list rows |
| `caption` | 13 / 18 | 500 | Metadata, `172 / 195` |
| `overline` | 11 / 14 | 700 · +0.08em · UPPER | Tab labels, badges |

Scales with OS text size to **200 %** without clipping. Never below 13 pt.

### 8.6 Motion

| Token | ms | Curve | Use |
|---|---|---|---|
| `instant` | 100 | `easeOut` | Press feedback (scale .96) |
| `quick` | 180 | `easeOut` | Chips, toggles, tab switch |
| `base` | 260 | `easeInOut` | Screen transitions, sheets |
| `expressive` | 420 | `spring(damping .7, stiffness 180)` | Card entrance, mascot |
| `celebrate` | 900 | Lottie | Correct answer, level up |

Reduced motion: durations → 0, springs → fades, Lottie → static end frame.

### 8.7 Components (the starting set)

`Button` (primary/secondary/ghost/destructive × sm/md/lg × default/pressed/disabled/loading) ·
`Card` · `ProgressBar` · `StatPill` · `AnswerOption` (idle/selected/correct/wrong/disabled) ·
`FlagTile` · `CountryTile` · `LandmarkTile` · `AchievementRow` · `LeagueRow` ·
`StreakFlame` · `HeartBar` · `XpChip` · `CoinChip` · `TabBar` · `Sheet` · `Skeleton` ·
`EmptyState` · `ErrorState` · `OfflineBanner` · `MascotBubble`.

Every component ships with: all states, a Storybook story, an a11y label strategy,
and RTL support.

---

## 9. Database schema

Postgres (Supabase). Full DDL, indexes, and RLS policies:
[`docs/engineering/data-model.md`](docs/engineering/data-model.md).
Migrations are **forward-only** and live in `supabase/migrations/`.

### 9.1 Principles

- **Content is not in the database.** Content packs ship with the app and via CDN;
  the DB stores only *references to content IDs* and *user state*.
- **Every user table has RLS.** Default deny. A policy per role.
- **All progress writes go through an Edge Function.** Clients have no `INSERT` on
  `xp_ledger`, `user_facts`, or `league_members`.
- Timestamps are `timestamptz`, always UTC. Streaks use the user's stored IANA
  timezone, evaluated server-side.
- Soft-delete users (`deleted_at`) then hard-purge via job — GDPR erasure with a
  30-day undo.

### 9.2 Core tables

```sql
-- identity & roles ---------------------------------------------------------
profiles           id (uuid, = auth.users) · handle · display_name · avatar_id
                   locale · timezone · birth_year · role · is_child_account
                   created_at · deleted_at
roles              enum: guest|user|premium|teacher|parent|admin|moderator|support
entitlements       user_id · product (premium|family|classroom) · source
                   expires_at · rc_customer_id

-- the learning engine (the heart) -----------------------------------------
user_facts         user_id · fact_id · stability · difficulty · reps · lapses
                   last_review_at · due_at · mastery · avg_ms · streak_correct
                   PRIMARY KEY (user_id, fact_id)          -- the FSRS state
review_log         id · user_id · fact_id · template_id · rating(1-4)
                   elapsed_ms · was_correct · session_id · created_at
                   -- append-only; the source of truth for re-deriving user_facts

-- sessions -----------------------------------------------------------------
lessons            id · user_id · kind(lesson|quest|review|challenge)
                   topic_id · started_at · completed_at · items · correct
                   xp_awarded · coins_awarded · hearts_lost · client_version

-- economy (ledgers, never mutable balances) --------------------------------
xp_ledger          id · user_id · amount · reason · ref_id · created_at
coin_ledger        id · user_id · amount · reason · ref_id · created_at
wallets            user_id · coins · gems · hearts · hearts_updated_at  -- MV/cache

-- progression ---------------------------------------------------------------
streaks            user_id · current · longest · last_active_date · freezes
                   repair_available_until
achievements_user  user_id · achievement_id · progress · unlocked_at · tier
collections_user   user_id · collection_id · owned_ids[] · completed_at
region_mastery     user_id · region_id · mastered_facts · total_facts · pct

-- social & liveops ----------------------------------------------------------
leagues            id · tier · season_id · created_at
league_members     league_id · user_id · xp_week · rank · promoted
friendships        user_id · friend_id · status · created_at
quests_user        user_id · quest_id · date · progress · completed_at
events_liveops     id · slug · starts_at · ends_at · config jsonb

-- classrooms / family (v2.0) ------------------------------------------------
orgs               id · kind(classroom|family) · owner_id · name
org_members        org_id · user_id · member_role
assignments        id · org_id · topic_id · due_at · config jsonb
```

### 9.3 Indexes that matter on day one

```sql
create index on user_facts (user_id, due_at) where mastery <> 'burnished';
create index on review_log (user_id, created_at desc);
create index on xp_ledger  (user_id, created_at desc);
create index on league_members (league_id, xp_week desc);
```

### 9.4 The one query the app lives on

"Give me the next N items for this user" = due `user_facts` (ordered by `due_at`)
∪ new facts from the current topic, weighted 60 / 30 / 10 (due / new / struggling).
It must return in **< 50 ms at p95**. If it doesn't, the app feels dead.

---

## 10. Feature roadmap

Full detail, exit criteria, and cut-lines: [`docs/product/roadmap.md`](docs/product/roadmap.md).

### Phase 0 — Foundations *(current, no product code)*
Product bible · personas · competitor teardowns · IA · design system · engine specs ·
this file · `.claude/` tooling. **Exit:** every doc in `docs/` written and reviewed.

### Phase 1 — Walking skeleton *(2 weeks)*
One vertical slice, end to end, ugly-but-real: sign-in → one lesson of 5 flag items →
FSRS write → XP ledger → progress on Home. Proves the architecture.
**Exit:** a real answer changes a real `due_at` on a real server.

### v1.0 — MVP *(the mockup, shipped)*
Screens 1–8, 10, 15 of the mockup. Countries · flags · capitals · lesson runner ·
daily quest · streaks · XP + coins · hearts · Explore globe · country pages · settings ·
offline lessons · en + sv · **Premium subscription**.
**Exit:** D7 retention ≥ 25 % in beta; WLD ≥ 3.0.

> **Premium moved from v2.0 to v1.0** — a deliberate change, recorded rather than made
> quietly. Retrofitting monetisation is not a feature bolt-on: the paywall's placement
> depends on where the value moment is, the entitlement has to be server-authoritative
> from the first migration, and a subscription added after launch cannot be offered to
> the users who installed before it. What did **not** move is Rule 1 of
> [`monetization.md`](docs/systems/monetization.md): Premium sells depth, never access.
> Every lesson is free in v1.0 and stays free, so WLD and D7 above are unaffected by
> it. Family mode and the teacher tier remain v2.0.

### v1.5 — Depth
Landmarks (screen 11) · collections · achievements (screen 14) · friend challenges ·
weekly quests · avatar customisation (the first real coin sink).

### v2.0 — Social & business
Leagues + seasons (screen 12) · seasonal live-ops · Family mode ·
Teacher/classroom mode · es/de/fr/pt. *(Premium itself ships in v1.0 — see above.)*

### v3.0 — Beyond geography *(the thesis pays off)*
History · culture · food · wildlife · UNESCO · AI-generated explanations for wrong
answers. Delivered as **content packs**, not new code.

### v4.0 — Platform
Space · economics · geology · climate · custom learning paths · community-authored
packs with moderation.

---

## 11. Git workflow

### Branches

```
main                     always releasable, protected, linear history
feat/<area>-<slug>       feat/lesson-runner-state-machine
fix/<area>-<slug>
chore/… docs/… refactor/… content/…
claude/<topic>-<id>      AI-agent working branches
release/v<x.y.z>
```

Never commit to `main`. Never force-push a shared branch. Rebase your own branch
freely before review; merge with **squash** into `main`.

### Commits — Conventional Commits

```
<type>(<scope>): <imperative summary ≤ 72 chars>

Why this change exists. What it does not do. Links.

Refs: #123
```

`type` ∈ `feat|fix|docs|style|refactor|perf|test|build|ci|chore|content|revert`
`scope` ∈ `mobile|engines|content|design|i18n|analytics|api|db|docs|ci`

### Pull requests

- Small (< 400 changed lines) and single-purpose. Draft early.
- Title = the commit title. Body = what/why/how-tested/screenshots.
- **UI changes require before/after screenshots (light-load *and* reduced-motion).**
- CI must be green: typecheck · lint · unit · content validation · a11y lint ·
  i18n key check · bundle-size.
- One approving review. Author merges.
- Every PR states which **personas** it serves and which **Definition of Done** items
  are ticked.

### Releases

SemVer. Content-only and copy-only changes ship as **EAS Update** (OTA); anything
touching native code ships as a store build. Tag `v1.2.0`, generate the changelog
from commits, run the ship checklist (`/wq-ship-check`).

---

## 12. Definition of done

A feature is **not done** until every line is true. No exceptions, no "we'll do it in
a follow-up" — the follow-up never comes.

**Function**
- [ ] Works on iOS and Android, phone and tablet, smallest supported device.
- [ ] All five screen states exist: content · loading (skeleton) · empty · error · offline.
- [ ] Offline behaviour defined and implemented (queue, cache, or explicit block).
- [ ] Server-authoritative for anything rewarding; client cannot forge it.

**Quality**
- [ ] Unit tests for engine logic; component tests for interactive UI.
- [ ] No new `any`, no new `@ts-expect-error`, no new lint suppressions.
- [ ] Performance budget met ([§5.5](#55-performance-budgets)); no dropped frames on
      a mid-tier Android.
- [ ] Error paths logged to Sentry with actionable context.

**Craft**
- [ ] Uses design tokens only — zero hardcoded colours, spacing, radii, durations.
- [ ] Motion implemented with the right token; reduced-motion path verified.
- [ ] Haptics on every meaningful outcome (correct, wrong, unlock, level-up).
- [ ] Sound respects the Settings toggle.

**Inclusion**
- [ ] Every string is an i18n key; `en` and `sv` provided; no string concatenation.
- [ ] Screen-reader labels, roles, and focus order verified (VoiceOver + TalkBack).
- [ ] Contrast ≥ 4.5:1; touch targets ≥ 44×44 pt; colour never the sole signal.
- [ ] Layout survives 200 % text size and RTL.

**Product**
- [ ] Analytics events fired per [`docs/engineering/analytics-spec.md`](docs/engineering/analytics-spec.md).
- [ ] Serves a named persona; consistent with the Product Bible.
- [ ] Copy reviewed against the voice guide; no shaming, no dark patterns.
- [ ] Docs updated — including this file if a rule changed.

---

### Where to go next

| I want to… | Read |
|---|---|
| Understand the product | [`docs/product/product-bible.md`](docs/product/product-bible.md) |
| Build a screen | [`docs/design/design-system.md`](docs/design/design-system.md) + `/wq-new-screen` |
| Understand scheduling | [`docs/systems/learning-engine.md`](docs/systems/learning-engine.md) |
| Add content | [`docs/systems/content-pipeline.md`](docs/systems/content-pipeline.md) + `/wq-new-content-pack` |
| Change XP or coins | [`docs/systems/xp-economy.md`](docs/systems/xp-economy.md) |
| Work with Claude here | [`CLAUDE.md`](CLAUDE.md) |
| Know what to build first | [`docs/plan/build-order.md`](docs/plan/build-order.md) |
