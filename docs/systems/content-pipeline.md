# Content pipeline

> Don't hardcode questions. Create a content system.

Adding a country, a fact, or a whole new subject must be a **data task**, not an
engineering task. This document defines the data.

```
Entity  →  Facts  →  Question templates  →  Generated items  →  Lessons
             ↓              ↓                      ↓
          sources      difficulty tags        review rules
```

---

## 1. The four layers

### 1.1 Entity
A thing you can know about. Geography's entities are countries, capitals, landmarks,
rivers, seas. Stable ID, ISO where one exists.

```json
{
  "id": "JP",
  "type": "country",
  "names": { "en": "Japan", "sv": "Japan" },
  "region": "AS", "subregion": "east-asia",
  "iso3": "JPN", "un_member": true,
  "geometry": "geo/countries/JP.svg",
  "assets": { "flag": "flags/JP.svg", "hero": "photos/JP/hero.webp" }
}
```

### 1.2 Fact
An atomic piece of knowledge. **This is what gets scheduled.**

```json
{
  "id": "geo.JP.capital",
  "entity": "JP",
  "attribute": "capital",
  "value": { "id": "JP-13", "names": { "en": "Tokyo", "sv": "Tokyo" } },
  "difficulty": 2,
  "tags": ["capital", "asia", "core"],
  "source": { "name": "UN Statistics Division", "url": "…", "verifiedAt": "2026-07-01" },
  "volatility": "stable"
}
```

`difficulty` 1–5 is the *authored* prior (how hard we expect it to be). The engine
learns the real per-user difficulty and overrides it — the prior only matters for
ordering a brand-new user's first lessons.

`volatility`: `stable` (capital, flag, borders) · `slow` (population, currency) ·
`fast` (leadership, GDP — **avoid these as quiz answers entirely**).

### 1.3 Question template
A reusable way of asking. **Templates never mention a specific country.**

```json
{
  "id": "tpl.capital.mc4",
  "attribute": "capital",
  "modality": "text",
  "prompt": { "key": "lesson:prompt.capital_of", "params": ["entityName"] },
  "answer": { "from": "fact.value.names" },
  "distractors": {
    "count": 3,
    "strategy": "same-subregion",
    "fallback": "same-region",
    "excludeSimilarStrings": true
  },
  "a11y": { "screenReaderSafe": true },
  "timeLimitMs": null,
  "difficultyModifier": 0
}
```

**v1.0 templates**

| ID | Asks | Modality | SR-safe |
|---|---|---|---|
| `tpl.flag-to-country.mc4` | "Which country's flag is this?" | image → text | ✅ (flag described) |
| `tpl.country-to-flag.mc4` | "Which flag is Japan's?" | text → image | ❌ → variant below |
| `tpl.capital.mc4` | "What is the capital of Japan?" | text → text | ✅ |
| `tpl.capital-reverse.mc4` | "Tokyo is the capital of…?" | text → text | ✅ |
| `tpl.locate.map` | "Tap Japan on the map" | text → map | ❌ → `tpl.locate.mc4` |
| `tpl.flag-describe.mc4` | "Which country's flag is a red circle on white?" | text → text | ✅ |

**Accessibility is a template property, not a UI patch.** Every visual template has a
screen-reader-safe sibling that tests the *same fact*, so a blind user's `user_facts`
row is identical to anyone else's. See
[`../design/accessibility.md`](../design/accessibility.md#8-known-hard-problems).

### 1.4 Generated item
`fact × template`, produced at build time, indexed and shipped:

```
geo.JP.capital@tpl.capital.mc4
geo.JP.capital@tpl.capital-reverse.mc4
geo.JP.flag@tpl.flag-to-country.mc4
```

195 countries × ~4 core facts × ~2 templates ≈ **1,500+ items from ~600 authored
facts and 6 templates.** That ratio is the whole argument.

---

## 2. Distractors — the hardest part

Bad distractors ruin a quiz faster than anything else. A four-option question where
three options are absurd teaches nothing and feels cheap.

| Strategy | Behaviour | Use |
|---|---|---|
| `same-subregion` | Same subregion (East Asia) | Default — plausible and educational |
| `same-region` | Same continent | Fallback when the subregion is too small |
| `visually-similar` | Facts sharing a `like:` tag | Flag questions — Chad/Romania, Monaco/Indonesia |
| `commonly-confused` | Facts sharing a `like:` tag | Slovenia/Slovakia, Austria/Australia |
| `other-values` | Any entity holding a value for this attribute | Questions **answered with the fact value**, where the options are values, not entities |
| `random-global` | Anything | **Never in production.** Test fixtures only. |

### `other-values`, and why geography restrictions can destroy a question

The four geography strategies narrow the pool of candidate **entities**, which is the
right move when the entity is the answer: "which country's flag is this?" is only hard
if the wrong answers are nearby countries.

When the answer is the fact **value**, the option space is the set of values, and
narrowing by geography does not make the question harder — past a point it makes it
impossible. `same-region` for Brazil returns four South American countries, and every
one of them answers "South America". They deduplicate into the correct option and the
question is dropped. `tpl.location-of.mc4` lost every country in Asia, North America,
Oceania and South America this way — 30 of 65 — and because it is the screen-reader
sibling of the map question, the loss fell entirely on the accessible path.

`other-values` draws from every entity that *has* a value for the attribute, so "Where
in the world is Brazil?" picks four of fourteen subregions. That is not a lottery; it is
the question. The filter is what separates it from `random-global`: an entity with no
value for the attribute cannot supply an option, and including it would render a blank
one. `pnpm content:validate` rejects it on any template answering with `entity.names`,
because there it really would turn a hard question into a free one.

**The fallback fires on too few OPTIONS, not too few candidates.** Those are the same
number only when every candidate reads differently, which for value-answer templates is
routinely false — and a fallback that waits for an *empty* pool never runs for a pool
that is full of duplicates.

### `like:` tags — how similarity is authored

Similarity is **declared by the author**, in tags namespaced `like:`:

```jsonc
"tags": ["flag", "europe", "like:nordic-cross", "core"]
```

Only `like:` tags are considered by the two similarity strategies. That prefix is
load-bearing rather than decorative: the first implementation matched *any* shared tag
except `core`, and since every flag fact carries `flag`, "visually similar" quietly
meant "any country in the pack". Five countries in one subregion concealed it
completely — the first question that exposed it was a Swedish flag offered against
China and Mongolia, printed by `pnpm content:preview` the day a second region landed.

A fact with **no** `like:` tag matches nothing and falls through to the strategy's
`fallback`. That is the intended outcome: we have not been told what its flag
resembles, and guessing is how the bug above happened.

Groups in use today: `like:nordic-cross`, `like:central-circle`,
`like:red-with-stars`, `like:vertical-bands`. A group needs **four members** before it
can carry a four-option question on its own; below that the fallback does the work,
which is correct but easier than intended. `pnpm content:stats` reports the gap.

**Hard rules**
- Never a distractor that is *also* a correct answer (a country with two capitals; a
  shared capital; a shared currency). Enforced by `isAmbiguous`, which refuses a
  **reverse** question whose value does not identify one entity. "Which country uses
  the Euro?" has ten right answers here, and no choice of distractors repairs that —
  even with every shown option wrong but one, the user knows Germany would also have
  been right. The forward direction of the same fact stays askable, because "what
  money do people use in France?" has exactly one answer however many countries share
  it. This had only ever been enforced for options that render as the same *string*,
  which is a far weaker rule and would have shipped the euro question.
- Never two options with the same displayed name.
- Never options that differ only by a diacritic.
- Shuffle position with a **seeded** RNG, and never place the correct answer in the
  same slot more than twice in a row — users learn positions, not facts.
- Difficulty is tuned by distractor *closeness*, not by making the question weirder.

---

## 3. Pack format

```
packages/content/packs/
  geography/
    entities.countries.v1.json
    facts.capitals.v1.json
    facts.flags.v1.json
    facts.landmarks.v1.json
    templates.v1.json
    collections.v1.json
    similarity.flags.v1.json     # precomputed distractor neighbours
```

Every pack file:

```json
{
  "$schema": "../../schema/pack.schema.json",
  "packId": "geography.capitals",
  "version": "1.0.0",
  "subject": "geography",
  "locales": ["en", "sv"],
  "license": "CC-BY-4.0",
  "generatedAt": "2026-07-31",
  "items": [ … ]
}
```

Validated in CI by `pnpm content:validate` against a JSON Schema **and** a Zod parser
(schema for authors and editors, Zod for runtime safety at load). See
[`../adr/0005-content-as-data.md`](../adr/0005-content-as-data.md).

---

## 4. Build pipeline

```
authored JSON
   ↓  validate   schema · required fields · ID format · no duplicates
   ↓  lint       sources present · verifiedAt within policy · licence recorded
   ↓  resolve    entity references · locale completeness
   ↓  generate   fact × template → items · distractor pools
   ↓  index      per-topic and per-difficulty indexes for fast selection
   ↓  bundle     shipped with the app + published to CDN, versioned
```

**CI fails the build on:** a missing source · a `verifiedAt` older than the volatility
policy · a missing locale for a shipped language · a duplicate ID · an unresolvable
entity reference · an asset with no recorded licence.

#### The source must be where the value actually came from

CI can only check that a source is *present*. The rule it cannot check, and the one that
matters, is that the citation names the thing somebody actually read.

Every fact shipped so far does: `English Wikipedia, "Flag of Kenya"`,
`Constitution of the Netherlands, Article 32`, `Finnish Flag Act (380/1978)`,
`SWI swissinfo.ch, "Why Switzerland hasn't got a capital city"`. One named, linkable
source per fact, dated — not one dataset cited 200 times.

**This is the trap in bulk-generating content, and it is an easy one to walk into.**
`countries-list` and similar packages hold capitals and currencies for every country on
earth, and a script could emit 400 facts from them in a minute. Emitting those facts
while citing *Wikipedia* — because that is what the neighbouring rows cite — would be a
false citation: plausible, uncheckable by CI, and wrong about where the value came from.
Emitting them citing the package is honest, but it lowers the bar for hundreds of facts
at once, and nobody has read any of them.

`build-locations.cjs` is the worked example of getting this right, and it took two goes.
It derives 65 facts mechanically from `subregion` in the entities pack, and it refuses to
cite UN M49 — a standard the grouping deliberately diverges from, since M49 puts Mexico in
"Latin America and the Caribbean" while this pack teaches North America. A citation you
have diverged from is worse than no citation at all.

It used to cite **the entities pack** instead, which is the failure this section warns
about wearing the opposite mask: a fact whose source is another file in this repository
has no external provenance, the link answers nothing a reader could check, and the one
that shipped pointed into a private repo that 404s for everybody. `content:validate`
rejects a self-citation now. So each row names its provenance as what it actually is —
**a WorldQuest editorial classification on the seven-continent model** — and cites that
model. The derivation is mechanical; the classification being derived is a judgement, and
a citation has to describe the judgement rather than the copy step.

So: generate the *shape* of a fact freely, and generate its *value* only from something
this repo already owns. Everything else is authoring, one source at a time. That is slow
on purpose — a wrong fact ships as a same-day hotfix precisely because it should never
have shipped.

### Delivery
- Core packs (countries, flags, capitals) **ship in the binary** — offline on first
  launch, no download wall.
- Extended packs (landmarks, subjects) download on demand and cache.
- Pack versions are independent of app versions. A content fix goes out as a CDN
  update, no store review. **This is why a wrong fact is a same-day hotfix.**
- The client validates a downloaded pack's signature and schema before use.

---

## 5. Sensitive content

Geography is political. Silence is also a choice, so we make ours explicitly and
apply it consistently rather than leaving it to whoever authors the pack.

**Policy**

1. **Baseline = UN membership + observer states** for "countries" (195). Documented in
   the pack, visible in the app's About section.
2. **Disputed territories** (Western Sahara, Taiwan, Kosovo, Palestine, Crimea, and
   others) are **never quiz answers with a single right response.** They appear in
   Facts and Explore with neutral, sourced descriptions noting the dispute.
3. **Disputed borders** render with the UN cartographic convention (dashed) and a note.
4. **Never quiz on:** current leaders, conflicts, casualty figures, religion as a
   right/wrong answer, or contested sovereignty.
5. **Locale sensitivity:** where a name differs by region (Persian Gulf / Arabian Gulf,
   Sea of Japan / East Sea), the locale file carries the local name and the app shows
   both where space allows.
6. Every sensitive item carries `"sensitivity": "review-required"` and needs a second
   author's sign-off before merge.

**An AI agent must never resolve one of these unilaterally.** Flag it, cite the
policy, and ask.

---

## 6. Fact quality

| Rule | Enforcement |
|---|---|
| Every fact has a named, linkable source | CI |
| Every fact has `verifiedAt` | CI |
| `stable` re-verified every 24 months | Scheduled job → issue |
| `slow` re-verified every 12 months | Scheduled job → issue |
| `fast` facts are not quizzable | CI (rejects `volatility: fast` on a quiz attribute) |
| Every asset has a licence + attribution | CI |
| Second-author review before merge | PR rule |
| In-app "report this fact" | Product feature, triaged weekly |

**A wrong fact is a P1 bug.** It is the one class of defect that directly harms the
user's stated goal, and Kenji will find it.

---

### Difficulty is a prior, and priors carry their author's horizon

`difficulty` (1–5) is authored by hand, once, and applies to every user on earth. The
schema already calls it "an authored prior the engine overrides", which is the right
design — FSRS learns a real per-user difficulty from the first review onwards.

What it does before that first review is order new content, and there the prior is doing
real work with a real bias in it. Measured across the capitals pack: mean authored
difficulty **1.8 in Europe, 3.7 in Africa**. Every Western European capital is 1 or 2;
every African one is 3 to 5. Dodoma and Gaborone are 5; Stockholm, Paris, Berlin, Rome
and Madrid are 1.

That is a true statement about the learner it was written for and a false one about the
world. A Swedish twelve-year-old really does find Stockholm easier than Gaborone. A child
in Accra is told Accra is hard and Stockholm is easy, and `selectItems` orders their first
weeks accordingly — in a product whose personas claim a global audience.

**Do not fix this by re-authoring the numbers.** That replaces one person's horizon with
another's and buys nothing. Two real paths, in order of cost:

1. **Move the prior out of the fact.** `difficulty` belongs beside `names` as a
   per-locale value, not beside `source` as a property of the world. A `difficulty.sv`
   that differs from `difficulty.en` is not a contradiction; it is the honest shape.
2. **Replace it with measurement.** `review_log` records every answer with its rating.
   After roughly the same volume `fsrs.ts` names for re-fitting its weights (~50k
   reviews), observed p(correct) per cohort is strictly better than any authored guess,
   and the prior becomes what it is for: the cold start before the data exists.

`pnpm content:validate` warns when a pack's regional spread exceeds 1.5, with the numbers
in the message. It is measured per pack rather than pooled — pooling a skewed pack against
an even one reports a smaller number than either, which is the wrong direction for a bias
check and hid this one at 1.4 instead of 1.9.

## 7. Adding a new subject (the thesis test)

To add "World Wildlife" in v3.0:

1. `packages/content/packs/wildlife/entities.species.v1.json`
2. `facts.habitat.v1.json`, `facts.appearance.v1.json`
3. Reuse `tpl.*.mc4` — the templates are attribute-shaped, not geography-shaped
4. Add one collection definition
5. Register the subject in the content index

**Zero engine changes. Zero new screens.** If any of those five steps requires
touching `packages/engines` or `apps/mobile`, the abstraction leaked — fix it there,
not with a special case. This is Phase 1's exit criterion 4, tested for real in v3.0.

---

## 8. Authoring workflow

| Step | Who | Tool |
|---|---|---|
| Draft | Content author or AI agent | `/wq-new-content-pack` |
| Source | Author | Recorded in the pack, linkable |
| Validate | CI | `pnpm content:validate` |
| Review | Second author | PR, with the sensitivity checklist |
| Preview | Anyone | `pnpm content:preview <packId>` renders generated questions |
| Merge | Author | Squash |
| Ship | CI | CDN publish + version bump |

**`content:preview` matters more than it sounds.** Reading generated questions is the
only reliable way to catch bad distractors, and it takes two minutes.
