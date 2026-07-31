---
description: Author and validate a new WorldQuest content pack
argument-hint: <subject.topic> e.g. geography.capitals
---

Author the content pack: **$ARGUMENTS**

Invoke the `worldquest-content-pack` skill and follow it exactly.

Steps:

1. Read `docs/systems/content-pipeline.md`.
2. Create `packages/content/packs/<subject>/<topic>.v1.json` with the standard header
   (`$schema`, `packId`, `version`, `subject`, `locales`, `license`).
3. For every fact: a stable ID, a real linkable `source`, a `verifiedAt` date, a
   `volatility` tag, values for `en` and `sv`.
4. **Never invent a fact.** If you can't source it, write `TODO(verify)` and list every
   one of them in your summary.
5. Check the sensitive-content policy for disputed territories, contested capitals and
   region-dependent names. Tag anything questionable `"sensitivity": "review-required"`
   and flag it for a human — do not resolve it yourself.
6. Choose distractor strategies deliberately. Never `random-global`.
7. Ensure each visual template has a screen-reader-safe sibling.
8. Run `pnpm content:validate`, then `pnpm content:preview <packId>` and **read the
   generated questions** — paste a sample in your summary.

Report: fact count, sources used, `TODO(verify)` items, sensitive items needing review.
