# Audit 2: learning system and content

**Verdict: strong engine work, disconnected product loop.** Source inspection and local probes establish the issues below. No learner study was run; retention and learning efficacy are unproven.

## What is actually present

`packages/engines/src/learning/fsrs.ts` implements a documented FSRS-family scheduler with reference traces, retention targets, leech rest/re-entry, replay and mastery thresholds. This is a customized scheduler: do not describe it as an untouched current FSRS implementation. Selection mixes due/new/struggling items and composition filters unpresentable or ambiguous questions. Content is data rather than question text embedded in screens.

Measured by `pnpm content:stats`:

| Dimension | Actual |
|---|---:|
| Countries | 65 |
| Fact records | 350 |
| Templates | 13 |
| Fact/template item combinations | 759 |
| Askable combinations | 696 |
| Ambiguous combinations excluded | 59 |
| Self-answering combinations excluded | 4 |
| Non-quizzable facts | 3 |
| Regions represented | 6 |
| Country distribution | Europe 19; Africa 16; Asia 14; North America 7; South America 5; Oceania 4 |
| Attributes | capitals 65; flags 65; currencies 65; calling codes 65; locations 64; languages 26 |
| Fact source coverage | 350/350 |
| Source verification dates in data | 2026-07-31 through 2026-08-10 |
| Locale coverage reported by content stats | English and Swedish 100% |

The three deliberately excluded facts are the capital entries for Switzerland and South Africa and the currency entry for Zimbabwe. Exclusion is a sound treatment of ambiguity; do not turn them into simplistic quiz answers to increase a coverage percentage. The missing location is not automatically an error either: coverage needs an editorial explanation, not invented data.

## Defects and their consequences

**L01 — Saved memory is absent from the app's content hook (P0).** [content.ts](../../../apps/mobile/src/lib/content.ts), around line 180, initializes `new Map<string, MemoryState>()` and never hydrates it. `LessonScreen.tsx:320,388,568` consumes that map for composition and optimistic grading. Explore, region, country, collection, Home and welcome-back routes also derive progress from it. `fetchProgress` returns a mastered count, not memory rows. A real scheduler on the server does not fix an empty review queue on the client.

Effects: facts keep looking new locally; the due/struggling buckets are unavailable; mastery visuals remain empty; new-item heart exemptions can disagree with server grading. Fix the shared memory source before tuning the curriculum or economy.

**L02 — Lesson randomization restarts (P1).** The hook's nonce begins at zero and composition uses `seededRng(nonce + 1)`. A remount with the same focus/count and empty history chooses the same sequence. Persist a lesson identifier/seed and vary it between lessons while preserving a resumed lesson exactly.

**L03 — Bucket overlap creates duplicates (P1).** `selectItems` concatenates `due`, `fresh` and `struggling`; an overdue struggling fact can be chosen twice before the backfill set is constructed. Local probe: count 10, distinct count 9. Decide explicitly where within-lesson relearning belongs; accidental duplication must not stand in for it.

**L04 — Recognition is treated as broad knowledge (P1).** All current templates are four-choice formats, including images/maps. Multiple render modalities are useful but do not demonstrate recall without options. Mastery is per fact across its templates, so an easy recognition success can influence a harder reverse prompt's schedule. This is a validity risk, not a proven learner outcome.

**L05 — Timing calibration is incomplete (P1).** The grader accepts per-template medians, but the reviewed server call does not supply them. Speed-based ratings fall back to the global prior. Motor speed, reading, screen readers and familiarity with the format are not interchangeable with memory strength. Keep explicit untimed/equivalent paths and validate the mapping before fitting weights.

**L06 — Offline chronology needs replay policy (P0/P1).** Server memory updates use historical answer timestamps but read current memory. A late old lesson can be applied after a newer one. Preserve event ordering and replay/version rules; do not merely overwrite `lastReviewAt` with an older timestamp.

**L07 — Content freshness metadata is not editorial certification (P1).** Crosscheck passes against a pinned independent dataset. That proves agreement with that dataset; it does not prove every answer is current on the audit date. Validation reports authored capital difficulty ranging from 1.8 for Europe to 3.7 for Africa. Replacing that with measured, cohort-aware difficulty requires data, not arbitrary edits to the numbers.

## Learning product to build

The proposed loop is: **introduce a small geographic idea → retrieve it → explain the mistake → apply it on a different presentation → revisit after a delay → show retained knowledge**. The current loop has much of the quiz machinery. It needs a curriculum and explanatory content around it.

Start with a bounded first course: a small group of countries, their locations, flags and capitals, then adjacent regions. Let learners choose freely while offering one obvious recommended next lesson. Use an optional diagnostic to skip known material; don't force every adult through a long beginner path. Teach why similar flags, neighboring countries and capital names are easy to confuse. Calling codes are a useful elective, but should not displace foundational map knowledge by default.

## Action list

Owner roles: Learning = learning/product engineer; Content = editor plus subject reviewer; Data = analytics/experimentation. Effort: S 1–2 engineer-days; M 3–5; L 1–2 engineer-weeks; XL larger/split. Estimates exclude external review waits.

| ID | Priority / owner / effort | Action and completion evidence |
|---|---|---|
| L01 | P0 / Learning / L | Hydrate account-scoped memory; persist snapshots; replay pending local answers; a returning learner receives a genuinely due fact online and after an offline restart. |
| L02 | P1 / Learning / S | Vary fresh lesson seeds; persist active seed/content version; consecutive lessons vary and resume reproduces the exact question order. |
| L03 | P1 / Learning / S | Deduplicate across selection buckets before quota backfill; property tests assert uniqueness unless an explicit relearning stage requests repetition. |
| L04 | P1 / Learning / L | Separate recognition from unaided mastery evidence; test transfer between flag, text and map formats before showing a broad “mastered” claim. |
| L05 | P1 / Learning + Data / M | Wire measured template timing or use neutral ratings pending validation; screen-reader and untimed learners get fair scheduling. |
| L06 | P0 / Backend + Learning / L | Define deterministic late-review ordering/replay with server revisions; old offline uploads never erase newer learning state. |
| L07 | P1 / Content / M | Own a fact freshness register by volatility; every changed fact carries source, date, reviewer and a correction history. |
| L08 | P1 / Learning + Content / L | Author an explicit first-week course with objectives, prerequisites and checkpoints; a new user always sees a meaningful next task. |
| L09 | P1 / Content / XL | Expand countries in complete regional groups, with named territorial scope and source policy; release claims derive from shipped counts. |
| L10 | P1 / Content / M | Add concise teaching and wrong-answer explanations, including “why this distractor is wrong”; verify samples with independent reviewers. |
| L11 | P2 / Learning / L | Add map placement/tapping with accessible sibling tasks; cover small countries, pan/zoom, disputed borders and alternative projection views. |
| L12 | P2 / Learning / L | Add typed recall and matching/ordering only where they measure useful knowledge; support accents, aliases and defensible spelling tolerance. |
| L13 | P1 / Learning / M | Add optional placement diagnostic; calibrate without granting unsupported permanent mastery or easy XP. |
| L14 | P1 / Content / M | Classify ambiguity and distractor quality per item; shared currencies/languages never produce two correct choices. |
| L15 | P1 / Learning / M | Define finite course completion and maintenance mode; a completed course offers review without pretending there is endless new content. |
| L16 | P1 / Data / L | Implement delayed 7-/30-day probes using held-out questions; report sample size, attrition and modality, not just XP or session accuracy. |
| L17 | P2 / Data / L | Fit scheduler parameters only after sufficient representative review history and holdout evaluation; version every model and retain rollback/rebuild. |
| L18 | P1 / Content / M | Establish human English/Swedish review for teaching nuance, country names, currency variants and sensitive facts; key coverage alone is insufficient. |
| L19 | P2 / Content / XL | Add licensed landmarks and cultural context after the foundational course works; imagery and facts have separate provenance records. |
| L20 | P2 / Learning / M | Add saved study lists, explicit catch-up and calm/untimed modes; user choices survive restart and never require paid access to necessary review. |

Dependencies: L01 and the identity/transaction repairs in audits 4–5 precede trustworthy learner experiments. L08–L10 should proceed before large-scale acquisition. Adding languages, astronomy or wildlife is P3 until the first subject demonstrates retention and repeat use.
