# Full content reference and learning-state paging

The authored question packs were already published. The content tree was identical
(`fd3d93213d8b0db241240c5fa9879e43f7dea723`) on `origin/main`,
`origin/feat/learning-deep-content`, the native repair branch and the deployed
`d0bf0dcc` Worker source. All four registered worktrees had clean content directories;
none of 22 local branches contained additional fact/template/entity IDs.

The Worker compiles its catalogue from static packs in `learning-content.ts`.
There is no missing D1 content seed or migration. It contains 6,745 active facts,
6,722 quizzable facts and 94 templates. The English content-stats pass builds 26,190
question variants; variants share fact memory and are not separate things learned.
Two additional sensitive example facts exist only as authoring examples.

The reported Sweden `0 / 5` and Europe `0 / 251` were reproduced exactly by
running the existing progression engine against the app's seven bundled fact packs.
The numerator is mastered facts, not questions available. The denominator omitted
the 18 fact packs deliberately delivered only by the Worker.

## Repair

`pnpm content:reference` generates a 1,442,613-byte local reference asset from the
Worker's exact `learningContent` index. It retains every active fact's opaque ID,
entity, attribute, English/Swedish display values, quizzability and citation.
Repeated attribute labels and citations are shared. The `.bin` file is JSON text
shipped beside the Hermes bundle and read locally on native; no network is needed.
Generation is included in `pnpm generate` and a regression compares the resulting
asset against every active Worker fact.

The seven reference/progress routes share an immutable, cached read-only index.
It has no question templates. Lesson issuance, grading, rewards and offline ticket
rules are unchanged. Full reference totals are Sweden 130, Europe 2,778 and world
6,722 learnable facts. Country details include the same facts, with translated
attribute labels. Memory updates and account switches notify mounted views. Locale
changes invalidate translated view selectors while retaining the cached index.
The progression engine uses its existing per-entity fact map to avoid a full
catalogue scan for each country.

`GET /v1/learning/state?paged=1` returns at most 250 memories and a continuation
cursor containing the last fact ID and account revision. Every page checks the
authenticated owner and current revision. A concurrent revision change restarts
hydration up to three times; the client writes only the complete result, preserving
the prior cache on failure or account change. Continuations read only the account
revision and the next memory range. Requests are bounded to 100 pages. Existing
unpaged clients retain their prior response contract, including the explicit error
over 1,000 memories. The new client accepts older complete responses too. No database
migration or auth/email gate change is required; the paging endpoint needs the
updated Worker before histories above 1,000 memories can hydrate.

A separate prompt bug preferred an English article-bearing country name over the
available Swedish name. The fallback now prefers the current locale's sentence form,
then its normal name, before English. Regression cases cover GB and NL in both
languages. No authored factual values were changed.

## Validation

- Real workerd/SQLite: 1,005 memories hydrate completely in 250-row pages, another
  account reads none of them, malformed cursors fail, and a concurrent revision
  change causes a coherent restart. Full backend suite: 99 passed before adding the
  three catalogue parity tests; the additional three pass separately.
- Portable API suite: 59 passed; five additional paging tests cover completion,
  duplicate rejection, bounded restarts, account changes and legacy responses.
- Mobile content/reference/memory/D1 tests: 28 passed. The reference route tests also
  cover local read failure/retry, actual deep fact details, stable memo identity and
  a mounted English-to-Swedish switch.
- Content engine: 57 thesis tests and 12 progression tests passed. API, backend,
  content and mobile TypeScript checks passed.
- Native export with the reference asset: iOS and Android 5.13 MiB, below the
  unchanged 5.21 MiB JavaScript budget. Total separate assets were 19.17 MiB.
  Compilation/size is not native runtime acceptance.
- Rendered Swedish 390-point light/dark review: Sweden's first and last facts,
  Europe and Explore totals, wrapping and fixed practice action were inspected in
  `node_modules/.cache/wq-shared-map-review-shots`. Native runtime review remains
  part of the combined repair acceptance.
