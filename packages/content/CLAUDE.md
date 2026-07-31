# `packages/content` — content as data

Adding a country, a fact, or a whole subject must be an **authoring task**. If it
requires a code change and a store release, the architecture has failed.

## Structure

```
schema/            JSON Schema (authors + editors) — Zod mirrors it at runtime
packs/<subject>/   the actual content
scripts/           validate · preview · stats · build-index
```

## The model

```
Entity  →  Fact  →  Template  →  generated Item
JP         geo.JP.capital        tpl.capital.mc4    geo.JP.capital@tpl.capital.mc4
```

Memory is tracked per **fact**; presentation varies per **template**. ~600 authored
facts × 6 templates ≈ 1,500+ items.

## Non-negotiable, enforced in CI

- A stable ID in the documented format — permanent, it ships in save data
- A named, linkable `source` and a `verifiedAt` date
- A `volatility` tag; `fast` facts may never be quiz answers
- A value for every shipped locale
- A recorded `license` on every asset

**Never invent a fact.** If you cannot source it, write `TODO(verify)`. A wrong fact
in a learning app is a P1 bug — the worst defect this product can ship.

## Sensitive content

Disputed territories, contested capitals, unrecognised states and region-dependent
names follow a **documented policy**. Tag `"sensitivity": "review-required"` and get a
second author's sign-off. **Never resolve one unilaterally** — flag it and ask.
See `sample.capitals.v1.json` for a worked example (South Africa's three capitals).

## Workflow

```bash
pnpm content:validate
pnpm content:preview <packId>   # and READ the generated questions
pnpm content:stats
```

Spec: [`../../docs/systems/content-pipeline.md`](../../docs/systems/content-pipeline.md)
