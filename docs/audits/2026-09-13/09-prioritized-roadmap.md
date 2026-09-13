# Implementation roadmap

The [current execution checklist](../../plan/execution-plan.md) consolidates all 148 actions and starts numbering at Phase 1. Use it for implementation status; this document preserves the original audit sequencing and evidence gates.

13 September 2026. This orders the eight audits into a practical delivery plan. It is a recommended sequence, not an implementation already performed or a promise of App Store ranking. Repeated audit IDs refer to the same underlying work; do not sum every estimate as independent effort.

## First ten implementation tickets

| Order | Concrete ticket | Acceptance / related audit IDs |
|---|---|---|
| 1 | Make verification truthful on Windows | Workspace tasks cannot silently skip; LF and native-spawn failures corrected; English/Swedish browser contexts explicit. E05–E09 |
| 2 | Add the account transition barrier | Pending requests/queues/caches cannot cross accounts; delayed A requests after B login are rejected or ignored. S01, B07 |
| 3 | Hydrate and persist actual fact memory | Learn, restart, return when due, get review, see correct country/home progress; cover offline. L01, L06 |
| 4 | Make server age policy authoritative | Guest onboarding creates protected unknown/child state; deep links cannot bypass it. S02–S03 |
| 5 | Close reward and read-failure defects | Canonical quest rules, atomic read/grade/write, safe freeze delta and retriable read errors. S04–S06, S12 |
| 6 | Run the Convex decision proof | Native auth lifecycle, transactional lesson, offline replay and measured cost; write a go/no-go ADR. B02–B07, B14, B19 |
| 7 | Correct lesson selection and recovery | Unique facts, fresh seeds, persisted active lesson and scheduled retry. L02–L03, E01–E02 |
| 8 | Publish privacy/support and implement erasure | Usable links, guest/linked deletion with history, verified local/server cleanup. A05–A07, S07–S10 |
| 9 | Complete purchases and every promised entitlement | Real StoreKit products, restore/refund lifecycle, premium hearts and consistent coin debit. A01–A04 |
| 10 | Deliver a coherent first-week course | Teach before quiz, correction explanations, clear next lesson and calibrated progress claims. L04, L08, L10, P05, P09 |

If no live users exist, implement the corrected backend behavior directly in the chosen candidate after the proof instead of maintaining two production backends. If live users exist, protect the existing system first and rehearse migration. Hosted population and operational state were not inspected, so that decision needs factual inventory.

## Phases and exit gates

### Phase 0: trustworthy baseline and backend decision

Work: reproducible verification, source inventory, P0 reproductions, dependency-advisory reachability triage (E18), target learner/launch-scope brief, domain ports and bounded Convex proof. Keep screenshots and already working engines; avoid a UI rewrite.

Exit: the team can run the real checks on its operating systems; knows what is deployed; has a written backend/auth choice with measured transactional, offline and cost evidence; and agrees on the first course. Any failed migration gate produces a specific fallback decision rather than an open-ended rewrite.

### Phase 1: reliable learning and identity

Work: account-scoped state, actual memory hydration, active lesson persistence, backoff wake-ups, late-event ordering, canonical rewards, server child policy, safe credential storage and deletion design. Run connected and fault-injected integration tests against the selected backend.

Exit: guest learns over several simulated days, survives process death and offline travel, links/signs in on another device, receives due reviews and consistent progress, then deletes successfully. Concurrent distinct lessons are both retained; retry does not pay twice; switching accounts does not expose or submit prior-user work.

### Phase 2: a worthwhile course and honest monetization

Work: first-week curriculum, explanations, diagnostic/next task, fact quality and selected UX priorities; real billing/entitlements; privacy/support links; minimum telemetry; native accessibility/device testing.

Exit: a small observed beta can explain what it learned, choose the next task, recover mistakes and distinguish mastered from merely encountered facts. Paying users receive every listed benefit, restore works, store-unavailable mode remains usable and no P0 remains in the release scope.

### Phase 3: App Store launch preparation

Work: current SDK/build-image verification, one build-number authority, actual App Store product/account checks, localized truthful assets, native TestFlight matrix, incident/release runbooks, restore rehearsal and phased rollout.

Exit: release candidate passes the native and server matrices; policy/store declarations match collection; reviewer path works against a reachable backend; a named person owns incidents. Signing/export success alone is insufficient.

### Phase 4: prove retention, then grow

Work: cohort instrumentation, delayed recall probes, interviews, improved curriculum breadth and controlled acquisition. Compare free/premium value and learning modes. Add map interaction, recall formats and optional social only with evidence and safeguards.

Exit: repeatable learning return and delayed recall are measured in a defined audience, acquisition spending has an explicit limit, and support/hosting cost scales acceptably. Set numeric product targets before experiments using the actual baseline and sample requirements; none are measured yet.

### Phase 5: category leadership experiments

Work: complete geographic coverage, richer regional context, learner-chosen expeditions, stronger assessment and potentially classrooms/families or a second subject. These are independent business hypotheses requiring their own curriculum and privacy designs.

Exit: expansion strengthens the demonstrated learning habit rather than masking churn in the first course. A broad feature checklist is not evidence of beating Duolingo.

## Planning envelope

For one experienced full-time engineer with access to design, content and QA support, reserve roughly 1–2 weeks for the baseline/backend proof, 3–6 for core state/backend repairs, and a further 4–8 for curriculum integration, billing and release evidence. These ranges overlap, exclude major unknowns and external review waits, and are not summed estimates from all 148 audit rows. A large content expansion or full migration of existing users can add substantial time. Re-estimate after the proof and first vertical journey; a few days is not a credible complete launch plan for the observed gaps.

If resources are constrained, ship a smaller complete geography course with working review, sync and recovery. Keep leagues, new subjects, elaborate cosmetics, family/classroom administration and paid acquisition outside the first release scope. Do not trade away correctness, accessibility, privacy, support or paid-benefit delivery to preserve optional features.

## Release evidence matrix

| Area | Required evidence |
|---|---|
| Learning | Multi-day due-review journey; unique composition; late review ordering; content-version compatibility |
| Identity | Guest/link/return/logout/delete; two accounts and two devices; expired auth and delayed requests |
| Economy | Concurrent lessons, first-daily bonus, quest/achievement deduplication, freeze purchase/consumption and failed continue debit |
| Offline | Relaunch mid-lesson, completion before network loss, transient failure without new activity, reconnect, upgrade with pending queue |
| Purchases | Product load, purchase/cancel/pending, restore, renewal, grace/retry, expiry, refund/revoke and account transfer policy |
| Inclusion | Native VoiceOver/TalkBack where supported, Dynamic Type, reduced motion, alternative map/image tasks and keyboard/focus paths |
| Devices | Small/large iPhone, supported iPad, supported OS range, low memory/storage and release-build profiling |
| Operations | Real error delivery, source maps, cost alert, backup restore, deletion verification, incident and rollout rehearsal |
| Store | Current SDK, unique build number, accurate localized metadata, working policy/support links and review access |

Use audit IDs in implementation PRs and attach the relevant evidence. Completion means observable behavior, not a new comment or a passing unit test that exercises only a helper.
