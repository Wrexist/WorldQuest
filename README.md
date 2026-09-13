<div align="center">

# 🌍 WorldQuest

**Practice geography, five minutes at a time.**

Practice recognizing countries, flags and capitals in short daily sessions.
Worldwide English/Swedish launch is the target; this repository is still completing
the release foundations described below.

</div>

---

## Status

**Phase 2: backend, accounts and trustworthy progress.** The Expo app, geography content,
learning engines and backend code exist. The September audit identified learning-history,
account, reward and purchase gaps that block a public paid release. Follow the
[eight-phase execution checklist](docs/plan/execution-plan.md) and
[current work log](docs/plan/phase-2-verification.md). Phase 1 has one remaining gate: an iOS 26.4 button-label rendering finding.

## What it is

A mobile learning app (iOS + Android) that teaches visual world knowledge in short
daily sessions, with XP, coins, streaks, hearts, leagues, collections and
achievements — designed for a 10-year-old and a 40-year-old to both enjoy.

Content is structured data, with geography as the first subject. New subjects may
reuse the engines, but still require suitable teaching methods, templates, assets
and validation. Expansion follows the geography release.

<div align="center">

![WorldQuest v1.0 screen mockups](docs/design/assets/mockup-v1.png)

*v1.0 target — 15 screens*

</div>

## Start here

| | |
|---|---|
| 📜 **[PROJECT.md](PROJECT.md)** | The constitution — stack, structure, standards, schema, DoD |
| 🤖 **[CLAUDE.md](CLAUDE.md)** | How AI agents work in this repo |
| 📚 **[docs/](docs/README.md)** | Product bible, personas, design system, engine specs |
| 🗺️ **[docs/plan/execution-plan.md](docs/plan/execution-plan.md)** | What we build, in what order, and why |
| ✅ **[docs/plan/phase-0-checklist.md](docs/plan/phase-0-checklist.md)** | Historical Phase 0 checklist |

## Repo map

```
PROJECT.md      the constitution — read first
CLAUDE.md       AI agent operating manual
apps/mobile     Expo app (screens + navigation only)
packages/
  engines       ★ pure TypeScript domain logic — the platform
  content       data-as-content packs, schemas, validators
  design        design tokens + UI primitives
  i18n          locale files + typed keys
  analytics     typed event registry
  api           generated Supabase types + client
supabase/       migrations, edge functions, seed
docs/           product · design · systems · engineering · adr · plan
.claude/        agents · skills · commands · settings
```

## Tech stack (short version)

Current code: TypeScript, Expo 54 / React Native 0.81, expo-router, Zustand,
TanStack Query, MMKV, i18next and pure TypeScript learning engines. The existing
backend uses Supabase; Phase 2 evaluates Convex as its replacement, with Workers/D1
as fallback. Supabase is not the chosen future backend. Billing and analytics
ports are preparatory; RevenueCat and PostHog are not installed integrations.
See the [generated inventory](docs/engineering/project-inventory.generated.json),
[launch brief](docs/product/launch-brief.md) and [security maintenance](docs/engineering/dependency-security.md).
Full rationale and alternatives: [`PROJECT.md §2`](PROJECT.md#2-tech-stack) and
[`docs/adr/`](docs/adr/).

## Principles worth stating up front

1. **Content is data.** Never hardcode a fact or a question.
2. **Copy is a key.** Never hardcode a string — sv and en from day one.
3. **Tokens or nothing.** Never hardcode a colour or a spacing value.
4. **The server decides rewards.** The client only renders them.
5. **Kind gamification.** Momentum, never manipulation.
6. **Accessible from commit one.** Retrofitting a11y is a rewrite.

## Development (once Phase 1 lands)

```bash
pnpm install          # from the repo root, always
pnpm db:start         # local Supabase
pnpm dev              # Expo dev server
pnpm test             # engines + app
pnpm verify           # typecheck · lint · test · content · i18n · a11y
```

## Contributing

Read [`PROJECT.md §11`](PROJECT.md#11-git-workflow) and
[`§12`](PROJECT.md#12-definition-of-done). Every PR names the persona it serves and
ticks the Definition of Done.

## Licence

Not yet chosen — content licensing (flags, imagery, map data) is tracked in
[`docs/engineering/security-privacy.md`](docs/engineering/security-privacy.md#content-licensing).
