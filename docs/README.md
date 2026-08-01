# WorldQuest documentation

Start with [`../PROJECT.md`](../PROJECT.md). These documents are the depth behind it.

Everything here is **living**. A code change that invalidates a doc updates the doc in
the same PR. If a doc and the code disagree, that is a bug in one of them — decide
which, and fix it the same day.

---

## Product — *what we're building and for whom*

| Doc | What it settles |
|---|---|
| [`product/product-bible.md`](product/product-bible.md) | Mission, vision, values, principles, brand, the non-negotiables. **The reference for every decision.** |
| [`product/personas.md`](product/personas.md) | The eight people we build for. Every feature serves one by name. |
| [`product/competitive-research.md`](product/competitive-research.md) | 14 competitor teardowns → where WorldQuest is meaningfully different |
| [`product/information-architecture.md`](product/information-architecture.md) | The whole product map, not just screens |
| [`product/screen-catalog.md`](product/screen-catalog.md) | All 15 mockup screens + the 20 "hidden" screens teams forget |
| [`product/roadmap.md`](product/roadmap.md) | Phase 0 → v4.0, with exit criteria and cut-lines |
| [`product/metrics.md`](product/metrics.md) | North Star, metric tree, guardrails, what we refuse to optimise |
| [`product/mvp-brief-original.md`](product/mvp-brief-original.md) | The original founder brief that started all of this |

## Design — *how it looks, moves and feels*

| Doc | What it settles |
|---|---|
| [`design/design-system.md`](design/design-system.md) | Colour, spacing, radius, elevation, type, motion, icons, components |
| [`design/voice-and-tone.md`](design/voice-and-tone.md) | How WorldQuest talks, including when you fail |
| [`design/accessibility.md`](design/accessibility.md) | The a11y contract — built in, not retrofitted |
| [`design/asset-prompts.md`](design/asset-prompts.md) | Copy-paste generation prompts for every asset — and what must never be generated |
| [`design/mockup-fidelity.md`](design/mockup-fidelity.md) | How close the build is to the mockup, and which differences are deliberate |
| [`design/assets/mockup-v1.png`](design/assets/mockup-v1.png) | The v1.0 visual target |

## Systems — *the game and learning machinery*

| Doc | What it settles |
|---|---|
| [`systems/learning-engine.md`](systems/learning-engine.md) | FSRS scheduling, mastery states, item selection. **The most important doc here.** |
| [`systems/content-pipeline.md`](systems/content-pipeline.md) | Fact → template → generated question → lesson |
| [`systems/xp-economy.md`](systems/xp-economy.md) | XP, coins, gems, hearts — sources, sinks, balance table |
| [`systems/progression.md`](systems/progression.md) | Ten parallel progression systems and why |
| [`systems/achievements.md`](systems/achievements.md) | ~300 achievements, taxonomy, tiers, rule engine |
| [`systems/quests-and-liveops.md`](systems/quests-and-liveops.md) | Daily/weekly/seasonal content calendar |
| [`systems/social-and-leagues.md`](systems/social-and-leagues.md) | Friends, challenges, leagues, seasons, anti-toxicity |
| [`systems/notifications.md`](systems/notifications.md) | Invitations, not pressure — with a hard frequency budget |

## Engineering — *how it's built*

| Doc | What it settles |
|---|---|
| [`engineering/architecture.md`](engineering/architecture.md) | The 13 modules, ports & adapters, offline-first |
| [`engineering/data-model.md`](engineering/data-model.md) | Full DDL, indexes, RLS policies, migration rules |
| [`engineering/analytics-spec.md`](engineering/analytics-spec.md) | The event taxonomy — decided *before* launch |
| [`engineering/localization.md`](engineering/localization.md) | i18n from the first commit |
| [`engineering/security-privacy.md`](engineering/security-privacy.md) | Roles, RLS, anti-cheat, GDPR, COPPA, licensing |
| [`engineering/testing-strategy.md`](engineering/testing-strategy.md) | The pyramid, what we test, what we don't |
| [`engineering/definition-of-done.md`](engineering/definition-of-done.md) | The checklist, with the reasoning behind each line |

## Decisions — *why it's built that way*

[`adr/`](adr/) — Architecture Decision Records. One file per irreversible-ish choice,
with the alternatives we rejected and what would make us reconsider.
**Changing a stack element requires a new ADR.**

## Plan — *what happens next*

| Doc | What it settles |
|---|---|
| [`plan/build-order.md`](plan/build-order.md) | The sequence, with reasoning. Start here on Monday. |
| [`plan/phase-0-checklist.md`](plan/phase-0-checklist.md) | Live status of the foundations |
| [`plan/asset-independent-work.md`](plan/asset-independent-work.md) | Everything buildable before a single illustration exists — live status |
| [`plan/risks.md`](plan/risks.md) | What kills this project, and the mitigation for each |

---

## Reading paths

**New engineer** → `PROJECT.md` → `architecture.md` → `learning-engine.md` →
`design-system.md` → `build-order.md`

**New designer** → `product-bible.md` → `personas.md` → `design-system.md` →
`screen-catalog.md` → `accessibility.md`

**Deciding whether to build something** → `product-bible.md` → `personas.md` →
`roadmap.md` → `metrics.md`

**AI agent** → [`../CLAUDE.md`](../CLAUDE.md), then the skill for the task
