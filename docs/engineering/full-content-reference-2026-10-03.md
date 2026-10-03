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
migration or auth/email gate change is required. The updated Worker was deployed
after local and CI transaction proofs passed; details are recorded below.

A separate prompt bug preferred an English article-bearing country name over the
available Swedish name. The fallback now prefers the current locale's sentence form,
then its normal name, before English. Regression cases cover GB and NL in both
languages. No authored factual values were changed.

## Production deployment

Deployed on October 3, 2026 from source commit
`1ee48733c96783897f0fcd399afe072a900f05f7` to the existing
`worldquest-production-api`, using `packages/backend/wrangler.production.jsonc`.
The backend source matches the reviewed `5485deca` candidate; the later commit
contains mobile translation keys and review documentation.

- Active Worker version: `4e21ef6a-41b9-49d3-8c51-0dd9ec6e58a1`, at 100%.
- Deployment: `64a4a552-0707-44de-a77d-6eba0893e505`, created
  `2026-10-03T14:18:25.285319Z`.
- Preflight verified a clean backend/engine/content tree, the existing production
  Worker and D1 binding, and unchanged gates. Wrangler 4.131.1 dry-run packaging
  passed: 6,654.29 KiB upload / 785.62 KiB gzip.
- Deployment used `--keep-vars`; no migrations, secret updates or production data
  seeding were run. Post-deployment binding readback confirmed `API_ENABLED=true`,
  `EMAIL_AUTH_ENABLED=false`, `LEAGUES_ENABLED=false`, `CHALLENGES_ENABLED=false`
  and the same production D1 database.
- At `2026-10-03T14:19:09.056Z`,
  `https://api.worldquest.dpdns.org/health` returned HTTP 200 and
  `{"service":"worldquest","backend":"cloudflare-d1","apiEnabled":true}`.
- The existing explicit-target hosted guest smoke ran once against the new version.
  Five issued Swedish beginner questions passed the shipped parser and temporary
  guest deletion was confirmed. It sent no email, submitted no answers and awarded
  no rewards. The 1,005-memory proof remains isolated local/CI evidence; no such
  history was seeded into production.

Commands were checked against the installed CLI and
[Cloudflare's Wrangler documentation](https://developers.cloudflare.com/workers/wrangler/commands/general/).

## Validation

### Native bundled-file correction

The uninstrumented iOS run `37128874643` reached Explore and displayed the reference
load error before creating the globe. Its packaged catalogue was present and
byte-identical to the generated 1,442,613-byte asset (6,745 facts); packaged
`countries.bin` also matched the 904,180-byte source file.

The installed Expo SDK 54 implementation explains the failure: `File.text()` and
`File.bytes()` in `expo-file-system/ios/FileSystemFile.swift` request `.write`
permission, while Expo Modules Core grants paths under `Bundle.main.bundlePath`
only `.read`. `Asset.downloadAsync()` returns these existing file URLs directly.
Both the reference text reader and atlas geometry reader now use the supported
`expo-file-system/legacy` `readAsStringAsync`, whose native path checks `.read`.
Text uses UTF-8; binary uses Base64 and an explicit `base64-js` decoder, without
assuming Hermes provides `atob` or Node's `Buffer`. Texture URIs and web loaders
are unchanged. A small JavaScript boundary re-exports the official runtime entry;
its paired declaration re-exports Expo's own published legacy types, avoiding the
package entry's TypeScript source error under `exactOptionalPropertyTypes` without
weakening the app's checks or redirecting runtime resolution.

Native-boundary JavaScript regression tests check the actual resolved local URI,
UTF-8 Swedish text, byte-for-byte roundtrip and parsing of the real geometry asset,
padding/empty buffers, unavailable `atob`, non-local URI rejection, and untouched
texture handling. These tests cannot enforce iOS permissions: a new uninstrumented
native acceptance run must prove catalogue and globe loading before release.

### Combined candidate checks

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
