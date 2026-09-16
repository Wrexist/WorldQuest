# WorldQuest: remaining work to launch

Snapshot: 14 September 2026. Worldwide English/Swedish geography launch, initially for beginners aged 16–24, with younger-user protections. Cloudflare Workers/D1 is selected. Domain purchase remains deferred. This is a delivery guide for the [canonical execution checklist](execution-plan.md), not a replacement set of completion claims.

## Where we actually stand

| Phase | Accepted actions | Remaining | Meaning |
|---|---:|---:|---|
| 1. Reliable baseline | 14/14 | 0 | Historical baseline accepted; every new change must still pass |
| 2. Accounts, backend and progress | 3/38 | 35 | Active; substantial partial implementation |
| 3. Learning course | 0/23 | 23 | Specification exists; connected course acceptance remains |
| 4. UX, accessibility and devices | 0/17 | 17 | Existing UI and automation do not close native acceptance |
| 5. Privacy and monetization | 0/17 | 17 | Privacy mandatory; payment work conditional on selling |
| 6. Beta, operations and release | 0/20 | 20 | Release preparation and observed testing remain |
| 7. Retention and growth | 0/11 | 11 | After a trustworthy release |
| 8. Competitive expansion | 0/8 | 8 | Demand-gated investment |
| Total | 17/148 | 131 | Action count, not percentage of engineering effort |

112 open actions belong to Phases 2–6; 19 belong to later growth/expansion. Related audit IDs describe shared workstreams and should not be estimated as separate projects. Some launch actions are conditional on enabled features. A free release can defer purchases only after paid claims and purchase entry points are disabled and the checklist records that scope decision.

Already present: the app, design system, EN/SV strings, geography packs, pure learning/economy engines, substantial automated checks, backend-neutral ports, D1 development infrastructure, native protected credentials, account protocol and separate D1 account screens. The learning branch now contains issued questions, transactional lesson receipts, paginated history and durable queue foundations.

**Not yet proven:** those foundations working together in the main app on release devices, complete rewards, offline timing across devices, live email and production operations. The main app still uses its legacy adapter. The D1 public API remains disabled. There is no live-user import requirement because only development/test data exists.

**Current verification gate:** the last account-screen baseline recorded 1,616 passing tests. The newer full verification log stops with a backend test process failure without a useful assertion diagnosis. Do not describe the current working tree as fully passing. Android's rendered account flow passed; iOS requires a rerun after fixing its app-launch prompt handling. Local bundle results are 4.59 MB against 4.6 MB, leaving little room. See [account evidence](d1-account-screens.md) and [learning implementation and limits](d1-learning-sync.md).

## What to start with: next implementation batches

1. **Restore a green current revision.** Diagnose the backend test-process failure; rerun targeted backend tests and the full gate. Verify the iOS launch-harness correction, retain native account screenshots, and rerun CI/bundle checks. Record results against the exact revision.
2. **Finish account acceptance.** Cover eight-digit codes, wrong/expired codes, resend limits, delivery failures, offline restart, device recovery, logout and deletion on both native platforms. Complete younger-user deep-link/API checks. Test deletion interrupted after server success but before device cleanup. Reconcile obsolete 30-day deletion copy with actual permanent deletion.
3. **Finish server-authoritative rewards.** Canonical quest assignments and slots; one payout per eligible claim; streak/day rules; freeze purchase/consumption; achievements, inventory and all displayed balances. Add failure, replay and concurrent-device tests before wiring these surfaces.
4. **Finish the offline protocol.** Decide completion-day and timezone semantics, late-event ordering, immutable content versions and optimistic feedback. Complete account-scoped snapshots, active lesson persistence, retry wake-ups and safe account transitions.
5. **Connect one complete main-app journey.** Guest → issued lesson → durable completion → server receipt → persisted memory → restart → due review → email linking → second-device recovery → deletion. Use the real learning stop/activate/erase callbacks, not the fixture callbacks.
6. **Prepare controlled hosted acceptance.** Forward migrations, secrets, email sender, abuse controls, redacted monitoring, restore rehearsal, cost measurements and cutover recovery. Keep public activation gated until these pass.

The next meaningful milestone is a real learner completing this journey without lost work or duplicated rewards. A new screen alone is not that milestone.

## Phase 2 delivery details: trustworthy accounts and learning data

### Identity and younger users

- Complete the legacy-to-D1 responsibility map: tables, RPCs, auth hooks, scheduled work, policies, storage and client calls. Record which pieces are retired versus replaced.
- Prove guest creation, linking without changing the progress owner, login, session expiry/renewal, logout, reinstall and another-device recovery.
- Keep unknown/protected/eligible age policy authoritative on the server. Verify ordinary onboarding, crafted requests, deep links and restored sessions cannot upgrade permissions.
- Specify the protected younger-user recovery path and territory-specific requirements before worldwide release. Store only necessary age information.
- Preserve pending challenges and resend deadlines through restart; handle unavailable delivery without falsely claiming an email was sent.
- Finish native deletion, device cache erasure, session revocation, retained-receipt expiry and backup retention behavior. Verify deletion of an account with actual learning history.
- Set up a real sender only when the deferred domain/email decision is resumed. Verify sender authentication, delivery to representative inboxes, bounced mail and abuse handling. Synthetic test mail is not production delivery.

### Rewards and progression

- Every lesson must be issued by the server and graded against its immutable question/content record.
- Ensure identical retries return the original receipt; conflicting payloads fail; two different concurrent lessons both survive.
- Reject invented facts, answer slots, duplicate slots, fake quest assignments and forged reward values.
- Make quest completion, daily bonuses, achievements and reward claims atomic and unique.
- Implement hearts, coin debits/continues, freezes, streaks and inventory according to the existing balance specification. Test simultaneous purchase and consumption.
- Fail required reads before writes; a database error must never become an empty-memory default or reset progress.
- Reconcile displayed totals, ledger sums and account projections; document rebuild procedures.

### Offline and multiple devices

- Cache issued lessons for offline use and define what happens when that supply is exhausted.
- Persist the active lesson, question order, answers and content version; resume after force quit or explain a safe recovery.
- Persist completions before telling the learner they are safely saved. Retain exact IDs and answers until receipt acknowledgement is stored.
- Drain on foreground/reconnect and scheduled bounded retries; handle more work than one flush permits, backoff and invalid permanent requests.
- Hydrate per-fact memory and replay pending work without silently overwriting newer server history.
- Define late reviews, travel, timezone changes and reward days. Current server-arrival/UTC behavior does not close this requirement.
- Test A → B switching while A has delayed requests, pending lessons and refreshes. No A data may display or submit as B.
- Exercise low/full/corrupt storage, expired sessions, lost responses, failed acknowledgement writes, two offline devices and old content versions.
- Add ticket abandonment/recovery rules and history pagination beyond current projection limits.

### Production D1 readiness

- Apply forward migrations to an isolated hosted environment; verify schema/version compatibility and rollback behavior after writes.
- Centralize owner checks, payload limits and stable retryable/nonretryable error codes across all routes.
- Add global/IP/session/account/OTP budgets, anonymous-account farming defenses and bounded expensive work. Per-owner ticket limits are insufficient alone.
- Measure rows read/written per lesson, indexed query plans, storage growth, Worker CPU/request costs and regional p95 latency under bursts.
- Configure alerts and quota-exhaustion behavior, including safely retaining queued lessons while the backend cannot accept work.
- Test export, restore and erasure with counts/checksums; record achieved recovery point and recovery time.
- Exercise secret rotation, redacted logs, support access and an incident runbook.
- Rehearse a fresh development-data cutover and old-client handling. Build live-user import only if the data scope changes. Decommission legacy services after reconciliation and recovery proof.

**Exit evidence:** main-app native multi-day/two-device journey, real D1 transaction/failure tests, account isolation and recovery, hosted restore and bounded operating cost. Owners: backend/mobile engineering; release and privacy decisions remain with the project owner or designated reviewer.

## Phase 3 delivery details: a course that teaches

- Implement the versioned seven-day “World foundations” course from the [launch brief](../product/launch-brief.md): flags → locations → capitals → broader countries → mixed recall → delayed check.
- Define objectives, prerequisites, baseline, checkpoints, finite completion and maintenance review. Resume unfinished work first, then due reviews, then the next segment.
- Make the course visible as places/skills with a clear next task and optional exploration.
- Add concise teaching before testing, useful wrong-answer explanations, confusion-pair feedback and source access on country pages.
- Vary fresh seeds and distractors while preserving exact restart behavior. Deduplicate selected facts unless deliberate relearning calls for repetition.
- Review ambiguity: shared currencies/languages, alternate capitals/names, territories, borders and multiple plausible answers.
- Define “learned,” “mastered” and “retained.” Distinguish recognition from unaided recall and cross-format transfer. Session accuracy must not imply permanent mastery.
- Validate timing-based ratings or use neutral scheduling for untimed/assistive-technology use.
- Provide an optional placement diagnostic without awarding unsupported mastery or easy repeat XP.
- Expand coverage in complete reviewed regional groups; derive marketing counts from shipped, quizzable EN/SV content.
- Assign fact owners, source hierarchy, licenses, review dates, change history and independent editorial sign-off. Review Swedish and English teaching nuance with humans.
- Version corrections so old queued lessons retain their original grading rules.
- Observe 8–12 relevant beginners without coaching; complete dated native competitor task comparisons to identify actual unmet needs.
- Instrument useful activation and delayed 7-/30-day probes with sample sizes, attrition and held-out items. Establish baselines before promising an efficacy result.

**Exit evidence:** a beginner knows what to do next, receives explanations, returns to genuinely due material and can complete the course; editorial approval and a functioning delayed-learning study exist. A 30-day outcome necessarily requires elapsed observation time.

## Phase 4 delivery details: usable on real devices

- Make start/resume visible on the smallest supported Home view, including large text. Prioritize learning above optional rewards.
- Observe whether five unprompted users can identify the next task; simplify onboarding based on measured friction while retaining mandatory privacy choices.
- Make loading, empty, offline, pending-sync, expired-session and failure states consistent and actionable.
- Complete safe exits and cold-start deep links through auth transitions, modals and notifications.
- Replace the remaining nondeterministic critical-renderer E2E skip with explicit image/map/text coverage.
- Test physical iPhone/iPad and Android sizes, supported OS versions, keyboards, safe areas, gestures, rotation policy and interruptions.
- Complete full tasks with VoiceOver/TalkBack: focus order, announcements, no answer leakage and equivalent nonvisual questions.
- Test OS accessibility text sizes, reduced motion, sound/silent switch, haptics and audio interruptions; essential feedback cannot rely on one sensory channel.
- Inspect similar flags, map borders, color-vision variants and bright-light legibility at device size.
- Review both languages at large text. Add RTL testing only before claiming/shipping RTL support.
- Measure release-build startup, interaction latency, frame performance, memory and battery. Track JS bytecode, assets and installed app size separately.

**Exit evidence:** a dated device/OS/build matrix with completed core tasks and closed blocking defects. Browser screenshots and emulator passes supplement physical-device evidence.

## Phase 5 delivery details: privacy and any paid offering

Privacy is required for either free or paid launch:

- Publish reachable privacy, terms, support and license pages; reconcile all links and deletion wording.
- Inventory actual app/backend/SDK collection and retention. Align policies, App Store labels, manifests and captured network traffic.
- Enforce unknown/child analytics denial and adult opt-out centrally; inspect actual events.
- Verify end-to-end guest and linked-account deletion, retained records, backups and subprocessors.
- Review worldwide storefront eligibility, age/guardian/recovery policy and any documented territory exceptions.

Before selling anything:

- Decide the free/paid boundary and audit each advertised benefit. Preserve coherent free learning, accessibility and account recovery.
- Implement actual store products and a purchase adapter; cover success, cancellation, pending approval, failure and restoration.
- Use one verified entitlement authority; deduplicate store notifications and reconcile missed lifecycle events.
- Test renewal, expiry, refund/revocation, grace states, reinstall and account changes. Explain account deletion versus subscription cancellation accurately.
- Verify every paid benefit in real learning flows, including hearts, continues, cosmetics or other advertised perks; no benefit should exist only in paywall copy.
- Complete agreements, tax/banking, product/group IDs, territories and review information.
- Document support, subscription management, restore and transfer rules. Model proceeds, refunds, hosting, support and acquisition before paid growth.

**Recommendation:** run the initial learning beta free while this work matures. A paid public launch requires the entire billing/benefit gate; a free public launch requires an explicit recorded deferral and removal of unsupported paid claims. No pricing or paid services are enabled by this roadmap.

## Phase 6 delivery details: TestFlight and release

- Create separate release configuration and protected production secrets; confirm current Xcode/SDK, signing, entitlements, age rating and trader/account requirements.
- Ensure monotonically increasing build numbers across local/cloud paths.
- Build a release candidate and test upgrade, reinstall, offline recovery, low storage, permissions and account recovery through TestFlight.
- Recruit an international EN/SV beginner beta, observe real use, assign defect severity and retest fixes. Collect learning and return evidence, not only opinions.
- Define metric names, denominators, time windows, offline handling and version/locale dimensions. Deduplicate funnel events.
- Connect consent-aware analytics and redacted crash reporting with source maps/build IDs; inject an incident and prove it reaches its owner.
- Provide reachable support and fact-reporting paths with minimal context and an assigned responder.
- Exercise auth, sync, quota and billing alerts; backup restore; feature-flag safe defaults; kill switches and incident ownership.
- Generate localized screenshots, icon, subtitle, description and any preview from actual release behavior and approved claims.
- Give App Review a working reproducible path and any needed access; keep the review backend reachable.
- Reconcile every in-scope P0/P1 item with evidence or an explicit feature deferral. Record known nonblocking issues.
- Submit, resolve review feedback, and release gradually with monitoring and a support owner. Document native rollback limitations and a recovery build procedure.
- Review costs, incidents, support load and learning cohorts after launch; retire legacy infrastructure only after recovery and retention decisions are verified.

**Exit evidence:** accepted release candidate, completed device/beta matrix, production services and support operating, truthful store assets, no unresolved blocker in enabled functionality. Store review and human observation are external elapsed time, not coding estimates.

## Phases 7–8: earning a competitive advantage

After the reliable course launches:

- Test opt-in reminders, quiet hours and travel behavior; watch opt-outs as well as return rate.
- Add useful weekly recaps, achievable goals, catch-up, saved lists and calm/untimed presentation based on learner evidence.
- Test a passport/expedition view tied to learned places and a small reviewed travel/news path.
- Experiment with store pages, ethical review prompts and referrals without uploading contacts. Run acquisition only with declared budgets and retained-learner measures.
- Introduce friendly challenges or leagues only after opt-in, moderation, anti-abuse, fair assignment and idempotent settlement work.
- Add richer map placement, typed recall and matching where they assess useful knowledge, with accessible equivalents and defensible spelling tolerance.
- Fit scheduler parameters only with representative data and holdout evaluation; version models and support rebuild/rollback.
- Expand licensed landmarks/cultural context, additional subjects, family/classroom plans and tablet-specific layouts only with demonstrated demand and appropriate privacy/content ownership.

The competitive goal is a stronger geography learning experience: clear teaching, trustworthy progress, measurable recall and a calm daily habit. Feature count is not evidence of being the best.

## Scheduling, ownership and release decisions

- Follow the dependency chain: verification → identity/rewards/offline protocol → main-app journey → course and hosted readiness → device/privacy acceptance → observed beta → submission.
- Editorial work, recruitment, support drafts and store preparation can proceed alongside engineering when their inputs are stable. Release gates still apply across phase boundaries.
- Assign a named engineering owner, content reviewer, privacy/release reviewer and support responder; role labels in the audit are not actual staffing commitments.
- Size the next batch after reproducing the current failures and finishing one connected journey. Do not add all inherited estimates: many IDs overlap, and large content work must be split.
- Keep a weekly record of completed evidence, new defects, cost measurements, decisions and the next gate. Do not publish a launch date from checklist counts.
- Remaining owner/external decisions: resume domain/sender purchase later; choose free versus paid public release; approve legal/store account details and territorial exceptions; supply physical-device/human editorial acceptance; approve final release when concrete.

## Current official references to recheck before release

- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/): measure both services; email and domain costs are separate. Free capacity is not a promise of unlimited users.
- [D1 free-tier enforcement](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/): queries fail after daily read/write limits are exceeded. Offline retention and quota-exhaustion UX are release work, not just cost reporting.
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) and [account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app): verify privacy, purchases and in-app deletion against the final binary and account configuration. Do not treat this engineering roadmap as legal clearance.

## Complete audit-action register

The linked [execution checklist](execution-plan.md) is the authoritative 148-action register: every item includes its ID, scope, priority, responsible discipline, inherited size and source audit. Its acceptance boxes are deliberately unchanged by this roadmap. The next section reproduces all remaining actions for one-document reading; update status only in the canonical register, then refresh this dated snapshot.

### Phase 2: Backend, accounts and trustworthy progress

- [ ] **B01** - Inventory current tables, RPCs, functions, auth hooks, jobs and hosted drift; map every responsibility to a destination. *P1 / Backend / M.* [Audit](../audits/2026-09-13/07-backend-convex.md)
- [ ] **B02** - Prove guest/link/login/logout/recovery/deletion on real Expo native builds with the chosen auth provider. *P0 / Mobile + Backend / L.* [Audit](../audits/2026-09-13/07-backend-convex.md)
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
- [ ] **S11** - Bound request bytes/strings, validate full IDs and content/template compatibility; malformed payloads return stable nonretryable protocol errors. *P1 / Backend / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S12** - Any required grading-read error aborts safely; injected database failures never reset memory or award from empty defaults. *P0 / Backend / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S13** - Define abuse budget for sessions, OTP, submissions and webhooks; include anonymous-account farming and expensive failed requests. *P1 / Backend / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S14** - Enforce timezone-change and late-event reward rules; travel remains usable without repeated daily bonuses. *P1 / Backend / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S15** - Decide launch age/territories, guardian needs and child recovery path; app copy matches implemented protections. *P1 / Privacy + Product / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **S16** - Redaction, least-privilege support access, secret rotation, audit trail and incident response are exercised, including backup restore. *P1 / Operations / M.* [Audit](../audits/2026-09-13/05-security-privacy.md)
- [ ] **U04** - Verify account recovery on a second device before promising full continuity; include purchased cosmetics, preferences and memory. *P0 / Mobile / L.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)

### Phase 3: A complete geography learning course

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

### Phase 4: Excellent UX, accessibility and device reliability

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

### Phase 5: Privacy, subscriptions and honest premium value

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

### Phase 6: TestFlight, operations and App Store release

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

### Phase 7: Retention and controlled growth

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

### Phase 8: Long-term competitive expansion

- [ ] **G17** - Finish league assignment/settlement, moderation and fairness before enabling; repeated job execution pays once. *P2 / Backend + Product / L.* [Audit](../audits/2026-09-13/08-growth-operations.md)
- [ ] **L11** - Add map placement/tapping with accessible sibling tasks; cover small countries, pan/zoom, disputed borders and alternative projection views. *P2 / Learning / L.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L12** - Add typed recall and matching/ordering only where they measure useful knowledge; support accents, aliases and defensible spelling tolerance. *P2 / Learning / L.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L17** - Fit scheduler parameters only after sufficient representative review history and holdout evaluation; version every model and retain rollback/rebuild. *P2 / Data / L.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **L19** - Add licensed landmarks and cultural context after the foundational course works; imagery and facts have separate provenance records. *P2 / Content / XL.* [Audit](../audits/2026-09-13/02-learning-content.md)
- [ ] **P16** - Evaluate a second subject only after first-course retention and demand gates; require a content/pedagogy plan, not just a new JSON pack. *P3 / Product / XL.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [ ] **P17** - Evaluate classrooms/family plans after guardian, roster, accessibility and privacy workflows; avoid building a teacher dashboard for an unvalidated market. *P3 / Product / XL.* [Audit](../audits/2026-09-13/01-product-competition.md)
- [ ] **U18** - Evaluate a tablet information layout from actual tablet usage, rather than stretching the phone column. *P2 / Design + Mobile / M.* [Audit](../audits/2026-09-13/03-ux-accessibility.md)
