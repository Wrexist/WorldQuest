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

**A picture is a fact too.** Flags carry `assets.flag` with a path, a `license` and an
`attribution`, and the artwork is rasterised from `flag-icons` by `pnpm build:flags` —
never drawn. A flag with the wrong number of stars is exactly the P1 above, arriving as
an image instead of a string, where no proofreader will catch it. Adding a country means
running that script; it fails loudly if the source set has no flag for the code, and the
right answer to that is to find a public-domain source or drop the country, never to
draw one. `apps/mobile` asserts at test time that every declared path resolves to a file
we actually ship, so a pack that promises artwork nobody bundled fails rather than
rendering a placeholder that looks deliberate.

**So is a map.** Country outlines carry `assets.map` and `assets.mapContext` — the
country, and the land around it drawn in the same frame — both rasterised from Natural Earth
(public domain) by `pnpm build:maps` — never traced, never approximated. An invented
coastline is the same P1 as an invented capital, and an invented *border* is a
political claim on top of it. The script fails rather than guessing, and it checks two
things a reviewer cannot see: that every outline has real area, and that every country
comes out at the size its own frame was fitted to. Both guards exist because both failed — Natural Earth
files "Ashmore and Cartier Is." under Australia's ISO code, and a keyed lookup silently
drew two uninhabited sandbanks captioned "Australia".

There was also a bare `geometry: "geo/countries/SE.svg"` field on all 65 entities for
the life of the project: a path with no licence beside it, that nothing ever read, for
files nobody had made. It is gone. **Artwork belongs in `assets`, where the schema
requires a licence** — a field that names a file without saying who owns it is how an
unlicensed asset ships.

## Sensitive content

Disputed territories, contested capitals, unrecognised states and region-dependent
names follow a **documented policy**. Tag `"sensitivity": "review-required"` and get a
second author's sign-off. **Never resolve one unilaterally** — flag it and ask.
See `sample.capitals.v1.json` for a worked example (South Africa's three capitals).

## Workflow

```bash
pnpm content:validate
pnpm content:crosscheck         # every value against an INDEPENDENT dataset
pnpm content:preview <packId>   # and READ the generated questions
pnpm content:stats
```

`validate` checks that a fact carries a source, a `verifiedAt` and a volatility window.
It cannot check that the value is RIGHT — nothing inside this repo can, because the
answer lives outside it. `crosscheck` asks `world-countries@5.1.0` the same questions:
349 values across capitals, currencies, calling codes, languages, regions and the
countries' own English names. It is in `pnpm verify`.

Six differences are recorded in its `ACCEPTED` table with a reason, because a
disagreement is not automatically a bug — the pack cites ITU-T E.164 and ISO 639-1 where
the reference cites a community list, and on two of the six the pack is the
better-sourced side. **Never resolve one by editing the pack to match the reference.**
Read both sources; if the pack is right, add an entry saying why.

Spec: [`../../docs/systems/content-pipeline.md`](../../docs/systems/content-pipeline.md)
