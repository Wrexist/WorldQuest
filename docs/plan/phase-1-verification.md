# Phase 1 work log

Started 13 September 2026 on `fix/phase-1-verification`. [Complete eight-phase checklist](execution-plan.md).

Scope of the first batch: repair verification and evidence tooling without changing learning, rewards, accounts or backend providers. This serves all existing learner personas by making regressions visible before release.

## Implemented and checked locally

- E05: root workspace filters now use portable double quotes and `--fail-if-no-match`.
- E06: generated-header, balance-documentation and edge code-budget checks accept Windows line endings without raising the budget or weakening content assertions.
- E07: native export invokes the installed Expo CLI through Node, avoiding the Windows `npx.cmd` spawning problem, and reports the process error.
- E08: browser contexts specify English and a timezone; screenshot names are Windows-safe; route mismatches and an unrecognized onboarding state fail instead of producing mislabelled evidence.
- E09: capped mobile test workers at four, preserving the five-second behavioral timeout; subscription sync passes in two complete workspace runs after reproducing the failure with the default worker count.
- Fixed Windows file-URL conversion in accessibility/reachability and slash normalization in reachability exclusions and escape-hatch allowances. No new allowance or lint suppression was added.
- Added four harness regression tests and included them in `pnpm test`.

## Verification

- `pnpm verify`: passed, including 1,333 workspace tests, 162 edge/tool tests and four harness regressions (1,499 total). The recovered documentation suite adds 65 checks that previously failed to collect.
- `pnpm bundle:native`: passed for iOS and Android, both under the unchanged 4.6 MiB gate.
- `pnpm a11y:tree`: passed on ten routes; this checks Chromium's accessibility tree, not native screen-reader behavior.
- Browser E2E: 76/76 reported checks passed, with one image-prompt branch skipped; deterministic image-mode coverage remains E16.
- Design screenshots: original driver passed across 18 routes at 320/390/768 widths plus 102 flow captures, with no standard measurable findings. Home and unavailable-store paywall captures were manually viewed; this is not manual review of every image or native-device certification.
- A deliberately missing workspace filter exited nonzero; the root scripts no longer silently accept an empty selection.
- The final query-mode guard was also checked with the four targeted harness tests after the full verification run.
- Store screenshot script: syntax checked and shared browser-context configuration updated; the full store compositor was not rerun.

Saved evidence: [results](phase-1-evidence/results.json), [design measurements](phase-1-evidence/design-measurements.json), [Home at 320](phase-1-evidence/home@320.png), [account at 320](phase-1-evidence/account-mode-link@320.png), [paywall at 320](phase-1-evidence/paywall-source-settings@320.png).

The first concurrent browser attempt was invalidated by another command rebuilding their shared web export. Those captures were discarded. The successful E2E uses the original driver against the completed fresh export; no application/test assertions were relaxed. Keep export stages sequential, as documented in the testing strategy.

Audit correction: reviewing the original saved logs showed that accessibility lint, escape-hatch and reachability checks had failed during the audit, despite their earlier pass labels. The audit evidence tables now record the original failures; the fixes and passing reruns belong to this phase.

## Continuation: launch, dependency fixes and CI

**All 14 Phase 1 actions have completion evidence.** The earlier missing-label finding was incorrect: original-resolution inspection and decoded pixels prove the label was painted in the original iOS 26.4 screenshot. See the correction below. The original first-batch results above are preserved as history; [continuation results](phase-1-evidence/continuation-results.json) record the earlier work.

| Action | Completed work |
|---|---|
| E04 / P18 | Corrected README/PROJECT stack and stage claims; marked earlier roadmaps/checklists as historical; removed superseded package/workflow implementation-history comments; added `pnpm status:generate` and a freshness gate in `pnpm verify` |
| E06 | Same dependency-fix revision passed `pnpm verify:full` on Windows and Ubuntu CI, including the repaired LF/CRLF-sensitive checks |
| G20 | One current release checklist, evidence log, accountable roles, quarterly competitor review (next 13 December), and security-backport review before 13 October |
| P01 / P02 | Owner-confirmed worldwide English/Swedish scope, geography beginners aged 16–24, broader/younger personas retained, observable learning promise |
| P05 | One seven-day World foundations course specification, twelve existing country IDs, daily recommendation order and boundaries for Phase 3 implementation |
| P08 | Corrected Home timing copy, onboarding retention/coverage claims, account recovery wording, and no-product paywall behavior; English/Swedish listing drafts; existing store screenshots marked unapproved historical assets |

References: [launch brief](../product/launch-brief.md), [governance](release-governance.md), [inventory](../engineering/project-inventory.generated.json), [security assessment](../engineering/dependency-security.md).

The purchase port now reports no products when no adapter is installed, rather than a retryable network error. No-product pages hide future Premium perks. Billing implementation and benefit enforcement remain Phase 5. The first-week curriculum is specified, not falsely marked as shipped scheduling/content.

## Dependency verification

The registry scan fell from **38 entries / 28 distinct advisories** to **three entries**. Version-scoped updates resolve the other entries. The remaining two image-parser advisories and one decoder advisory are covered by local patches, installed-file and patch hashes, bounded behavioral regressions and an expiring policy. Raw findings remain visible. [Saved scan](phase-1-evidence/security-report.json).

`pnpm security:check` passes with no unexpected findings. Native exports remain below the unchanged 4.6 MiB limit. Expo's public configuration command passes. The Monday security workflow is configured; scheduled execution begins only after merge to the default branch.

## Execution and rendered evidence

- Full local `pnpm verify`: **1,505 tests** (1,334 workspace, 162 edge/tool, nine Node), plus all other gates. Final copy-specific rerun: 87 tests across four affected component files; localization checks passed.
- [CI baseline](https://github.com/Wrexist/WorldQuest/actions/runs/34748647171), revision `59f1be7`: Windows and Ubuntu `verify:full`, dependency checks and the local-stack database job all passed. [Machine-readable evidence](phase-1-evidence/ci-baseline.json).
- Final application revision `24d54ea` adds the shorter copy and six additional browser checks. [CI run](https://github.com/Wrexist/WorldQuest/actions/runs/34749106906) **passed on Windows and Ubuntu**, including 1,505 tests on each, native exports, 82 browser checks and accessibility-tree checks. The database job also passed. [Final CI evidence](phase-1-evidence/ci-final.json).
- Final local browser E2E: **82/82 reported checks pass**, one image-mode branch skipped. All three onboarding slides in **both languages** have explicit full-text bounds checks at **320×568 and 200% text**. [Check output](phase-1-evidence/browser-checks.txt). The skipped image branch remains E16.
- Accessibility tree: ten routes pass. Full design driver: 18 routes at 320/390/768 plus 102 flow captures, zero standard measurable findings; final shorter copy additionally captured at 100%/200% in English/Swedish.
- Manually inspected onboarding, account, paywall, Home and profile captures. [English onboarding 100%](phase-1-evidence/en-onboarding-slide-1-100.png), [200%](phase-1-evidence/en-onboarding-slide-1-200.png), [Swedish onboarding 200%](phase-1-evidence/sv-onboarding-slide-1-200.png), [account 200%](phase-1-evidence/en-account-200.png), [Swedish paywall 200%](phase-1-evidence/sv-paywall-200.png).

The focused review caught [clipping in the first draft of the new onboarding copy](phase-1-evidence/intermediate-onboarding-clipping.png), plus an overlong account header and Swedish paywall heading. Shorter copy fixes those without changing carousel gestures. The new geometry check initially flagged wrapper padding on a fully visible slide; it now measures the actual title/body bounds. The corrected full run passes; no failing content check was removed.

Final onboarding evidence comes from a fresh browser context for each language/slide. Temporary captures that restored inline styles within the same carousel session could overwrite React's updated measured layout; those later-slide captures were discarded. The committed E2E helper avoids that restoration and checks the actual full text bounds.

Scope limits remain visible: Home's main button is below the initial 320-point fold (U01); decorative onboarding art can crop at large text (U09/U15); account and paywall content may require scrolling; the profile capture in the fresh session is its empty state. These captures do not certify a finished redesign, OS font scaling, native screen readers, native gestures or physical-device performance. Those checks remain in U09–U15/E13/A11.

## Remaining acceptance: E18

An Android 15 emulator and local SDK are available. Expo Android prebuild completed; native compilation encountered Gradle 8.14.3 cache-rename `AccessDeniedException` failures. The same failure recurred with an isolated cache and a single worker. Scoped recovery after Gradle exited, using the [upstream issue's documented workaround](https://github.com/gradle/gradle/issues/31438), advanced through configuration but still failed at `:app:checkDebugAarMetadata`. Four further retries promoted only verified temporary workspaces inside the task's isolated cache; recovery stopped when cache state changed. No APK was produced or installed. The exact underlying lock owner has not been identified.

Expo also explicitly refused iOS prebuild on this Windows host; this attempt is not a passing iOS check. The non-blocking Android prebuild warning about missing `expo-system-ui` is recorded for U09/A11: the configured native system appearance needs verification when the app can run.

Next E18 acceptance work: build this lockfile on a compatible Android build host and a macOS/Xcode iOS host, then install and exercise startup, local storage, navigation/deep-link decoding and bundled assets. Keep the tested package versions and avoid treating a major Gradle/Expo upgrade as a routine cache fix. Record actual OS/build versions and repeat the affected native paths before checking E18.

Native Android execution and iOS device compatibility remain unverified until a built application is installed and exercised. Broader supported-device, privacy, billing and production-release acceptance remain in their assigned later phases. No backend migration, store submission or production deployment has occurred.

### Later native evidence

The host blocker above was subsequently resolved with Linux Android compilation
and macOS 15 iOS compilation. Both jobs passed in
[run 34750705925](https://github.com/Wrexist/WorldQuest/actions/runs/34750705925).
Android startup, onboarding and restart were exercised locally; the iOS simulator
startup image was inspected. E18 journey acceptance is carried into the
[Phase 2 work log](phase-2-verification.md), which records the newer evidence.

### E18 acceptance update - 13 September 2026

The compatible dependency updates now have passing native build and journey evidence.
Android 15 / Pixel 6 completed onboarding, lesson navigation, restart persistence
and an encoded Sweden deep link using [build 34752521529](https://github.com/Wrexist/WorldQuest/actions/runs/34752521529).
iPhone 16 Pro / iOS 18.5 passed the same journey in
[replay 34753801839](https://github.com/Wrexist/WorldQuest/actions/runs/34753801839),
using the recorded `f560dcc` simulator binary. Screenshots were inspected for bundled
fonts, flags, art and maps. The Windows Gradle host failure above is historical,
resolved by building on compatible CI hosts without a major Expo/Gradle upgrade.

E18 remains open: the additional iOS 26.4 journey passed its assertions, but both
country screenshots show a blank primary button. The same binary shows its label
on iOS 18.5. The cause is unverified; an automated journey pass does not resolve
this rendering difference. Connected backend/auth acceptance,
the later query-cache fix on native devices, physical accessibility/performance
and the full TestFlight device matrix remain separately tracked in Phase 2/A11.

### Full-resolution correction - 13 September 2026

The original iOS 26.4 screenshot was reopened at its native 1206 x 2622 pixels.
The practice label is visible. Decoding the original PNG finds 6,149 light label
pixels inside the green button; the newer candidate capture has the same count.
The earlier preview-based finding was incorrect, not an application regression.
The speculative clipping change was reverted. E18 is complete using the original
native journey/build evidence, with a new paint check guarding future captures.
The app's native account integration and full release device matrix remain open.
