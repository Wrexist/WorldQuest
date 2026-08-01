# Work that doesn't need artwork

Commissioning the assets in [`../design/asset-prompts.md`](../design/asset-prompts.md)
is a separate track that runs on its own clock. This is everything that can ship
**before a single illustration exists** — ordered so that each item unblocks the next
rather than by how interesting it is.

The rule that makes this possible: `ArtSlot` already reserves the right space at the
right size on every card. Real artwork is a one-line swap, not a redesign. So build
against the slot, and the art arrives into a finished app instead of a half-built one.

---

## Track A — the shell (blocks Track B entirely)

| # | Work | Why it's first | State |
|---|---|---|---|
| A1 | **expo-router `app/` tree + five tabs** | `apps/mobile/package.json` already declared `main: expo-router/entry` with no `app/` directory — the app could not boot. Every screen in Track B needs somewhere to live. | ✅ |
| A2 | **Real i18next, typed keys** | `src/lib/i18n.ts` was a hand-written shim, and `packages/i18n` declared a `types` script whose file did not exist. Every screen built before this is a screen to revisit. | ✅ |
| A3 | **Wire `packages/api` into the app** | Anonymous session on launch, generated DB types, `submitLesson` on the real queue, progress read on Home. | ✅ *(code complete — the two ⚠️ Phase 1 exit criteria still need one run on a machine whose proxy allows the Supabase host)* |
| A4 | **TanStack Query + MMKV persistence** | Server state has one owner (PROJECT.md §9). Cache persisted through MMKV, so a returning user sees real numbers in the first frame. | ✅ |

## Track B — screens that need no art

Ordered by [`build-order.md`](build-order.md) weeks 3–6, minus anything gated on
illustration. Each is a mockup screen or a hidden screen from
[`../product/screen-catalog.md`](../product/screen-catalog.md).

| # | Screen | Art needed? | State |
|---|---|---|---|
| B1 | **Settings** (#15) | None — it's rows and switches | ✅ |
| B2 | **Continents** (#9) | None — the continent grid is colour + type | ✅ *(plus `/region/[code]`, the country list inside one)* |
| B3 | **Country page** (#7) | Flag image is an `ArtSlot` until the sourced files land; the flag *description* is real content | ✅ |
| B4 | **Daily Quest** (#4) | None as built — the five tasks are type and progress | ✅ |
| B5 | **Profile** (#13) | Avatar → initials fallback already exists | ✅ |
| B6 | **Hidden screens H1–H22** | H8 (crash) and H9 (404) done — the two whose absence is a white screen. H6/H11/H15 already inline. The rest wait on accounts and social. | 🟡 |

Deliberately **not** here: Onboarding (#1–2) and the Explore globe (#8). Onboarding is
the app's first impression and is the one place placeholder art actively misleads;
the globe needs map geometry, which is an unresolved licensing decision
([`phase-0-checklist.md`](phase-0-checklist.md)).

## Track C — engines (pure, testable, zero UI)

| # | Work | Notes | State |
|---|---|---|---|
| C1 | **Achievements rule engine** | Six rule types, incremental, backfillable + a 12-definition starter catalogue (content) + the screen | ✅ |
| C2 | **Quest engine** | Daily generation, progress, expiry. Weekly quests are v1.5 and deliberately not built. | ✅ *(daily)* |
| C3 | **Progression / region mastery** | Roll fact mastery up to country → region → continent → world | ✅ |
| C4 | **Streak freeze + repair** | Freeze cap, 48-hour repair window, 30-day cooldown — all against the balance table, none invented | ✅ |

These are the highest-value items on the whole list per hour spent: they're pure
functions, they're where the product's behaviour actually lives, and they can't be
blocked by anything.

## Track D — content

| # | Work | Notes | State |
|---|---|---|---|
| D1 | **Beyond 5 countries** | The long pole. Every fact needs `source` + `verifiedAt`. Ship in subregion-sized batches so progress is visible. | 🟡 *(east-asia + western-europe — 15 countries, 31 facts, 73 items, all reachable)* |
| D2 | **More question templates** | `tpl.flag-of-country.mc4` — country → flag description, the reverse of the existing pair. Five templates now; each multiplies across every fact already written. | ✅ |
| D3 | **Authoring ergonomics** | `content:preview` (reads every generated question, gates CI) and `content:stats` (says which subregion to author next). Both were advertised in `package.json` and neither existed. | ✅ |

`content:preview` found two shipped bugs the moment it first ran, which is the argument
for it: the capital prompt rendered the literal text `{country}` because the engine
emits `entityName`, and the reverse-capital hint read *"Sweden is Stockholm."* Neither
was reachable by any test we had — the screenshot harness hand-writes its prompt, and
the one lesson component test happened to draw a flag question.

## Track E — quality

| # | Work | State |
|---|---|---|
| E1 | Component tests for every screen's five states | ✅ *(all seven screens — 65 tests)* |
| E2 | Maestro E2E: first launch → taster lesson → progress persists | ⬜ |
| E3 | CI: RLS tests on a local stack, migrations from empty, economy health, generated files, and content that reads correctly | ✅ *(re-done — see below)* |
| E4 | `en-XA` pseudo-locale — `enablePseudoLocale()` builds it in memory from the English bundle at runtime, so it can never be stale | ✅ |

### E3, corrected

The first version of the CI workflow had three steps of the form *"regenerate the file,
then `git diff --exit-code` it"* — for `tokens.ts`, `keys.ts` and `database.types.ts`.
All three files are in `.gitignore`. **Git does not diff files it is not tracking, so
all three passed unconditionally**, on any change, forever. The same false-green shape
I'd already caught and removed for the edge-function bundle, two steps further up the
same file.

Worse, the `verify` job could not have survived a fresh checkout at all: `packages/api`
imports `./database.types.js`, and nothing in that job creates it.

The fix splits the two cases that were being treated as one:

- **Derivable from this repo** (`tokens.ts`, `tokens.css`, `keys.ts`) — untracked, and
  rebuilt by `pnpm generate`, which now runs on install and at the head of `pnpm verify`.
  A file rebuilt before every use cannot be stale, so there is nothing to check and the
  check is gone.
- **Needs a running Postgres** (`database.types.ts`) — now **committed**, so a fresh
  clone typechecks. Its freshness is checked by the `database` job, which has a local
  stack, regenerates it and diffs. That check is real *only* because the file is tracked.

`pnpm db:types` also pointed at the hosted project while CI generated from `--local`,
so the two would have disagreed the moment the two schemas did. Both read from the
migrations now.

## Track F — the visual gap that isn't art

| # | Work | Notes | State |
|---|---|---|---|
| F1 | **Bundle Inter + Baloo 2** | Both OFL, both free. Loaded per weight — `fontFamily` + `fontWeight` does not combine for custom fonts on React Native, so this needed the `text()` helper and a guard, not just the files. | ✅ |
| F2 | **Card gradients** | Semantic `gradient.*` tokens, drawn by `Card`, with a flat fallback where there is no native module | ✅ |
| F3 | **Motion pass** | `useReducedMotion` / `useTiming` / `useCelebration`, all token-driven, with a guard against raw durations | ✅ |

---

## What I'd do in what order

~~A1 → A2 → A3 → F1 → B1 → B2 → C1 → B4 → C2 → C3 → C4~~ — done.

**Remaining:** the rest of B6 (gated on accounts and social) · E2 (Maestro) · D1 (content volume).

`pnpm content:stats` names each batch directly. It reported **23 of 25 questions
reachable**, both gaps in `east-asia`, which had one member — so that subregion was
authored first: China, South Korea, North Korea and Mongolia, each with a capital and
a flag description, every fact carrying the source it was checked against. That is
**45 of 45 reachable** now, and it is the rule for every batch after it: a subregion
below four entities cannot fill a four-option question, so countries authored into a
lonely subregion teach nobody until their neighbours land. Author by subregion, never
by interest.

Authoring east-asia also exposed a defect that five countries in one region had hidden
completely — `visually-similar` matched any shared tag except `core`, which included
`flag`, so it had always meant "any country at all". The first Swedish flag question
offered against China and Mongolia made it obvious. Similarity is now declared in
`like:` tags ([`../systems/content-pipeline.md`](../systems/content-pipeline.md#like-tags--how-similarity-is-authored)).
Worth stating plainly: no test caught this, and no test could have — it needed content
from a second region and someone reading the output.

Western Europe followed — France, Germany, Belgium, the Netherlands, Austria,
Switzerland — and reading *its* output caught the next one: **"What is the capital of
Netherlands?"** A country whose name takes an article cannot be fixed in the
translation catalogue, because one template string serves every country, and it cannot
be fixed in `names` either, because a country list has to file the Netherlands under N.
Entities now carry an optional, localised `namesInSentence`, used for prompt params and
never for answer options. Localised rather than an `article` boolean on purpose: the
languages after Swedish need an oblique *case*, not a word in front.

**Two things are deliberately withheld for a human decision**, per the
sensitive-content policy — flag it, do not resolve it:

- **Taiwan**, absent entirely. East-asia by geography, contested by status.
- **Switzerland's capital**, authored but `review-required` and therefore not
  quizzable. The Swiss constitution names no capital; Bern is the *Bundesstadt*.
  Every atlas answers "Bern", which is exactly why it was worth stopping over —
  the easy default is the one that ships a confident wrong answer.

Two facts are now flagged for review and `pnpm content:validate` reports both.

E2 is deliberately last and deliberately not started here: a Maestro flow written
without ever running it against a device is a file full of guesses about selectors and
timing. It needs one session on a machine with a simulator, and until then writing it
would be the same false-green as a CI step that checks nothing.

The starter catalogue is 12 definitions, deliberately. The ~300 in
[`../systems/achievements.md`](../systems/achievements.md) arrive in batches once the
content packs are deep enough for them to be reachable — an achievement for 100 flags
is a locked row for everyone until there are 100 flags to master.

Track D runs in parallel from day one by someone who isn't writing code — that's the
rule from [`build-order.md`](build-order.md) and it hasn't changed.

**Live status of this list lives here.** Tick a row in the same PR that does the work.
