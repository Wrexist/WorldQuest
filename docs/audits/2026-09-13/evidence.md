# Evidence, commands and limitations

Audit date: 13 September 2026. Repository baseline: `59d39032a0a5103f1914e63c6614a6b55bd86400`. Workspace: Windows PowerShell, Node 22.18.0, pnpm 9.15.0. Initial tracked working tree was clean. Audit changes are documents and selected rendered evidence; application code and test expectations were not edited.

## Coverage

Read root project instructions, product/architecture/release documents, repository audit skills, package scripts, routes and feature hooks, API client and types, pure learning/reward engines, content packs and validators, local persistence/sync/auth/analytics, purchase abstractions, server handlers and the latest definitions across 33 SQL migrations. Tested exported web journeys and built native bundles. Researched current official competitor/backend/Apple pages; citations are beside claims in the individual audits.

This is not a complete native competitor teardown, penetration test, legal certification, production database inspection or device performance profile. No production credentials or user data were extracted, no hosted exploit was attempted and no infrastructure was changed. No native competitor onboarding timings, VoiceOver session or balanced 20 low-/20 high-rating review sample was completed. Existing research should not be presented as fresh field evidence.

## Executed verification

| Command / check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | Passed; dependencies installed, lockfile unchanged |
| `pnpm audit --prod --json` | Exit 1; metadata reports 0 critical, 30 high, 8 moderate, 0 low/info; 742 dependencies. Tooling paths are included, so exploitable runtime exposure is not established by these totals. |
| `pnpm verify` | Failed at edge code-size test; Windows single-quoted workspace patterns matched no projects earlier in the chain |
| `pnpm -r --filter "./packages/*" --filter "./apps/*" typecheck` | Passed |
| Edge TypeScript check within root verification | Passed |
| `pnpm -r --no-bail --filter "./packages/*" --filter "./apps/*" test` | 1,266 passing tests; two failing cases and one failing suite collection |
| Isolated `useSubscriptionSync.test.ts` retry | 4/4 passed; full-suite timeout remains to investigate |
| `pnpm content:validate` | Passed with one authored-difficulty warning |
| `pnpm content:crosscheck` | Passed; 349 compared values, six recorded divergences |
| `pnpm content:preview --quiet` and `pnpm content:stats` | Passed |
| `pnpm i18n:check` | Passed: 639 keys, 22 namespaces, two locales, 1,278 runtime strings |
| `pnpm design:contrast` | Passed: 27 curated and 35 generated checks, zero waivers |
| `pnpm lint:a11y`, `pnpm escape-hatches`, `pnpm reachability` | Failed on Windows: malformed file-URL conversion in a11y/reachability and mismatched path separators in escape-hatch allowances. Corrected from an earlier mistaken pass summary after re-reading the saved logs during Phase 1. |
| `pnpm check:sql`, `pnpm five-states`, `pnpm scrollable` | Passed; these static checks do not execute the full database |
| `pnpm engines:simulate`, `pnpm check:eas` | Passed; config validation does not verify hosted signing/store state |
| `pnpm bundle:native` | Failed to spawn `npx` on Windows; direct exports below passed |
| Direct Expo iOS export | Passed; Hermes bytecode 4,766,007 bytes (4.545 MiB) |
| Direct Expo Android export | Passed; Hermes bytecode 4,764,370 bytes (4.544 MiB) |
| Web export | Passed, then used for browser checks |

The workspace test breakdown: design 43 pass; analytics 6 pass; API 16 pass / 1 fail; i18n 28 pass; engines 492 pass / one suite fails to collect; content 7 pass; mobile 674 pass / 1 timeout. Separately, edge tests in the root run had 161 pass / 1 fail. Counts are separated deliberately; the isolated retry is not an additional distinct coverage claim.

Dependency evidence: [registry audit summary](dependency-audit-summary.json), containing 38 entries, 28 unique advisory IDs and eight package names, with installed versions, patched ranges, advisory URLs and two example dependency paths per version. The audit was repeated to save structured output after the first console result was too large; both reported the same severity totals. Exploitability and compatibility of suggested updates remain unverified.

Failing cases: API `database.types.test.ts` expects an LF-only header; engines `xp/doc-parity.test.ts` searches an LF-only fenced block and fails collection; edge generated-bundle size counts extra CRLF characters; mobile `useSubscriptionSync.test.ts` exceeded its 5-second timeout during the full run. Normalizing strings only in a diagnostic gives:

```text
edge stripped code: raw 63658; LF-normalized 60756; limit 62000
API generated-header match: false raw, true after LF normalization
BALANCE documentation-fence match: false raw, true after LF normalization
```

This identifies portability defects; it does not turn the original failed verification into a pass. No tracked source was normalized to obtain a green run.

Direct native export commands:

```powershell
pnpm --filter @worldquest/mobile exec expo export --platform ios --output-dir ../../node_modules/.cache/wq-audit-ios
pnpm --filter @worldquest/mobile exec expo export --platform android --output-dir ../../node_modules/.cache/wq-audit-android
```

Current script budget is 4.6 MiB, despite MB wording. Both direct bytecode files are below it, with narrow headroom. These are bytecode sizes, not installed app size, full assets, startup time or frame-rate evidence.

## Browser evidence and corrections

The original design runner generated filenames containing `?`, illegal on Windows. Its first captures also inherited Swedish locale while its onboarding walker expected English; eleven nominal routes showed the same onboarding screen. Those captures were rejected as route evidence.

Temporary copies loaded the original scripts with only runner adaptations: sanitize filename characters and set Playwright page/context locale to `en-US`. No app implementation or assertions were relaxed. The successful run captured 18 routes at widths 320, 390 and 768, plus 102 flow screenshots. The original E2E similarly failed an English selector under Swedish locale; with explicit English context it reported 76/76 checks passed, with one image-prompt branch skipped because that lesson did not contain it. An explicit image fixture is still needed for deterministic coverage.

The adapted accessibility-tree run passed mechanical checks on ten routes. This is Chromium's accessibility representation, not native VoiceOver/TalkBack behavior. Standard design measurements reported no undersized target, unnamed control or sideways overflow issues in that run; pseudo-localization identified plain country names requiring review. Selected screenshots were manually inspected, not every generated image.

Durable evidence: [measurement report](design-measurements.json), [home at 320](screens/home@320.png), [home at 390](screens/home@390.png), [lesson](screens/lesson@390.png), [explore](screens/explore@320.png), [country](screens/country-SE@390.png), [account](screens/account-mode-link@390.png), [paywall](screens/paywall-source-settings@390.png), [summary](screens/lesson-summary@320.png).

Temporary runners and complete capture sets remain under `node_modules/.cache/` for this workspace session. Command logs are in the operating-system temporary directory as `worldquest-audit-*.log`; those are disposable, so the audit records material results here rather than relying on them as permanent links.

## Local correctness probes

**Selection uniqueness:** construct one memory state eligible for both due and struggling selection, compose a ten-slot lesson through the existing selection function and count distinct fact IDs. Observed ten selected entries and nine distinct facts. The cause is concatenation of overlapping buckets before global deduplication. See [selection engine](../../../packages/engines/src/learning/selection.ts).

**Quest validation:** submit a local parser fixture containing eight distinct arbitrary slot names, all targeting the same `geo.SE.capital` fact with target one. The parser accepts it; the existing quest replay marks all eight completed after one correct answer. This is a local pure-code reproduction. The inspected server pins the supplied tasks, and SQL distinguishes payout slots by their names; therefore canonical validation must precede pinning. No real account was paid and no hosted endpoint was attacked. See [submission parser](../../../supabase/functions/_src/_shared/parse-submission.ts) and the quest/reward findings in [audit 5](05-security-privacy.md).

**Memory wiring:** source inspection shows `useContent` creates an empty `Map<string, MemoryState>` and never hydrates it, while `fetchProgress` requests aggregate counts. The existence of server user-fact records and FSRS unit tests does not connect those records to local lesson selection. The multi-day user journey must be tested after repair.

**Account lifecycle and concurrency:** cross-account queue/cache risks, stale reads before SQL locking, freeze overwrites and deletion-trigger conflicts were established by tracing current source/migration definitions. They were not reproduced against a live database. Add real integration tests before treating a mitigation as complete.

## Content inventory

11 packs; 65 country entities; 350 fact records; 13 templates; 759 fact/template combinations; 696 askable combinations; 59 ambiguous combinations; four self-answer combinations; three nonquizzable fact records. The tool reports 347 quizzable facts. These categories are tool outputs and should not be conflated with the number of independent lessons.

Country distribution: Europe 19, Africa 16, Asia 14, North America 7, South America 5, Oceania 4. Fact kinds: capital 65, flag 65, currency 65, calling code 65, location 64, language 26. Source/date fields exist for every fact, with checked dates between 31 July and 10 August 2026; this is metadata coverage, not a fresh manual verification of every claim. English/Swedish content coverage is complete by the validator. All current templates use four-choice answers, including visual map/flag forms.

## Unfinished evidence, explicitly

Real database reset/migration execution, RLS/authorization integration, concurrent production-like transactions, native build installation, StoreKit sandbox receipts, TestFlight, physical-device accessibility/performance, current hosted configuration, App Store account agreements, actual retention/revenue and hands-on competitor research all remain unverified. Their tasks appear in the action lists and release matrix. A local EAS configuration pass and successful Hermes export should never be used to check those boxes.
