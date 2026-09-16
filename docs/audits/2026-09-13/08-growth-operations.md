# Audit 8: growth, measurement, support and operations

13 September 2026. No production analytics account, acquisition campaign, user interview or revenue data was available to this audit. Metrics below are proposed definitions and launch gates, not measured results or industry benchmarks.

## Current readiness

The repository has an event taxonomy, analytics calls, a crash-report abstraction, content validators and product metric documents. These are useful foundations. The runtime analytics implementation currently prints development events; it has no production transport. Crash reporting also defaults to a console sink. Consequently, code coverage and polished dashboards in product plans do not establish activation, retention, crash-free sessions or willingness to pay. Sources: [analytics](../../../apps/mobile/src/lib/analytics.ts), [reporting](../../../apps/mobile/src/lib/reporting.ts).

The analytics wrapper suppresses unknown/child accounts, but does not consult the separate adult analytics preference. Fix the central gate before adding a transport. Avoid recording email, birth year, free-text answers, access tokens or an entire lesson payload in telemetry. Use explicit event schemas, consent/policy checks, payload redaction and deletion propagation. Separate strictly necessary service diagnostics from optional behavioral analytics and document the purpose of each.

Content tooling verifies shape, sources, ambiguity, locales and selected reference values. It does not replace a named editor, freshness policy, correction response, cultural review or learning-outcome assessment. An expanding world curriculum needs a publishing operation as much as a JSON generator.

League models and UI exist behind a flag; complete assignment, ranking, season settlement and recovery jobs were not found in the inspected server code. Keep public competitive leagues disabled until scheduling, idempotent rewards, abuse controls and operational ownership are demonstrated. A visible leaderboard with stale or easily fabricated scores damages trust more than omitting it at launch.

## Measurement plan

Use the first completed useful lesson as an initial funnel milestone, then a meaningful return as activation evidence. Count accepted server lesson receipts once; client retries and duplicated event delivery must not inflate success. Offline cohorts need delayed-event handling. Track app version, content version and experiment assignment with stable definitions; do not quietly change denominators during an experiment.

| Metric | Proposed definition | Decision it supports |
|---|---|---|
| First-lesson completion | Eligible new users completing a useful lesson / eligible new users starting onboarding | Find onboarding and lesson friction |
| Time to first answer / first lesson | Median and p90 foreground time, with abandonment reported separately | Identify unnecessary setup |
| D1 / D7 / D30 learning return | Acquisition cohort completing learning on the specified local-calendar day / eligible cohort | Distinguish return to learning from app opens |
| Weekly learning days | Distinct days with qualifying learning, distribution per active learner | Evaluate sustainable habit |
| Delayed retention | Accuracy on unseen-format 7-/30-day probes, with sample size and missing-user rates | Test whether the app teaches durable knowledge |
| Due-review service | Due facts reviewed within a defined window, plus overdue backlog distribution | Validate scheduling is useful rather than overwhelming |
| Sync reliability | Age of oldest pending lesson and accepted/failed receipts by error class | Detect invisible progress loss |
| Entitlement reliability | Verified purchases that become usable within an agreed interval | Protect paying users |
| Subscription health | Trial conversion, renewal cohorts, cancellations and refunds by product/storefront | Evaluate durable value and price |
| Cost efficiency | Metered backend + auth/email + telemetry cost per accepted lesson and retained learner | Decide scaling and acquisition limits |

Suggested initial engineering objectives: zero known cross-account disclosure, zero lost acknowledged lessons in the fault matrix, zero duplicate reward grants under replay, and zero paid users denied a promised feature in the subscription matrix. Set numerical latency/crash objectives from a measured device baseline. Do not invent a production baseline from browser tests.

For product experiments, predeclare the hypothesis, population, duration, metric, practical effect worth acting on and stopping rules. A pilot of 8–12 people is valuable qualitative work; it cannot prove a small conversion lift. Small cohorts should inform interviews and obvious usability corrections before complex A/B infrastructure.

## Acquisition and retention strategy

Position WorldQuest around remembering real places, with an inviting daily course and visible evidence of progress. Complete a limited beginner journey well before marketing an encyclopedic world curriculum. The initial store page should show map learning, actual question variety and remembered progress. Do not imply the app teaches languages or covers every country while shipping 65.

Start with controlled recruitment from relevant adult geography/travel/learning communities where permitted, plus an owned waitlist or support channel. Observe whether learners return without being paid or repeatedly reminded. Only then test small acquisition budgets against retained-learner cost. No messages, outreach or ads were sent during this audit.

Useful retention candidates are opt-in reminders at a learner-chosen time, catch-up sessions, weekly progress recaps and a clear next lesson. Test permission requests after value, timezone/DST handling, denied permissions and quiet hours on device. Streaks should encourage return without making missed days feel like losing earned knowledge. Social challenges, referral incentives and widgets are later experiments, not substitutes for accurate learning state.

## Operating rhythm

Daily during beta: inspect failed syncs, auth/purchase incidents, content reports and support inbox. Weekly: review funnel drop-offs, retention cohorts, delayed recall, quota costs and the most common learner confusion. Per content release: independent review, schema/ambiguity checks, snapshot/version checks and rollback rehearsal. Monthly: dependency/security review, backup restore sample and subscription reconciliation. Quarterly or before major claims: repeat competitor research and review launch-region requirements.

Build support around explainable events. An authorized operator should be able to trace a lesson receipt, wallet operation and subscription event without browsing unrelated personal information or impersonating users casually. Provide an in-app route to report an incorrect fact with content ID/version and optional user text; disclose what is sent. Give every report an owner and a correction decision, including disputed facts.

## Action list

| ID | Priority / owner / effort | Action and completion evidence |
|---|---|---|
| G01 | P1 / Product + Data / M | Adopt a versioned metric dictionary with denominators, time windows, exclusions and offline handling. |
| G02 | P1 / Mobile + Data / M | Connect minimal production analytics after central child/consent gates; inspect actual emitted payloads. |
| G03 | P1 / Operations / M | Connect redacted crash/error reporting and source maps; an injected beta failure reaches its owner. |
| G04 | P1 / Data / M | Build onboarding-to-return funnel by app/content version and locale; duplicate events cannot inflate completion. |
| G05 | P1 / Learning + Data / L | Implement delayed retention study and report attrition; separate learning evidence from XP and app opens. |
| G06 | P1 / Research / M | Recruit and observe a small target-audience beta; maintain dated issue severity and follow-up evidence. |
| G07 | P1 / Product / S | Define experiment registry and decision rules; test one material hypothesis at a time until traffic supports more. |
| G08 | P1 / Support + Mobile / M | Publish reachable support and fact-reporting routes; reports carry only necessary context and receive an owner. |
| G09 | P1 / Content / M | Establish editorial ownership, source hierarchy, reviewer sign-off and volatile-fact review dates. |
| G10 | P1 / Content + Backend / M | Version content releases and corrections; queued old-version lessons still grade consistently. |
| G11 | P1 / Operations / M | Configure sync, auth, billing and quota alerts with triage/runbooks; exercise one incident for each domain. |
| G12 | P1 / Operations / M | Test backup restore and deletion propagation; record recovery point/time actually achieved. |
| G13 | P1 / Product + Design / M | Align localized store pages and screenshots with shipped coverage and working benefits. |
| G14 | P2 / Growth / M | Run a bounded acquisition test only after retention gates; report retained-learner cost and stop at the declared budget. |
| G15 | P2 / Mobile + Product / M | Validate opt-in reminders, quiet hours, travel and denied permissions; measure learning return and opt-outs. |
| G16 | P2 / Product / M | Test weekly recap, catch-up and learner-controlled goals without penalizing already-earned knowledge. |
| G17 | P2 / Backend + Product / L | Finish league assignment/settlement, moderation and fairness before enabling; repeated job execution pays once. |
| G18 | P2 / Product + Growth / M | Test voluntary sharing/referrals without contact upload; guard against reward farming and measure useful referrals. |
| G19 | P1 / Finance + Operations / M | Review per-lesson cost, refunds, support load and net revenue monthly; alerts precede budget exhaustion. |
| G20 | P1 / Product + Engineering / M | Maintain one current release backlog and evidence log; archive stale claims and review competitor changes quarterly. |

Effort scale: [audit 2](02-learning-content.md). Several items overlap other audits intentionally; the roadmap consolidates them into workstreams rather than counting them as separate projects.
