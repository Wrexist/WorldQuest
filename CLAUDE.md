# CLAUDE.md — working in the WorldQuest repo

**Read [`PROJECT.md`](PROJECT.md) first.** It is the constitution: vision, stack,
folder structure, naming, design system, schema, roadmap, and Definition of Done.
This file covers only how *you* (an AI agent) should operate here.

---

## What this project is, in one paragraph

WorldQuest is a mobile learning app (Expo/React Native + TypeScript + Supabase) that
teaches world geography in five-minute daily sessions — countries, flags, capitals,
landmarks — with XP, coins, streaks, hearts, leagues, and achievements. Architecturally
it is **a learning engine for visual knowledge** with geography as its first content
pack. The mockup for v1.0 is [`docs/design/assets/mockup-v1.png`](docs/design/assets/mockup-v1.png)
(15 screens). We are currently in **Phase 0 → Phase 1**: documentation and the walking
skeleton. See [`docs/plan/build-order.md`](docs/plan/build-order.md) for what is next.

---

## The seven rules

1. **Content is data.** Never hardcode a country, fact, or question. It goes in a
   content pack under `packages/content/packs/`.
2. **Copy is a key.** Never hardcode a user-facing string. `t('namespace:key')`.
3. **Tokens or nothing.** Never hardcode a colour, spacing value, radius, or duration.
4. **Economy numbers live in the balance table.** Never invent an XP or coin value —
   read [`docs/systems/xp-economy.md`](docs/systems/xp-economy.md).
5. **`packages/engines` stays pure.** No React, no network, no `Date.now()`, no
   `Math.random()`. Inject `Clock` and `Rng`.
6. **The server is authoritative** for XP, coins, streaks, hearts, leagues, and
   entitlements. The client may render optimistically; it may never decide.
7. **Kids are users.** Nothing that would be creepy for a 10-year-old: no dark
   patterns, no shame copy, no third-party tracking on child accounts.

---

## Before you write code

Ask, in order:

1. **Which persona does this serve?** ([`docs/product/personas.md`](docs/product/personas.md))
   If none, it probably shouldn't exist.
2. **Is it in the roadmap phase we're in?** ([`docs/product/roadmap.md`](docs/product/roadmap.md))
   Building v2.0 features during v1.0 is the most expensive mistake available.
3. **Is it content, config, or code?** Prefer content > config > code, in that order.
4. **Where does it live?** Follow the folder structure in
   [`PROJECT.md §3`](PROJECT.md#3-folder-structure) and respect the dependency rule.
5. **What are the five states?** Content, loading, empty, error, offline.

## Before you say you're done

Run the Definition of Done ([`PROJECT.md §12`](PROJECT.md#12-definition-of-done)) —
or just invoke `/wq-dod`. Do not report a feature complete with an unticked box;
report it complete *except* for X, and say so plainly.

---

## Skills — use them, don't improvise

`.claude/skills/` contains the repo's procedural knowledge. Invoke the matching skill
**before** starting that kind of work; they encode decisions you cannot infer from
the code.

| When you are… | Use |
|---|---|
| Building or changing any screen/component | `worldquest-screen` |
| Touching colours, spacing, motion, primitives | `worldquest-design-system` |
| Adding or editing countries, facts, questions | `worldquest-content-pack` |
| Touching FSRS, mastery, due dates, item selection | `worldquest-learning-engine` |
| Changing XP, coins, hearts, or any reward number | `worldquest-xp-economy` |
| Adding or changing an achievement | `worldquest-achievements` |
| Adding, renaming, or translating any string | `worldquest-i18n` |
| Auditing or fixing accessibility | `worldquest-a11y` |
| Adding or changing a tracked event | `worldquest-analytics` |
| Writing SQL, RLS, or an edge function | `worldquest-supabase` |
| Designing a daily/weekly/seasonal event | `worldquest-liveops` |
| Writing push/notification copy | `worldquest-notifications` |
| Judging whether a feature belongs | `worldquest-persona-check` |
| Researching a competitor | `worldquest-competitor-teardown` |
| Finishing anything | `worldquest-definition-of-done` |

### Design skills

| When you are… | Use |
|---|---|
| Told to make something feel like a real product ("like Duolingo") | `dna-transplant` |
| Measuring a reference before copying anything from it | `worldquest-design-forensics` |
| Polishing a component, or it "looks generic" | `worldquest-visual-craft` |
| Checking whether a screen is actually good | `design-review` (or `/design-review`) |
| Needing an original direction with no donor to copy | `frontend-design` |
| Wanting mobile conventions by industry, thumb zones, 60/30/10 | `mobile-app-ui-design` |

The last three are third-party — see [`.claude/skills/VENDORED.md`](.claude/skills/VENDORED.md)
for provenance, licences, and what was changed. **Design review looks at rendered
screens, never at the diff**: `pnpm design:shots` first, then open the PNGs.

## Commands

`/wq-new-screen` · `/wq-new-content-pack` · `/wq-add-achievement` · `/wq-add-event` ·
`/wq-balance-check` · `/wq-persona-check` · `/wq-dod` · `/wq-ship-check` ·
`/wq-status` · `/wq-competitor-teardown` · `/design-review`

## Subagents

`.claude/agents/` holds specialists: `wq-product-strategist`, `wq-learning-scientist`,
`wq-content-author`, `wq-ui-engineer`, `wq-design-system-guardian`, `wq-design-reviewer`,
`wq-backend-engineer`, `wq-a11y-i18n-auditor`, `wq-qa-engineer`, `wq-liveops-designer`,
`wq-security-privacy-reviewer`.

`wq-design-system-guardian` reads the diff; `wq-design-reviewer` looks at the pixels.
Both, on a visual change. Delegate to them for deep, parallel, or
second-opinion work — **only when the user has asked for agent/parallel work.**

---

## Repo conventions you will get wrong if you don't read them

- **Docs are part of the product.** A code change that invalidates a doc must update
  the doc in the same PR. `PROJECT.md` is edited deliberately, never casually.
- **Stable IDs are forever.** Country codes are ISO alpha-2. Fact IDs, achievement
  IDs, and analytics event names ship in user save data and dashboards — renaming one
  is a migration, not a rename.
- **Migrations are forward-only.** Never edit a landed file in `supabase/migrations/`.
- **Facts need sources.** Every fact in a content pack carries `source` and
  `verifiedAt`. Population, currency, and capital data go stale; disputed territories
  are handled per [`docs/systems/content-pipeline.md`](docs/systems/content-pipeline.md#sensitive-content)
  — do not improvise a political stance.
- **Never invent numbers.** If you don't know a population, GDP, or competitor's
  pricing, mark it `TODO(verify)` rather than guessing. A wrong fact in a learning app
  is the worst possible bug.

## Git

Branch `feat/<area>-<slug>` (or the assigned `claude/<topic>-<id>`). Conventional
Commits. Squash-merge to `main`. Never force-push shared branches. Do not open a PR
unless asked. Full rules: [`PROJECT.md §11`](PROJECT.md#11-git-workflow).

## Environment notes

- pnpm workspaces — install from the repo root, never inside a package.
- `pnpm dev` (Expo) · `pnpm test` · `pnpm typecheck` · `pnpm content:validate` ·
  `pnpm i18n:check`
- **`pnpm verify` is the gate.** Typecheck, every test, content validation and preview,
  i18n, contrast, a11y lint, escape hatches, reachability, five states, and the economy
  simulation. It said "all of it" for months while `engines:simulate` and
  `content:preview` ran only in CI — so a reward number could be pushed having met every
  local check. One list now, and CI runs the same command rather than its own subset.
- **`pnpm verify:full`** adds the three that need Chromium or Metro: `bundle:native`,
  `e2e`, `a11y:tree`. CI runs this one. Two of those three were written for bugs nothing
  else could see and were then wired into neither CI nor verify.
- There is **no ESLint in this repo yet**, so there is no `pnpm lint`. The rules a
  linter would carry are enforced by scripts instead: `pnpm escape-hatches` (`any`,
  `@ts-expect-error`, `eslint-disable`), `pnpm lint:a11y`, `pnpm design:contrast`,
  `pnpm reachability`, `pnpm five-states`, `pnpm scrollable`. All are in `pnpm verify`.
- `pnpm design:shots` — renders 14 routes × 320/390/768, drives the onboarding and
  lesson flows for the nine screens that are states rather than routes, and measures
  what a picture cannot show (targets under 44 pt, sideways scroll, unlabelled
  controls). Not a gate.
- `pnpm design:measure <url>` — measures a reference in this repo's token shape.
- `pnpm build:flags` — rasterises the country flags from `flag-icons` (MIT) and writes
  `src/lib/flags.generated.ts`. The PNGs are committed, so run it only when the country
  list changes. **Never hand-draw a replacement for a flag it cannot find** — that is
  the wrong-fact bug `docs/design/asset-prompts.md` forbids, and the script says so and
  exits rather than guessing.
- `pnpm build:maps` — projects and rasterises the region + country outlines from
  Natural Earth (public domain, via `world-atlas`) and writes `src/lib/maps.generated.ts`.
  Same rules as the flags, and the same reason: an invented coastline is a wrong fact
  and an invented border is a political claim. Run it when the country list changes.
- Supabase local: `pnpm db:start`, `pnpm db:reset`, `pnpm db:types`.
- The Supabase MCP server is available in this workspace — prefer it for schema
  inspection over guessing, and **never run destructive SQL against a remote project.**

## Tone in this repo

Write like the product: clear, warm, no filler. In code comments and docs, explain
*why*. When you disagree with a request, say so once, briefly, then do the work as
asked.
