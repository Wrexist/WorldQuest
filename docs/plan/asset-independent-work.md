# Work that doesn't need artwork

Commissioning the assets in [`../design/asset-prompts.md`](../design/asset-prompts.md)
is a separate track that runs on its own clock. This is everything that can ship
**before a single illustration exists** — ordered so that each item unblocks the next
rather than by how interesting it is.

The rule that makes this possible: `ArtSlot` already reserves the right space at the
right size on every card. Real artwork is a one-line swap, not a redesign. So build
against the slot, and the art arrives into a finished app instead of a half-built one.

---

## Track A — the shell (blocks Track B entirely)

| # | Work | Why it's first | State |
|---|---|---|---|
| A1 | **expo-router `app/` tree + five tabs** | `apps/mobile/package.json` already declared `main: expo-router/entry` with no `app/` directory — the app could not boot. Every screen in Track B needs somewhere to live. | ✅ |
| A2 | **Real i18next, typed keys** | `src/lib/i18n.ts` was a hand-written shim, and `packages/i18n` declared a `types` script whose file did not exist. Every screen built before this is a screen to revisit. | ✅ |
| A3 | **Wire `packages/api` into the app** | Anonymous session on launch, generated DB types, `submitLesson` on the real queue, progress read on Home. | ✅ *(code complete — the two ⚠️ Phase 1 exit criteria still need one run on a machine whose proxy allows the Supabase host)* |
| A4 | **TanStack Query + MMKV persistence** | Server state has one owner (PROJECT.md §9). Cache persisted through MMKV, so a returning user sees real numbers in the first frame. | ✅ |

## Track B — screens that need no art

Ordered by [`build-order.md`](build-order.md) weeks 3–6, minus anything gated on
illustration. Each is a mockup screen or a hidden screen from
[`../product/screen-catalog.md`](../product/screen-catalog.md).

| # | Screen | Art needed? | State |
|---|---|---|---|
| B1 | **Settings** (#15) | None — it's rows and switches | ✅ |
| B2 | **Continents** (#9) | None — the continent grid is colour + type | ✅ *(plus `/region/[code]`, the country list inside one)* |
| B3 | **Country page** (#7) | Flag image is an `ArtSlot` until the sourced files land; the flag *description* is real content | ✅ |
| B4 | **Daily Quest** (#4) | None as built — the five tasks are type and progress | ✅ |
| B5 | **Profile** (#13) | Avatar → initials fallback already exists | ✅ |
| B6 | **Hidden screens H1–H22** | H8 (crash) and H9 (404) done — the two whose absence is a white screen. H6/H11/H15 already inline. The rest wait on accounts and social. | 🟡 |

Deliberately **not** here: Onboarding (#1–2) and the Explore globe (#8). Onboarding is
the app's first impression and is the one place placeholder art actively misleads;
the globe needs map geometry, which is an unresolved licensing decision
([`phase-0-checklist.md`](phase-0-checklist.md)).

## Track C — engines (pure, testable, zero UI)

| # | Work | Notes | State |
|---|---|---|---|
| C1 | **Achievements rule engine** | Six rule types, incremental, backfillable + a 12-definition starter catalogue (content) + the screen | ✅ |
| C2 | **Quest engine** | Daily generation, progress, expiry. Weekly quests are v1.5 and deliberately not built. | ✅ *(daily)* |
| C3 | **Progression / region mastery** | Roll fact mastery up to country → region → continent → world | ✅ |
| C4 | **Streak freeze + repair** | Freeze cap, 48-hour repair window, 30-day cooldown — all against the balance table, none invented | ✅ |

These are the highest-value items on the whole list per hour spent: they're pure
functions, they're where the product's behaviour actually lives, and they can't be
blocked by anything.

## Track D — content

| # | Work | Notes | State |
|---|---|---|---|
| D1 | **Beyond 5 countries** | The long pole. Every fact needs `source` + `verifiedAt`. Ship in continent-sized batches so progress is visible. | ⬜ |
| D2 | **More question templates** | Each new template multiplies across every fact already written | ⬜ |
| D3 | **Authoring ergonomics** | A generator + validator that makes a batch of 20 countries an afternoon, not a week | ⬜ |

## Track E — quality

| # | Work | State |
|---|---|---|
| E1 | Component tests for every screen's five states | ✅ *(all seven screens — 65 tests)* |
| E2 | Maestro E2E: first launch → taster lesson → progress persists | ⬜ |
| E3 | CI: RLS tests on a local stack, migrations from empty, economy health, and every generated file checked against its source | ✅ |
| E4 | `en-XA` pseudo-locale — `enablePseudoLocale()` builds it in memory from the English bundle at runtime, so it can never be stale | ✅ |

## Track F — the visual gap that isn't art

| # | Work | Notes | State |
|---|---|---|---|
| F1 | **Bundle Inter + Baloo 2** | Both OFL, both free. Loaded per weight — `fontFamily` + `fontWeight` does not combine for custom fonts on React Native, so this needed the `text()` helper and a guard, not just the files. | ✅ |
| F2 | **Card gradients** | Semantic `gradient.*` tokens, drawn by `Card`, with a flat fallback where there is no native module | ✅ |
| F3 | **Motion pass** | `useReducedMotion` / `useTiming` / `useCelebration`, all token-driven, with a guard against raw durations | ✅ |

---

## What I'd do in what order

~~A1 → A2 → A3 → F1 → B1 → B2 → C1 → B4 → C2 → C3 → C4~~ — done.

**Remaining:** the rest of B6 (gated on accounts and social) · E2 (Maestro) · D1–D3 (content).

E2 is deliberately last and deliberately not started here: a Maestro flow written
without ever running it against a device is a file full of guesses about selectors and
timing. It needs one session on a machine with a simulator, and until then writing it
would be the same false-green as a CI step that checks nothing.

The starter catalogue is 12 definitions, deliberately. The ~300 in
[`../systems/achievements.md`](../systems/achievements.md) arrive in batches once the
content packs are deep enough for them to be reachable — an achievement for 100 flags
is a locked row for everyone until there are 100 flags to master.

Track D runs in parallel from day one by someone who isn't writing code — that's the
rule from [`build-order.md`](build-order.md) and it hasn't changed.

**Live status of this list lives here.** Tick a row in the same PR that does the work.
