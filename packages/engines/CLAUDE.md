# `packages/engines` — the platform

**This package is the bet.** Everything else is a wrapper around it.

## The purity contract — do not break it

No React. No network. No `Date.now()`. No `Math.random()`. No filesystem.
`Clock` and `Rng` are **injected** through `src/shared`.

That is not stylistic. The identical module runs in the app (optimistic feedback) and
in the `submit-lesson` edge function (authoritative grading). If they can drift, the
client and server disagree about what a user knows — the worst bug this product can
have. Purity is what makes drift impossible.

It is also what makes 90 %+ coverage affordable: these tests need no mocks, no DOM,
no database, and run in milliseconds.

## Nothing here knows what geography is

The engines handle **facts**, **items**, **mastery** and **rewards**. Geography is
content pack #1. If a geography concept (country, flag, continent) appears in this
package, the abstraction has leaked — fix it here rather than working around it.

## Contents

| Path | Owns |
|---|---|
| `src/learning/` | FSRS scheduling, mastery states, item selection |
| `src/xp/` | The balance table — the single source of truth for every reward number |
| `src/shared/` | `Clock`, `Rng`, `Result`, seeded shuffle |
| `src/progress/`, `src/quests/`, `src/achievements/`, `src/leagues/` | *(to build)* |

## Rules

1. Every exported function is pure: same inputs → same output.
2. Expected failures are `Result` values. Throw only for programmer error.
3. `review_log` is authoritative; `user_facts` is a cache. `rebuild()` must reproduce
   incremental state **exactly** — that test may never be skipped.
4. Determinism is tested: the same Rng seed produces identical output. Friend
   challenges depend on it.
5. Coverage ≥ 90 %, gated in CI, including property tests over 10,000 sequences.
6. Engines never import each other except through `shared`. They communicate by domain
   events; the orchestration layer wires them.

Specs: [`../../docs/systems/learning-engine.md`](../../docs/systems/learning-engine.md) ·
[`../../docs/systems/xp-economy.md`](../../docs/systems/xp-economy.md) ·
[`../../docs/engineering/architecture.md`](../../docs/engineering/architecture.md)
