# Audit 4: architecture, reliability, testing and performance

**Verdict: preserve the engine boundaries; fix integration and operational evidence.** There are 33 database migrations and a substantial test suite. Several very important defects live between tested modules.

## Architecture findings

Pure TypeScript engines and data-driven content are assets. Expo Router screens delegate much domain logic appropriately. The API package offers useful domain functions, but its exported client is a Supabase client and mobile code imports backend-specific helpers directly. The comment saying another backend only requires rewriting one file is inaccurate: auth, queue delivery, queries, SQL triggers, migrations, functions, tests and deployment all participate.

The most serious integration gaps are covered in L01 and S01–S06. Add journey tests that span auth → first lesson → server acceptance → memory hydration → next session. Tests of isolated engines cannot prove that a user ever gets a due review.

**E01 — Offline retry can stall.** `lib/sync.ts` keeps `nextAttemptAt`, but does not set a timer for the next attempt. `flush()` runs after enqueue, connectivity events or explicit retry. A recoverable 500 while connectivity stays online can leave work waiting indefinitely until another trigger. On app resume, time-zone sync exists; a general outbox-resume policy is not evident.

**E02 — In-progress lesson is not durably resumed.** The completion queue is persistent, but `useLesson` holds the active state in `useReducer`. No active-lesson persistence/recovery is present in that hook. Distinguish a finished lesson surviving restart from a half-finished one surviving restart.

**E03 — Empty/read-error defaults must differ.** Grading should never treat a failed required query as empty legitimate state. UI caches may degrade gracefully; authoritative writes need stronger semantics. See S12.

**E04 — Document and comment drift is severe.** Root documents still describe a pre-code stage and an older stack; current code includes account flows and paid reward RPCs. Some comments describe freeze delta behavior not implemented by the latest SQL. A long explanation beside code is not a substitute for a regression test across migrations.

## Actual verification results

| Check | Result and interpretation |
|---|---|
| Frozen install | Passed with pnpm 9.15.0 / Node 22.18.0 |
| Production dependency audit | Exit 1: zero critical, 30 high, eight moderate reported; runtime versus tooling reachability remains to triage. See audit 5. |
| Root `pnpm verify` | Failed. On Windows its quoted workspace filters matched no projects; edge tests ran and one code-size assertion failed. It did not certify all packages. |
| Explicit workspace typechecks | Passed for packages and mobile; edge typecheck also passed in root run |
| Explicit workspace tests with `--no-bail` | 1,266 tests passed, 2 test cases failed, plus one suite failed during collection; details in evidence.md |
| Isolated subscription test retry | Four tests passed; the full run's timeout was not reproduced in isolation |
| CRLF diagnostic | Backend stripped-code size 63,658 characters; normalizing LF gives 60,756 under the 62,000 limit. Header and fenced-code failures also disappear under LF normalization. |
| Content, i18n, contrast, SQL grant scan, five states, scrollability, economy simulation, EAS config | Passed when run separately; content validation emitted one authored-difficulty warning |
| Static accessibility, escape hatches, reachability | Correction during Phase 1: the saved audit logs show failures, not passes. Two scripts misread Windows file URLs; the allowance scan compared backslashes with slash-based keys. See the Phase 1 work log for repairs. |
| Original native bundling script | Failed to spawn its command on Windows; it did not prove either platform's module graph was broken |
| Direct iOS / Android exports | Both passed; iOS 4,766,007 bytes (4.545 MiB), Android 4,764,370 bytes (4.544 MiB), versus the current 4.6 MiB gate. |
| Original design / E2E harness | Windows filename and inherited-language issues; first outputs rejected as evidence |
| Adapted design harness | 18 routes × 3 sizes plus 102 flow captures; no standard target/name/sideways issues reported |
| Adapted E2E | 76/76 reported checks pass, one image-question check skipped because that lesson had no image prompt |
| Adapted accessibility tree | Ten routes passed mechanical names/order checks |
| Real database and native device tests | Not run; no live infrastructure state or native execution certified |

Normalization and browser-locale adjustments were made only in temporary audit runners. No application source, test assertions or committed scripts were changed to obtain these results.

## Performance interpretation

The exports show that Metro resolves the graph and Hermes bytecode is generated. They do not establish startup latency, frame rate, memory, battery drain or installed size. The repository reports MiB using `1024²` but often labels it MB; use units consistently. Current native headroom is small. Do not raise the budget blindly, but do not delete necessary crash/billing instrumentation solely to satisfy an old arbitrary number either: measure the real device cost and make the tradeoff explicit.

Keep bundled base content. Build expensive content indices once per content version where profiling justifies it. Before increasing to full world coverage, profile collection scrolling, search, lesson composition and large-state restoration. Do not prescribe memoization or a list-library migration without measured render/scroll costs. Native heap and UI-thread measurements belong on release builds.

## Action list

| ID | Priority / owner / effort | Action and completion evidence |
|---|---|---|
| E01 | P1 / Mobile / M | Schedule bounded retry wake-ups and foreground/reconnect drain; a single transient failure recovers without another lesson. |
| E02 | P1 / Mobile / M | Persist/recover active lessons and handle corrupt/full storage explicitly; no silent disappearance of answered items. |
| E03 | P0 / Backend / M | Fail required reads before writes; injected failures preserve previous state and retry once safely. |
| E04 | P1 / Engineering / M | Replace stale status claims with generated inventory and dated evidence; clean superseded implementation-history comments. |
| E05 | P1 / Tooling / M | Fix Windows workspace filter quoting; fail when expected packages are absent and print checked package count. |
| E06 | P1 / Tooling / S | Normalize LF-sensitive fixtures/budget counts or enforce checkout EOL with `.gitattributes`; the same commit has equivalent results on Windows/Linux. |
| E07 | P1 / Tooling / S | Use portable process spawning and expose actual errors in native bundle script; no generic “app cannot ship” for missing command. |
| E08 | P1 / Tooling / S | Sanitize screenshot filenames, set locale/timezone, assert onboarding success and route identity; wrong-route screenshots fail visibly. |
| E09 | P1 / QA / M | Investigate full-suite timeout under contention; retain meaningful timeout diagnostics and deterministic test isolation. |
| E10 | P0 / QA + Backend / L | Add multi-day connected journey test: guest → learn → sync → relaunch → due review → mastery → linked-account recovery. |
| E11 | P0 / QA + Backend / L | Add two-session concurrency, replay, out-of-order and account-switch tests against a real local/staging backend. |
| E12 | P1 / Mobile + Operations / M | Connect privacy-preserving crash/error transport with source maps and build IDs; test a synthetic incident end-to-end. |
| E13 | P1 / Mobile + QA / L | Measure cold startup, tap latency, frame rate, memory and battery on supported release devices; record p50/p95 rather than impressions. |
| E14 | P1 / Tooling / M | Track bytecode, assets and installed binary separately; set budgets from product requirements and measured devices. |
| E15 | P1 / Engineering / M | Introduce backend-neutral domain ports and contract tests before migration; no backend client types leak into domain engines. |
| E16 | P1 / QA / M | Make image/map/text modality E2E deterministic; remove random branch skips for supported critical renderers. |
| E17 | P1 / Operations / M | Verify feature-flag freshness, safe defaults and kill-switch behavior; write rollback steps that match actual OTA/native setup. |
| E18 | P1; P0 for reachable severe exposure / Engineering / L | Triage the 30 high/eight moderate production-graph findings, map runtime/CI reachability, apply compatible fixes and automate scanning; verify native and supported Expo/OS behavior after updates. |

Effort scale: [audit 2](02-learning-content.md). Database reset, provider deployment, paid builds and production mutation were not part of this audit.
