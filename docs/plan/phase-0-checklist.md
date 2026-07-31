# Phase 0 checklist

**Live status.** Update it in the same PR that changes the state.

Phase 0 exits when every line is ticked. Phase 1 does not start before that — this is
two weeks that saves six months.

---

## Documentation

| | Item | Doc |
|---|---|---|
| ✅ | The constitution | [`../../PROJECT.md`](../../PROJECT.md) |
| ✅ | AI agent operating manual | [`../../CLAUDE.md`](../../CLAUDE.md) |
| ✅ | Product bible | [`../product/product-bible.md`](../product/product-bible.md) |
| ✅ | Personas (8) | [`../product/personas.md`](../product/personas.md) |
| ✅ | Competitor teardowns (14) | [`../product/competitive-research.md`](../product/competitive-research.md) |
| ✅ | Information architecture | [`../product/information-architecture.md`](../product/information-architecture.md) |
| ✅ | Screen catalogue (15 + 22 hidden) | [`../product/screen-catalog.md`](../product/screen-catalog.md) |
| ✅ | Roadmap with exit criteria | [`../product/roadmap.md`](../product/roadmap.md) |
| ✅ | Metrics & North Star | [`../product/metrics.md`](../product/metrics.md) |
| ✅ | Design system | [`../design/design-system.md`](../design/design-system.md) |
| ✅ | Voice & tone | [`../design/voice-and-tone.md`](../design/voice-and-tone.md) |
| ✅ | Accessibility contract | [`../design/accessibility.md`](../design/accessibility.md) |
| ✅ | Learning engine spec | [`../systems/learning-engine.md`](../systems/learning-engine.md) |
| ✅ | Content pipeline | [`../systems/content-pipeline.md`](../systems/content-pipeline.md) |
| ✅ | XP economy | [`../systems/xp-economy.md`](../systems/xp-economy.md) |
| ✅ | Progression | [`../systems/progression.md`](../systems/progression.md) |
| ✅ | Achievements | [`../systems/achievements.md`](../systems/achievements.md) |
| ✅ | Quests & live-ops | [`../systems/quests-and-liveops.md`](../systems/quests-and-liveops.md) |
| ✅ | Notifications | [`../systems/notifications.md`](../systems/notifications.md) |
| ✅ | Social & leagues | [`../systems/social-and-leagues.md`](../systems/social-and-leagues.md) |
| ✅ | Architecture | [`../engineering/architecture.md`](../engineering/architecture.md) |
| ✅ | Data model | [`../engineering/data-model.md`](../engineering/data-model.md) |
| ✅ | Analytics spec | [`../engineering/analytics-spec.md`](../engineering/analytics-spec.md) |
| ✅ | Security & privacy | [`../engineering/security-privacy.md`](../engineering/security-privacy.md) |
| ✅ | Localisation | [`../engineering/localization.md`](../engineering/localization.md) |
| ✅ | Testing strategy | [`../engineering/testing-strategy.md`](../engineering/testing-strategy.md) |
| ✅ | Definition of Done | [`../engineering/definition-of-done.md`](../engineering/definition-of-done.md) |
| ✅ | ADRs 0001–0010 | [`../adr/`](../adr/) |
| ✅ | Build order | [`build-order.md`](build-order.md) |
| ✅ | Risk register | [`risks.md`](risks.md) |

## Tooling

| | Item |
|---|---|
| ✅ | `.claude/` — 15 skills, 10 agents, 10 commands, settings |
| ✅ | Repo skeleton with per-package CLAUDE.md |
| ✅ | Design tokens as data (`packages/design/tokens.json`) |
| ✅ | Content pack JSON Schema + sample pack |
| ✅ | Reference FSRS implementation + types |
| ✅ | Analytics event registry |
| ⬜ | CI pipeline green (`pnpm verify`) |
| ⬜ | Supabase project created (dev + prod) |
| ⬜ | Sentry, PostHog, RevenueCat accounts |
| ⬜ | EAS project + build profiles |

## Decisions needing a human

These are **not** things an agent should decide. Each changes the product.

| | Decision | Why it matters | Where |
|---|---|---|---|
| ⬜ | **Accept or amend the stack ADRs** | Everything downstream assumes them | [`../adr/`](../adr/) |
| ⬜ | **Landmark imagery: photography or illustration?** | Changes cost, licensing risk, and the app's whole visual identity | [`../engineering/security-privacy.md §11`](../engineering/security-privacy.md#11-content-licensing) |
| ⬜ | **Flag SVG set + licence** | Blocks the content pipeline | same |
| ⬜ | **Map geometry source** (Natural Earth vs OSM) | ODbL attribution obligations differ | same |
| ⬜ | Confirm the target price points | Business model | [`../product/product-bible.md §9`](../product/product-bible.md#9-business-model) |
| ⬜ | Confirm launch markets (affects locales and consent ages) | GDPR-K ages differ by country | [`../engineering/security-privacy.md`](../engineering/security-privacy.md) |
| ⬜ | Approve the mascot name **Atlas** and commission the art | Brand | [`../design/voice-and-tone.md`](../design/voice-and-tone.md) |
| ⬜ | Confirm v1.0 scope cuts (leagues, achievements, landmarks, friends deferred) | The mockup shows more than v1.0 ships | [`../product/roadmap.md`](../product/roadmap.md) |

## Verification

| | Item |
|---|---|
| ⬜ | Competitor pricing marked `TODO(verify)` re-checked against live products |
| ⬜ | Persona assumptions validated with ≥ 8 real interviews (1 per persona) |
| ⬜ | Fact sources confirmed available and licensable for all 195 countries |
| ⬜ | Beta cohort recruited by persona (incl. 5 children, 3 teachers, 5 over-60s, 3 assistive-tech users) |
| ⬜ | Legal review of the privacy policy and the child-consent flow |

---

## Exit criteria

Phase 0 is done when:

1. Every documentation row is ✅ **and has been read end to end** by whoever will build
   from it. Written-but-unread docs are decoration.
2. Every "Decisions needing a human" row is resolved and recorded — as an ADR where it
   changes the architecture.
3. CI is green on an empty repo skeleton.
4. Nobody on the team has a question about *what* we're building — only about *how*.

Then start [`build-order.md`](build-order.md), week one.
