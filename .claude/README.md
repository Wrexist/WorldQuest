# `.claude/` — the repo's AI tooling

Procedural knowledge that Claude Code (and any agent working here) should load
*before* doing a given kind of work — not after getting it wrong.

Start at [`../CLAUDE.md`](../CLAUDE.md), which routes to everything below.

---

## Skills — `skills/<name>/SKILL.md`

Invoked automatically when the work matches, or by name. Each encodes decisions you
cannot infer from the code.

| Skill | Use when |
|---|---|
| `worldquest-screen` | Building or changing any screen or component |
| `worldquest-design-system` | Touching colours, spacing, motion, primitives |
| `worldquest-content-pack` | Adding or editing countries, facts, questions |
| `worldquest-learning-engine` | FSRS, mastery, due dates, item selection |
| `worldquest-xp-economy` | Any XP, coin, heart or price change |
| `worldquest-achievements` | Adding or changing an achievement |
| `worldquest-i18n` | Any user-facing string |
| `worldquest-a11y` | Accessibility audits and fixes |
| `worldquest-analytics` | Adding or changing a tracked event |
| `worldquest-supabase` | Migrations, RLS, edge functions |
| `worldquest-liveops` | Quests, seasonal events, collections |
| `worldquest-notifications` | Push copy, types, timing |
| `worldquest-persona-check` | Deciding whether a feature should exist |
| `worldquest-competitor-teardown` | Researching a competitor |
| `worldquest-definition-of-done` | Finishing anything |

## Commands — `commands/<name>.md`

`/wq-new-screen` · `/wq-new-content-pack` · `/wq-add-achievement` · `/wq-add-event` ·
`/wq-balance-check` · `/wq-persona-check` · `/wq-dod` · `/wq-ship-check` ·
`/wq-status` · `/wq-competitor-teardown`

## Agents — `agents/<name>.md`

Specialists for deep, parallel, or second-opinion work. Delegate to them **only when
the user has asked for agent or parallel work.**

| Agent | Owns |
|---|---|
| `wq-product-strategist` | Should this exist, for whom, when |
| `wq-learning-scientist` | The scheduler and whether people actually learn |
| `wq-content-author` | Facts, sources, distractors, sensitive content |
| `wq-ui-engineer` | Screens built to the system |
| `wq-design-system-guardian` | Reviews UI diffs for violations |
| `wq-backend-engineer` | Schema, RLS, edge functions |
| `wq-a11y-i18n-auditor` | The two things that cost 5× to retrofit |
| `wq-qa-engineer` | The test suite |
| `wq-liveops-designer` | Quests, events, economy balance |
| `wq-security-privacy-reviewer` | The failures that end products |

## Settings — `settings.json`

Read-only and verification commands are pre-allowed so routine work doesn't prompt.
Anything that pushes, installs, builds, or touches a remote database **asks**.
Destructive commands and secret files are **denied**.

---

## Maintaining this

A skill is worth adding when the same correction has been needed twice. A skill that
merely restates the docs is noise — link to the doc instead. Keep each skill's
`description` precise: it is how the right one gets loaded at the right moment.

When a rule in `PROJECT.md` or `docs/` changes, update the skill that enforces it in
the same PR. Tooling that contradicts the documentation is worse than no tooling,
because people trust it.
