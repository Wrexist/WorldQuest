---
name: worldquest-content-pack
description: Author, edit or validate WorldQuest content — countries, facts, question templates, collections, distractors. Use whenever adding or changing anything in packages/content, adding a country or subject, writing questions, or fixing a reported incorrect fact. Enforces sourcing, licensing and the sensitive-content policy.
---

# Authoring a content pack

Spec: [`docs/systems/content-pipeline.md`](../../docs/systems/content-pipeline.md).

**Content is data.** If you are about to hardcode a country, a fact, or a question in
TypeScript, stop — it belongs in a pack.

## The model

```
Entity  →  Fact  →  Template  →  generated Item
JP         geo.JP.capital        tpl.capital.mc4    geo.JP.capital@tpl.capital.mc4
```

Memory is tracked per **fact**; presentation varies per **template**. That's why one
fact plus three templates is three ways to ask about one thing you know.

## Every fact needs

```json
{
  "id": "geo.JP.capital",
  "entity": "JP",
  "attribute": "capital",
  "value": { "id": "JP-13", "names": { "en": "Tokyo", "sv": "Tokyo" } },
  "difficulty": 2,
  "tags": ["capital", "asia", "core"],
  "source": { "name": "UN Statistics Division", "url": "https://…", "verifiedAt": "2026-07-01" },
  "volatility": "stable"
}
```

**Non-negotiable, enforced in CI:** `id` in the documented format · a real linkable
`source` · a `verifiedAt` date · locale values for every shipped language · a licence
on every asset.

## Never invent a fact

If you do not know a population, a currency, or a capital **from an authoritative
source you can link**, write `TODO(verify)` and leave it. A wrong fact in a learning
app is a P1 bug — the worst class of defect this product can ship. Guessing is worse
than an empty field.

## Volatility

| Tag | Re-verify | Quizzable |
|---|---|---|
| `stable` — capital, flag, location | 24 months | ✅ |
| `slow` — population, currency, area | 12 months | ✅ (shown with "as of YEAR") |
| `fast` — leaders, GDP, rankings | — | ❌ **CI rejects these as quiz answers** |

## Distractors — where quizzes are won or lost

| Strategy | Use |
|---|---|
| `same-subregion` | Default. Plausible and educational. |
| `same-region` | Fallback when the subregion is too small |
| `visually-similar` | Flags: Chad/Romania, Monaco/Indonesia |
| `commonly-confused` | Slovenia/Slovakia, Austria/Australia |
| `random-global` | **Never in production.** Test fixtures only. |

Never a distractor that is also correct. Never two options with the same displayed
name. Never options differing only by a diacritic. Difficulty comes from *closer*
distractors, never from weirder questions.

## Sensitive content — do not improvise

Disputed territories, contested capitals, unrecognised states, and region-dependent
names have a **documented policy**
([content-pipeline.md § sensitive content](../../docs/systems/content-pipeline.md#sensitive-content)).

- Baseline for "countries" = 195 UN members + observers
- Disputed items are **never quiz answers with one right response**
- Never quiz on leaders, conflicts, or contested sovereignty
- Tag `"sensitivity": "review-required"` and get a second author's sign-off

**An AI agent must never resolve one of these unilaterally.** Flag it, cite the policy,
ask.

## Accessibility is a template property

Every visual template needs a screen-reader-safe sibling testing the **same fact**
(`tpl.locate.map` → `tpl.locate.mc4`; `tpl.country-to-flag` → `tpl.flag-describe`).
A blind user's `user_facts` row must be identical to anyone else's.

## Workflow

```bash
pnpm content:validate            # schema, IDs, sources, licences, locales
pnpm content:preview geography.capitals   # READ THE GENERATED QUESTIONS
pnpm content:stats               # coverage per entity and locale
```

**Always run `content:preview` and actually read the output.** It is the only reliable
way to catch a bad distractor, and it takes two minutes.

## Adding a whole new subject

1. `packages/content/packs/<subject>/entities.*.json`
2. `facts.*.json`
3. Reuse existing templates — they are attribute-shaped, not geography-shaped
4. Collections + achievements as data
5. Register in the content index

**If this requires touching `packages/engines` or `apps/mobile`, the abstraction leaked.**
Report that rather than working around it — it's the project's central bet.
