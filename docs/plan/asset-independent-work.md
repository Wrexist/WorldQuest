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
| A4 | **TanStack Query + MMKV persistence** | Server state has one owner (PROJECT.md §9). Retrofitting it after six screens read Supabase directly is the expensive version. | ⬜ |

## Track B — screens that need no art

Ordered by [`build-order.md`](build-order.md) weeks 3–6, minus anything gated on
illustration. Each is a mockup screen or a hidden screen from
[`../product/screen-catalog.md`](../product/screen-catalog.md).

| # | Screen | Art needed? | State |
|---|---|---|---|
| B1 | **Settings** (#15) | None — it's rows and switches | ✅ |
| B2 | **Continents** (#9) | None — the continent grid is colour + type | ✅ *(plus `/region/[code]`, the country list inside one)* |
| B3 | **Country page** (#7) | Flag only, and flags are *sourced, never generated* | ⬜ |
| B4 | **Daily Quest** (#4) | `ArtSlot` covers it | ⬜ |
| B5 | **Profile** (#13) | Avatar → initials fallback already exists | ⬜ |
| B6 | **Hidden screens H1–H22** | None — these are states, not pictures | ⬜ |

Deliberately **not** here: Onboarding (#1–2) and the Explore globe (#8). Onboarding is
the app's first impression and is the one place placeholder art actively misleads;
the globe needs map geometry, which is an unresolved licensing decision
([`phase-0-checklist.md`](phase-0-checklist.md)).

## Track C — engines (pure, testable, zero UI)

| # | Work | Notes | State |
|---|---|---|---|
| C1 | **Achievements rule engine** | ~300 achievements evaluated from a ledger, not from booleans sprinkled through screens. Spec: [`../systems/achievements.md`](../systems/achievements.md) | ⬜ |
| C2 | **Quest engine** | Daily/weekly generation, progress, expiry. Spec: [`../systems/quests-and-liveops.md`](../systems/quests-and-liveops.md) | ⬜ |
| C3 | **Progression / region mastery** | Roll fact mastery up to country → region → continent → world | ✅ |
| C4 | **Streak freeze + repair** | The streak logic exists; freezes and repair don't | ⬜ |

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
| E1 | Component tests (React Native Testing Library) for every screen's five states | ⬜ |
| E2 | Maestro E2E: first launch → taster lesson → progress persists | ⬜ |
| E3 | CI: run the Supabase RLS tests and the edge-function bundle guard on every PR | ⬜ |
| E4 | Wire the `en-XA` pseudo-locale into a dev build — the generator exists (`pnpm i18n:pseudo`), loading it at runtime does not | ⬜ |

## Track F — the visual gap that isn't art

| # | Work | Notes | State |
|---|---|---|---|
| F1 | **Bundle Inter + Baloo 2** | Both OFL, both free. Loaded per weight — `fontFamily` + `fontWeight` does not combine for custom fonts on React Native, so this needed the `text()` helper and a guard, not just the files. | ✅ |
| F2 | **Card gradients** (`expo-linear-gradient`) | The mockup's cards are gradients; ours are flat fills | ⬜ |
| F3 | **Motion pass** | Springs, celebration, reduced-motion — all token-driven, no assets | ⬜ |

---

## What I'd do in what order

A1 → A2 → A3 → F1 → B1 → B2 → C1 → B4 → C2 → B5 → B3 → C3 → C4 → B6 → E1 → E2.

Track D runs in parallel from day one by someone who isn't writing code — that's the
rule from [`build-order.md`](build-order.md) and it hasn't changed.

**Live status of this list lives here.** Tick a row in the same PR that does the work.
