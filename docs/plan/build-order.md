# Build order

What to build, in what order, and — more importantly — **why that order**.

The principle throughout: **build the thing that would most change your plan if it
turned out to be wrong.** That's why the walking skeleton comes before any polish, and
why the content pipeline comes before the content.

---

## Now → Week 2: finish Phase 0

Documentation is done (that's this repo). What remains is the decisions that need a
human:

1. **Confirm the stack** — read [`../adr/`](../adr/) and either accept or open a
   counter-ADR. Everything downstream assumes it.
2. **Licensing reality check** — flags, map geometry, landmark photography. This can
   change the product (illustrated vs photographic landmarks), so decide early. See
   [`../engineering/security-privacy.md §11`](../engineering/security-privacy.md#11-content-licensing).
3. **Verify the competitor pricing marked `TODO(verify)`** before any of it is used
   externally.
4. **Name the beta cohort** — recruit by persona, not by convenience.

**Exit:** [`phase-0-checklist.md`](phase-0-checklist.md) is fully ticked.

---

## Weeks 1–2: the walking skeleton

One vertical slice, end to end, deliberately ugly.

| # | Step | Proves |
|---|---|---|
| 1 | Monorepo, tooling, CI, `pnpm verify` | The build works before anything depends on it |
| 2 | `packages/engines/learning` — FSRS + tests | **The hardest logic, first, with no UI in the way** |
| 3 | `packages/content` — schema, validator, a 5-country pack | Content-as-data is real |
| 4 | Supabase: `profiles`, `user_facts`, `review_log`, `xp_ledger` + RLS + tests | The data model survives contact |
| 5 | `submit-lesson` edge function using the same engine module | Client and server cannot drift |
| 6 | Expo app: one lesson screen, no design | The loop is real |
| 7 | Optimistic write + offline queue + reconcile | **The hardest architectural problem, early** |
| 8 | An ugly Home screen showing real progress | The loop closes |

**Exit criteria** (from [`../product/roadmap.md`](../product/roadmap.md)) — all four,
especially: *adding a sixth flag requires editing one JSON file and nothing else.*

**Why this order.** The scheduler and the sync layer are the two things most likely to
be wrong in a way that invalidates everything built on top. Build them first, while
changing them is cheap. Screens are comparatively easy and comparatively disposable.

---

## Weeks 3–6: v1.0 wave 1 — the loop, properly

| Order | Work | Why here |
|---|---|---|
| 1 | Design tokens + primitives (`packages/design`) | Every screen after this is faster, and consistent by default |
| 2 | i18n plumbing + `en`/`sv` scaffolding | Adding it later means touching every screen |
| 3 | Analytics registry + tracker | Instrument as you build, not afterwards |
| 4 | **Lesson runner, designed** (screens 5, 6) | The screen users spend 80 % of their time on |
| 5 | Home (screen 3) | The daily entry point |
| 6 | Daily Quest (screen 4) | The reason to come back |
| 7 | Onboarding + taster (screens 1, 2) | **Built once the lesson is good enough to show a stranger** |
| 8 | Country page + continents (screens 7, 9) | Explore, cheapest version first |
| 9 | Settings (screen 15) | Boring, required, contains legal obligations |
| 10 | Hidden screens H1–H22 | The difference between a demo and a product |

**Onboarding comes seventh on purpose.** Onboarding sells the lesson; you cannot sell
a lesson you haven't built. Teams that build onboarding first end up rewriting it.

---

## Weeks 7–10: v1.0 wave 2 — the world

1. All 195 countries × core facts, sourced and reviewed *(the long pole — start in
   week 3 in parallel)*
2. Streaks + freeze + repair (server-side, timezone-aware, DST-tested)
3. Coins + the first sink *(if the shop slips, coins slip with it — never ship an
   unspendable currency)*
4. Flags collection (screen 10)
5. Profile (screen 13)
6. Explore globe (screen 8) — **the first cuttable item** if we're late
7. Offline pack download + cache
8. Push notifications (daily reminder + streak-at-risk only)
9. Full a11y pass, all screens
10. Performance pass on a mid-tier Android
11. **Subscriptions** — see [`monetization.md`](../systems/monetization.md). The client
    half is built (state machine, paywall, entitlement cache, Settings); what remains
    is a billing SDK behind `PurchasePort`, the `subscriptions` table with RLS, and the
    App Store Server Notification / Play RTDN handlers that write it. Ship the grace
    period with it, not after — it is a third of Android churn and it is invisible.

---

## Weeks 11–12: ship

Beta by persona → fix → staged rollout (5 → 25 → 50 → 100 %) → watch the guardrails.
`/wq-ship-check`.

---

## The parallel track

Two things run alongside everything above and are the most common cause of a slipped
launch:

**Content.** 195 countries × ~4 facts, each sourced, dated, licensed, and
second-author reviewed. This is weeks of work by a person who is not writing code.
**Start it in week 3.**

**Licensing.** Flags are mostly fine; landmark photography is not. Resolve it before
v1.5 planning, and treat "illustrated landmarks instead" as a live option — it's
cheaper, cleaner, and more on-brand.

---

## Sequencing rules

1. **Hardest-to-change first.** Data model, scheduler, sync. Screens are cheap; a
   schema is not.
2. **Vertical before horizontal.** One thing working end to end beats five things half
   built — and it's the only way to find integration problems early.
3. **Instrument as you build.** Analytics added later is analytics that measures the
   wrong thing.
4. **Accessibility and i18n as you build.** Both cost ~5× to retrofit.
5. **Content in parallel, from week 3.** It's the long pole and it doesn't need code.
6. **Polish last, but budget for it.** Reserve the final 20 % of the schedule for
   feel: motion, haptics, sound, empty states. It's what makes the difference between
   4.2 stars and 4.7.

## What to cut if you're late

In order:

1. The 3D globe (fall back to the continent grid — screen 9 already works)
2. Coins and the shop (XP only — defer both together)
3. Landmark content (already v1.5)
4. Swedish (ship `en`, keep the i18n plumbing — **never remove the plumbing**)
5. The activity graph on Profile

**Never cut:** offline · accessibility · i18n plumbing · server-authoritative rewards ·
content sourcing. Each costs several times more to add later, and the last one is a
correctness issue, not a feature.

---

## The first week, concretely

If you're starting Monday:

| Day | Do |
|---|---|
| Mon | Read `PROJECT.md` and `learning-engine.md` end to end. Scaffold the monorepo, CI, `pnpm verify`. |
| Tue | `packages/engines/learning`: types, FSRS, tests. Nothing else. |
| Wed | Finish the engine to ≥ 90 % coverage, including property tests. |
| Thu | `packages/content`: schema, validator, a 5-country pack, `content:preview`. |
| Fri | Supabase project, first migrations, RLS + RLS tests. |

**No UI in week one.** That's deliberate, and it will feel wrong. By Friday you'll have
a tested learning engine and a real database — which is the part that determines
whether this is a geography app or a learning platform.
