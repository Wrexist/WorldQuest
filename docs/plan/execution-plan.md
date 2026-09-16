# WorldQuest execution checklist

Updated 13 September 2026. **Active: Phase 2. Phase 1 complete (14/14).** This is the current execution order and starts at 1; it supersedes the phase numbering in the earlier audit roadmap. All 148 audit actions appear exactly once below. Related actions should be implemented in shared workstreams, not estimated as 148 independent projects.

Evidence is in the [Phase 1 work log](phase-1-verification.md) and [Phase 2 work log](phase-2-verification.md). Launch scope is worldwide English/Swedish. Both native builds and automated journeys pass. Full-resolution inspection and decoded pixels confirm the country-button label was present in the original iOS 26.4 capture; E18 is complete. The full release device matrix remains A11 work. Phase 2 has account isolation foundations, protected native credentials with migration/reinstall proof (S08), and a real local D1 transaction slice. Cloudflare Workers/D1 is selected; native auth and app cutover remain gated.

**Status:** unchecked means unfinished or unverified; checked requires completion evidence. A phase is not complete just because its first batch is fixed. P0 blocks the affected release/feature; P1 precedes broad launch; P2/P3 work is gated by product evidence. Owner/effort estimates are inherited from the audits (S 1-2 days, M 3-5 days, L 1-2 engineer-weeks, XL split before scheduling). They exclude external review waits.

[Detailed launch roadmap](launch-roadmap.md) | [Audit findings and sources](../audits/2026-09-13/README.md) | [Original roadmap and release matrix](../audits/2026-09-13/09-prioritized-roadmap.md) | [Phase 1 work log](phase-1-verification.md)

## First implementation batch (completed)

1. Make `pnpm typecheck` and `pnpm test` select the actual workspaces and fail on an empty selection.
2. Make existing header, documentation and code-size checks independent of LF/CRLF checkout settings.
3. Make native exports invoke Expo portably and print the actual process failure.
4. Fix browser locale/timezone, Windows screenshot names and route/onboarding assertions; add regressions for misleading captures.
5. Run the real verification, native export, E2E, accessibility-tree and design scripts; inspect rendered output.
6. Record remaining test/dependency issues, then settle the first audience/course and proceed to the backend proof.

These are the tasks started in this session. Backend migration, payment setup and deployment are later work, not completed by editing this checklist.

## Phase overview

| Phase | Outcome | Actions | Gate |
|---|---|---:|---|
| 1 | Reliable development baseline | 14 | 14/14 complete; native evidence recorded |
| 2 | Backend, accounts and trustworthy progress | 38 | Required before broad paid launch |
| 3 | A complete geography learning course | 23 | Required before broad paid launch |
| 4 | Excellent UX, accessibility and device reliability | 17 | Required before broad paid launch |
| 5 | Privacy, subscriptions and honest premium value | 17 | Required before broad paid launch |
| 6 | TestFlight, operations and App Store release | 20 | Required before broad paid launch |
| 7 | Retention and controlled growth | 11 | Evidence-gated expansion |
| 8 | Long-term competitive expansion | 8 | Evidence-gated expansion |

Execution notes: product/editorial research can run alongside engineering. Do not migrate live users before identity, replay and restore tests pass. If no live users exist, implement the corrected behavior directly in the selected backend after the proof. Do not enable leagues or sell unfinished benefits while their required safety work is open.

**Confirmed launch data scope:** the owner reports development/test data only.
There is no live-user import to build for the initial launch. B17/B18's live-user
migration portions are conditional on that changing; fresh-backend reconciliation,
restore, old-client handling and cutover recovery still need evidence. No test data
has been deleted as part of this decision.

## Phase 1: Reliable development baseline

Fix verification before relying on it, then triage dependencies and agree on launch scope.

**Exit gate:** Windows runs the intended workspace checks, original browser/native scripts work without audit-only patches, dependency exposure is triaged, and the first audience/course are recorded.

- [x] **E04** - Replace stale status claims with generated inventory and dated evidence; clean superseded implementation-history comments. *P1 / Engineering / M.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [x] **E05** - Fix Windows workspace filter quoting; fail when expected packages are absent and print checked package count. *P1 / Tooling / M.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [x] **E06** - Normalize LF-sensitive fixtures/budget counts or enforce checkout EOL with `.gitattributes`; the same commit has equivalent results on Windows/Linux. *P1 / Tooling / S.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [x] **E07** - Use portable process spawning and expose actual errors in native bundle script; no generic “app cannot ship” for missing command. *P1 / Tooling / S.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [x] **E08** - Sanitize screenshot filenames, set locale/timezone, assert onboarding success and route identity; wrong-route screenshots fail visibly. *P1 / Tooling / S.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [x] **E09** - Investigate full-suite timeout under contention; retain meaningful timeout diagnostics and deterministic test isolation. *P1 / QA / M.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [x] **E18** - Triage the 30 high/eight moderate production-graph findings, map runtime/CI reachability, apply compatible fixes and automate scanning; verify native and supported Expo/OS behavior after updates. *P1; P0 for reachable severe exposure / Engineering / L.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [x] **G20** - Maintain one current release backlog and evidence log; archive stale claims and review competitor changes quarterly. *P1 / Product + Engineering / M.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [x] **P01** - Define the initial audience, countries of launch and job-to-be-done in one brief; use it to rank every backlog item. *P1 / Product / S.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [x] **P02** - Make the product promise about observable geographic ability; remove unsupported “scientifically proven” or language-competitor claims. *P1 / Product / S.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [x] **P05** - Prioritize one first-week geography course and one clear daily recommendation; no competing primary CTAs. *P1 / Product / S.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [x] **P08** - Align home, onboarding, paywall and listing claims to current shipped capabilities and country counts. *P1 / Product / S.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [x] **P15** - Make the release backlog distinguish required fixes from experiments; owners can say no to scope without losing the idea. *P1 / Product / S.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [x] **P18** - Reconcile README, PROJECT, roadmap and old audits with current code; preserve historical claims as dated history. *P1 / Product / S.* [Audit](../audits/2026-09-13/01-product-competition.md)

## Phase 2: Backend, accounts and trustworthy progress

Cloudflare Workers/D1 is the owner's selected destination (ADR 0013). Prove safe identity, offline state, per-fact memory and transactional rewards. Supabase is only the legacy source; there is no live user data to migrate.

**Exit gate:** A guest can learn, restart offline, reconnect, link an account and recover on another device without lost work, duplicate rewards or cross-account data. Native auth, real transaction tests and migration recovery are evidenced.

- [ ] **B01** - Inventory current tables, RPCs, functions, auth hooks, jobs and hosted drift; map every responsibility to a destination. *P1 / Backend / M.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **B02** - Prove guest/link/login/logout/recovery/deletion on real Expo native builds with the chosen auth provider. *P0 / Mobile + Backend / L.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [x] **B03** - Extract backend-neutral ports; engines compile without backend SDK imports. *P1 / Engineering / M.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **B04** - Implement transactional lesson grading, receipt idempotency and reward invariants; conflicting lessons preserve both results. *P0 / Backend / L.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **B05** - Enforce canonical quest slots, eligibility and payout uniqueness; the eight-slot probe is rejected. *P0 / Backend / M.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **B06** - Design per-fact history hydration and offline event ordering; next-day reviews and multi-device replay are correct. *P0 / Mobile + Backend / L.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **B07** - Implement account-scoped durable outbox and transition barrier; queued work cannot cross users. *P0 / Mobile / L.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **B08** - Define tables, compound indexes, pagination and projections; representative queries avoid full-history scans. *P1 / Backend / M.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **B09** - Centralize ownership checks on every public query/mutation; cross-user reads and writes fail. *P0 / Backend / M.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **B10** - Enforce child policy and minimize age data on the server; client flags cannot upgrade permissions. *P0 / Backend + Privacy / M.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **B12** - Add payload limits, abuse controls and per-user work budgets; replay storms cannot exhaust ordinary users' service. *P1 / Backend / M.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **B13** - Select region and inspect processing/retention terms; document subprocessors and auth/email costs. *P1 / Operations / M.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **B14** - Measure burst concurrency, p95 latency and metered dimensions per lesson with realistic subscriptions. *P1 / Backend + QA / L.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **B15** - Configure usage alerts and quota-exhaustion behavior; verify which controls actually stop spend. *P1 / Operations / M.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **B16** - Build and test export, restore and erasure procedures with counts/checksums and access controls. *P0 / Operations / L.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **B17** - Write reversible identity/data migration and reconciliation tooling; interrupted import resumes safely. *P1 / Backend / L.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **B18** - Rehearse authoritative cutover, old-client compatibility and post-write rollback before moving live accounts. *P0 / Release + Backend / L.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [x] **B19** - Record backend selection: owner chose Workers/D1 instead of Convex; ADR 0013 and a real local D1 transaction slice replace the fallback evaluation. Native auth and hosted cost remain B02/B14/B15 gates. *P1 / Product + Engineering / M.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **E03** - Fail required reads before writes; injected failures preserve previous state and retry once safely. *P0 / Backend / M.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [ ] **E10** - Add multi-day connected journey test: guest → learn → sync → relaunch → due review → mastery → linked-account recovery. *P0 / QA + Backend / L.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [ ] **E11** - Add two-session concurrency, replay, out-of-order and account-switch tests against a real local/staging backend. *P0 / QA + Backend / L.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [ ] **E15** - Introduce backend-neutral domain ports and contract tests before migration; no backend client types leak into domain engines. *P1 / Engineering / M.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [ ] **L01** - Hydrate account-scoped memory; persist snapshots; replay pending local answers; a returning learner receives a genuinely due fact online and after an offline restart. *P0 / Learning / L.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L06** - Define deterministic late-review ordering/replay with server revisions; old offline uploads never erase newer learning state. *P0 / Backend + Learning / L.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **S01** - Account-scoped queues/caches, transition barrier and cancellation/generation checks; A → B sign-in under delayed requests reveals and submits no A data. *P0 / Mobile + Backend / L.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S02** - Server unknown/child/adult policy plus onboarding reconciliation; ordinary child signup produces protected server state. *P0 / Backend / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S03** - Enforce age/account policy on deep links and API paths; child access cannot bypass rules via `/account`. *P0 / Mobile + Backend / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S04** - Reject noncanonical quests and duplicated/invented slots; local probe and authenticated integration reproduction fail safely with no payout. *P0 / Backend / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S05** - Transactional read/grade/write or version retries; concurrent different lesson IDs preserve both reviews and award daily bonuses once. *P0 / Backend / L.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S06** - Freeze consumption commutes safely with purchase; regression test buys a freeze while another lesson is being submitted. *P0 / Backend / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [x] **S08** - Platform-protected credential storage with migration and reinstall behavior; no shared hardcoded key is treated as protection. *P1 / Mobile / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S11** - Bound request bytes/strings, validate full IDs and content/template compatibility; malformed payloads return stable nonretryable protocol errors. *P1 / Backend / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S12** - Any required grading-read error aborts safely; injected database failures never reset memory or award from empty defaults. *P0 / Backend / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S13** - Define abuse budget for sessions, OTP, submissions and webhooks; include anonymous-account farming and expensive failed requests. *P1 / Backend / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S14** - Enforce timezone-change and late-event reward rules; travel remains usable without repeated daily bonuses. *P1 / Backend / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S15** - Decide launch age/territories, guardian needs and child recovery path; app copy matches implemented protections. *P1 / Privacy + Product / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S16** - Redaction, least-privilege support access, secret rotation, audit trail and incident response are exercised, including backup restore. *P1 / Operations / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **U04** - Verify account recovery on a second device before promising full continuity; include purchased cosmetics, preferences and memory. *P0 / Mobile / L.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)

## Phase 3: A complete geography learning course

Build the first-week course, explanations, varied selection, accurate mastery and an editorial process.

**Exit gate:** New users know what to learn next; mistakes teach; due reviews work; sources and ambiguity are reviewed; delayed-learning measurements are defined.

- [ ] **G05** - Implement delayed retention study and report attrition; separate learning evidence from XP and app opens. *P1 / Learning + Data / L.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **G09** - Establish editorial ownership, source hierarchy, reviewer sign-off and volatile-fact review dates. *P1 / Content / M.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **G10** - Version content releases and corrections; queued old-version lessons still grade consistently. *P1 / Content + Backend / M.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **L02** - Vary fresh lesson seeds; persist active seed/content version; consecutive lessons vary and resume reproduces the exact question order. *P1 / Learning / S.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L03** - Deduplicate across selection buckets before quota backfill; property tests assert uniqueness unless an explicit relearning stage requests repetition. *P1 / Learning / S.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L04** - Separate recognition from unaided mastery evidence; test transfer between flag, text and map formats before showing a broad “mastered” claim. *P1 / Learning / L.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L05** - Wire measured template timing or use neutral ratings pending validation; screen-reader and untimed learners get fair scheduling. *P1 / Learning + Data / M.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L07** - Own a fact freshness register by volatility; every changed fact carries source, date, reviewer and a correction history. *P1 / Content / M.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L08** - Author an explicit first-week course with objectives, prerequisites and checkpoints; a new user always sees a meaningful next task. *P1 / Learning + Content / L.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L09** - Expand countries in complete regional groups, with named territorial scope and source policy; release claims derive from shipped counts. *P1 / Content / XL.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L10** - Add concise teaching and wrong-answer explanations, including “why this distractor is wrong”; verify samples with independent reviewers. *P1 / Content / M.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L13** - Add optional placement diagnostic; calibrate without granting unsupported permanent mastery or easy XP. *P1 / Learning / M.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L14** - Classify ambiguity and distractor quality per item; shared currencies/languages never produce two correct choices. *P1 / Content / M.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L15** - Define finite course completion and maintenance mode; a completed course offers review without pretending there is endless new content. *P1 / Learning / M.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L16** - Implement delayed 7-/30-day probes using held-out questions; report sample size, attrition and modality, not just XP or session accuracy. *P1 / Data / L.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L18** - Establish human English/Swedish review for teaching nuance, country names, currency variants and sensitive facts; key coverage alone is insufficient. *P1 / Content / M.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **P03** - Complete native Duolingo, Seterra/GeoGuessr and StudyGe task comparisons; date locale/version/price/screenshots and balanced review samples; record accessibility failures as observations. *P1 / Research / L.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [ ] **P04** - Observe 8–12 relevant beginners using WorldQuest without coaching; label this qualitative research, not a statistically representative survey. *P1 / Research / M.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [ ] **P06** - Define activation as a useful completed lesson followed by a meaningful return; instrument the steps and denominators. *P1 / Product / M.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [ ] **P07** - Give learners a visible roadmap of places/skills, prerequisites and checkpoints with free topic choice. *P1 / Product + Learning / M.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [ ] **P09** - Define what “learned,” “mastered” and “retained” mean; expose a short user explanation and consistent metrics. *P1 / Product / M.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [ ] **U02** - Let country pages teach before testing; fact text, source access and mastery labels are distinct. *P1 / Product + Mobile / M.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)
- [ ] **U06** - Make summary feedback accurate and actionable; distinguish session success from durable mastery. *P1 / Product + Learning / M.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)

## Phase 4: Excellent UX, accessibility and device reliability

Improve home hierarchy and onboarding, persist active lessons, fix retry recovery, and verify native accessibility and performance.

**Exit gate:** Core journeys work on the supported small/large phones and tablets, with large text and assistive technology, including interruptions and offline recovery.

- [ ] **E01** - Schedule bounded retry wake-ups and foreground/reconnect drain; a single transient failure recovers without another lesson. *P1 / Mobile / M.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [ ] **E02** - Persist/recover active lessons and handle corrupt/full storage explicitly; no silent disappearance of answered items. *P1 / Mobile / M.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [ ] **E13** - Measure cold startup, tap latency, frame rate, memory and battery on supported release devices; record p50/p95 rather than impressions. *P1 / Mobile + QA / L.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [ ] **E14** - Track bytecode, assets and installed binary separately; set budgets from product requirements and measured devices. *P1 / Tooling / M.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [ ] **E16** - Make image/map/text modality E2E deterministic; remove random branch skips for supported critical renderers. *P1 / QA / M.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [ ] **U01** - Make start/resume visible on smallest supported initial Home view, including larger text, without covering content. *P1 / Design + Mobile / M.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)
- [ ] **U05** - Reorder Home around today's learning, meaningful progress and optional rewards; five unprompted users can identify the next task. *P1 / Design / M.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)
- [ ] **U07** - Measure onboarding steps and test a shorter variant; keep mandatory privacy decisions while deferring optional choices. *P1 / Research + Mobile / M.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)
- [ ] **U08** - Persist active lesson state/seed/content version; kill/relaunch resumes or explains an explicit safe recovery outcome. *P1 / Mobile / L.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)
- [ ] **U09** - Complete actual iPhone/iPad and Android task passes with evidence on build/OS; verify safe areas, gestures, keyboard and orientation policy. *P1 / QA / L.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)
- [ ] **U10** - Complete core tasks blind with VoiceOver and TalkBack; verify focus, announcements, equivalent questions and no answer leakage. *P0 for blockers / QA / L.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)
- [ ] **U11** - Verify OS 200% text and supported accessibility sizes on devices; tabs, feedback sheets and paywall remain operable. *P1 / QA + Mobile / M.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)
- [ ] **U12** - Verify Reduce Motion, sound toggle, silent switch, haptics and audio interruption on devices; no essential signal is sensory-only. *P1 / QA + Mobile / M.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)
- [ ] **U13** - Check color-vision variants, OLED/bright-light legibility, map borders and similar flags at actual display size. *P1 / Design + QA / M.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)
- [ ] **U14** - Unify loading/empty/error/offline/pending states by actual behavior; preserve user work and provide effective actions. *P1 / Mobile / M.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)
- [ ] **U15** - Review real English/Swedish copy with large text; add RTL test coverage before claiming RTL support or shipping RTL locales. *P1 / Localization + QA / M.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)
- [ ] **U17** - Test deep links from cold start, auth transitions and notifications; every modal/leaf route has a safe way out. *P1 / QA / M.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)

## Phase 5: Privacy, subscriptions and honest premium value

Finish deletion and policy flows, connect real purchases, verify all advertised benefits and establish one entitlement authority.

**Exit gate:** Guest/linked deletion works, published privacy matches collection, and sandbox purchase/restore/refund/expiry plus premium benefits are verified.

- [ ] **A01** - Implement the runtime purchase port with real products; sandbox purchase, cancellation, pending, failure and restore all work. *P0 / Mobile / L.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **A02** - Connect entitlements to every advertised benefit; premium user can complete lessons without heart loss when unlimited hearts is promised. *P0 / Mobile + Backend / M.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **A03** - Define one verified subscription authority, idempotent webhooks and scheduled reconciliation; lifecycle matrix passes. *P0 / Backend / L.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **A04** - Make coin continues grant only according to a documented debit/free-rescue policy; failed requests cannot silently consume a paid benefit. *P0 / Mobile + Backend / M.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **A05** - Publish real privacy, terms, support and licence destinations and wire all relevant screens; links work in production. *P0 / Product + Mobile / M.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **A06** - Implement account/guest deletion and controlled log erasure; verify deletion across auth, data, device and subprocessors. *P0 / Backend + Mobile / L.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **A07** - Reconcile policy, data inventory, App Store answers and manifests against the actual binary and backend. *P0 / Product + Privacy / M.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **A09** - Verify agreements, tax/banking setup, product IDs, subscription group, territories, review information and backend secrets without exposing them in logs. *P0 / Release / M.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **A14** - Decide free/premium boundary and test benefit comprehension before pricing experiments. *P1 / Product / M.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **A15** - Build cohort economics with actual store proceeds, refunds, churn, hosting, support and acquisition; set a spending limit. *P1 / Finance + Product / M.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **A16** - Document entitlement support, refund guidance, subscription management and account-transfer rules; exercise support scenarios. *P1 / Operations / M.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **B11** - Integrate one entitlement authority with verified, deduplicated events and reconciliation. *P0 / Backend / L.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **P12** - Specify free vs paid value so learning, accessibility and progress recovery remain coherent for free users. *P1 / Product / S.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [ ] **S07** - Guest/linked deletion, reauthentication where needed, session revocation, erasure job, receipt and backup-retention policy; test accounts with review history. *P0 / Backend + Mobile / L.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S09** - Approved production data inventory aligns policy, store labels, manifest and SDK captures; no unsupported “collects nothing” claim. *P0 / Privacy owner / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S10** - Adult analytics opt-out and unknown/child denial enforced centrally; network inspection confirms zero forbidden events. *P1 / Mobile + Data / S.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **U03** - Audit every paywall benefit against a working feature; remove/defer unsupported benefits before selling. *P0 / Product + Mobile / M.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)

## Phase 6: TestFlight, operations and App Store release

Finish telemetry/support, restore and incident procedures, release configuration, native QA and truthful store assets.

**Exit gate:** No launch-blocking issue remains in scope; release evidence is complete; the reviewer journey works; phased rollout and incident ownership are ready.

- [ ] **A08** - Verify Xcode/SDK, current age-rating responses and EU trader status in the release account; retain dated evidence. *P0 / Release / M.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **A10** - Unify build numbers across local/cloud release paths; two independent builds receive distinct increasing numbers. *P1 / Tooling / M.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **A11** - Run native TestFlight journeys on supported iPhone/iPad sizes and OS versions, including reinstall, upgrade, offline and low storage. *P0 / QA / L.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **A12** - Produce localized screenshots, icon, subtitle, description, support page and truthful preview using release behavior. *P1 / Product + Design / M.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **A13** - Give App Review a reproducible working path, any required access, subscription explanation and reachable production service. *P0 / QA / M.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **A17** - Define phased rollout, incident owner, kill switches and native rollback limitations; test the release checklist. *P1 / Release / M.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **B20** - Decommission old services only after reconciled migration, backup recovery rehearsal and retention decision. *P1 / Operations / M.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **E12** - Connect privacy-preserving crash/error transport with source maps and build IDs; test a synthetic incident end-to-end. *P1 / Mobile + Operations / M.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [ ] **E17** - Verify feature-flag freshness, safe defaults and kill-switch behavior; write rollback steps that match actual OTA/native setup. *P1 / Operations / M.* [Audit](../audits/2026-09-13/04-engineering-reliability.md)
- [ ] **G01** - Adopt a versioned metric dictionary with denominators, time windows, exclusions and offline handling. *P1 / Product + Data / M.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **G02** - Connect minimal production analytics after central child/consent gates; inspect actual emitted payloads. *P1 / Mobile + Data / M.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **G03** - Connect redacted crash/error reporting and source maps; an injected beta failure reaches its owner. *P1 / Operations / M.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **G04** - Build onboarding-to-return funnel by app/content version and locale; duplicate events cannot inflate completion. *P1 / Data / M.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **G06** - Recruit and observe a small target-audience beta; maintain dated issue severity and follow-up evidence. *P1 / Research / M.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **G07** - Define experiment registry and decision rules; test one material hypothesis at a time until traffic supports more. *P1 / Product / S.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **G08** - Publish reachable support and fact-reporting routes; reports carry only necessary context and receive an owner. *P1 / Support + Mobile / M.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **G11** - Configure sync, auth, billing and quota alerts with triage/runbooks; exercise one incident for each domain. *P1 / Operations / M.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **G12** - Test backup restore and deletion propagation; record recovery point/time actually achieved. *P1 / Operations / M.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **G13** - Align localized store pages and screenshots with shipped coverage and working benefits. *P1 / Product + Design / M.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **G19** - Review per-lesson cost, refunds, support load and net revenue monthly; alerts precede budget exhaustion. *P1 / Finance + Operations / M.* [Audit](../audits/2026-09-13/08-growth-operations.md)

## Phase 7: Retention and controlled growth

Measure real learning return, improve calm daily habits, and test pricing, reminders, sharing and acquisition within budgets.

**Exit gate:** Defined cohorts show learning return and delayed retention; experiments have stopping rules; cost, refunds and support are sustainable.

- [ ] **A18** - Test ethical review prompts and localized store-page variants after meaningful learning success; measure retained learners, not only installs. *P2 / Product / M.* [Audit](../audits/2026-09-13/06-app-store-monetization.md)
- [ ] **G14** - Run a bounded acquisition test only after retention gates; report retained-learner cost and stop at the declared budget. *P2 / Growth / M.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **G15** - Validate opt-in reminders, quiet hours, travel and denied permissions; measure learning return and opt-outs. *P2 / Mobile + Product / M.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **G16** - Test weekly recap, catch-up and learner-controlled goals without penalizing already-earned knowledge. *P2 / Product / M.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **G18** - Test voluntary sharing/referrals without contact upload; guard against reward farming and measure useful referrals. *P2 / Product + Growth / M.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **L20** - Add saved study lists, explicit catch-up and calm/untimed modes; user choices survive restart and never require paid access to necessary review. *P2 / Learning / M.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **P10** - Test a travel/news context path with a small reviewed content set; judge learning and return rate before expanding. *P2 / Product / M.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [ ] **P11** - Add an expedition/passport identity through actual learned places, not more currencies; validate that it helps users understand progress. *P2 / Product + Design / M.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [ ] **P13** - Test optional friendly challenges only after anti-abuse and account safety work; make social participation opt-in. *P2 / Product / M.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [ ] **P14** - Test weekly learning recap and achievable next-week goal; avoid guilt for missed days. *P2 / Product / M.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [ ] **U16** - Offer calmer learning presentation and hide-streak control if validated; accessibility does not depend on payment. *P2 / Design + Mobile / M.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)

## Phase 8: Long-term competitive expansion

Add advanced geography assessment, richer content, proven social features and optional new audiences/subjects only after the first course works.

**Exit gate:** Each expansion has demonstrated demand, a teaching/assessment design, privacy ownership and a measured benefit. These are experiments, not launch requirements.

- [ ] **G17** - Finish league assignment/settlement, moderation and fairness before enabling; repeated job execution pays once. *P2 / Backend + Product / L.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **L11** - Add map placement/tapping with accessible sibling tasks; cover small countries, pan/zoom, disputed borders and alternative projection views. *P2 / Learning / L.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L12** - Add typed recall and matching/ordering only where they measure useful knowledge; support accents, aliases and defensible spelling tolerance. *P2 / Learning / L.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L17** - Fit scheduler parameters only after sufficient representative review history and holdout evaluation; version every model and retain rollback/rebuild. *P2 / Data / L.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L19** - Add licensed landmarks and cultural context after the foundational course works; imagery and facts have separate provenance records. *P2 / Content / XL.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **P16** - Evaluate a second subject only after first-course retention and demand gates; require a content/pedagogy plan, not just a new JSON pack. *P3 / Product / XL.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [ ] **P17** - Evaluate classrooms/family plans after guardian, roster, accessibility and privacy workflows; avoid building a teacher dashboard for an unvalidated market. *P3 / Product / XL.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [ ] **U18** - Evaluate a tablet information layout from actual tablet usage, rather than stretching the phone column. *P2 / Design + Mobile / M.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)

## Rules for moving between phases

- Attach test/build/device evidence before checking off an item; document explicit limitations.
- Keep all P0s visible across phases. A later heading does not permit unsafe early release.
- Re-estimate after the D1/auth proof and the first connected multi-day journey.
- Treat Phases 7-8 ideas as hypotheses; do not delay a trustworthy small course for every optional feature.
- App Store submission, external accounts and native-device evidence remain explicit release work.
