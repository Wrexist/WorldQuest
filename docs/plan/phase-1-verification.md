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

## Phase 1 still open

Continuation in progress: worldwide English/Swedish scope was confirmed by the owner.
The [launch brief](../product/launch-brief.md), [governance](release-governance.md),
[generated inventory](../engineering/project-inventory.generated.json) and
[dependency fixes](../engineering/dependency-security.md) are implemented.
Copy now avoids guaranteed retention, thirty countries per week and complete recovery.
The no-product paywall hides future benefits. Final cross-platform and rendered checks
are being collected; the original first-batch results above remain historical evidence.

- Run the corrected checks on Linux CI as well; E06 is implemented and passes on Windows but remains unchecked for that cross-platform execution evidence.
- Complete dependency reachability/fix triage and compatible update validation (E18). The audit inventory contains 38 entries / 28 unique advisory IDs; no blanket dependency upgrade is part of this first batch.
- Reconcile older project-stage/stack claims systematically (E04/P18/G20).
- Record the initial audience, first course, positioning and claim boundaries (P01/P02/P05/P08). The new backlog distinguishes release requirements from experiments (P15).

Native device behavior, live database invariants, billing and production deployment belong to later phases. This log does not certify them.
