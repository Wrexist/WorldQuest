# WorldQuest: complete audit programme

Implementation has started: use the [current eight-phase checklist](../../plan/execution-plan.md) and [Phase 1 work log](../../plan/phase-1-verification.md). The findings below remain the dated pre-fix audit baseline.

Audited 13 September 2026 against commit `59d39032a0a5103f1914e63c6614a6b55bd86400` on Windows. Scope: repository, executable checks, browser-rendered app, current official backend documentation and competitor listings. This is an audit and implementation plan; it does not migrate the backend or fix application code.

**Verdict: a substantial product foundation, but not ready for a public paid App Store release.** The highest-value work is connecting learning history, making account boundaries safe, enforcing rewards correctly, and finishing the purchase/privacy journeys. More illustrations and more gamification will not compensate for these gaps.

The realistic competitive position is **the daily geography learning app that proves you remember the world**. WorldQuest currently teaches geography, not languages. It can compete for Duolingo's learning habit and leisure time; becoming a language-teaching replacement would require a different curriculum, assessment system, audio and speech product. Duolingo already spans languages, math, music and chess, so “we can add other subjects” is not itself a competitive advantage. [Duolingo product overview](https://about.duolingo.com/)

## Read the audits

| Audit | What it answers |
|---|---|
| [1. Product and competition](01-product-competition.md) | Where to win, competitor strengths, target audience and scope |
| [2. Learning and content](02-learning-content.md) | Whether the app actually teaches, curriculum, scheduling and content coverage |
| [3. UX and accessibility](03-ux-accessibility.md) | Rendered experience, onboarding, navigation, inclusion and native testing |
| [4. Engineering and reliability](04-engineering-reliability.md) | State, sync, tests, performance, tooling and maintainability |
| [5. Security and privacy](05-security-privacy.md) | Account isolation, child protection, rewards, credentials and deletion |
| [6. App Store and monetization](06-app-store-monetization.md) | Billing, entitlements, submission requirements and release evidence |
| [7. Convex and low-cost backends](07-backend-convex.md) | Five options excluding Supabase, cost model and migration design |
| [8. Growth and operations](08-growth-operations.md) | Measurement, retention, support, acquisition and ongoing content operations |
| [Implementation roadmap](09-prioritized-roadmap.md) | Dependencies, release gates and the first work to do |
| [Evidence and limitations](evidence.md) | Actual commands, failures, local reproductions and audit coverage |

## The most important findings

| Priority | Finding | Evidence / consequence |
|---|---|---|
| P0 | Learning history never reaches lesson composition | `lib/content.ts:180` creates an empty memory map; lessons, quests and world progress consume it. The FSRS engine exists, but the client cannot select due reviews from saved history. |
| P0 | Account changes do not reset all active state | Sign-out wipes disk and resets the API client, but leaves the singleton query client, sync queue and in-flight work alive. Sign-in also needs an identity transition barrier. |
| P0 | Server child status is disconnected | Anonymous signup passes no age metadata; the profile trigger treats missing birth year as adult. Local child UI checks do not repair the server flag. |
| P0 | Quest proposals are not constrained to the approved quest rules | A local reproduction accepts eight arbitrary slot names with the same one-answer target and marks all complete. Server pinning preserves the first proposal, rather than proving it was valid. |
| P0 | Read/grade/write is not one transaction | The endpoint reads memory, daily XP, streak and achievement state before SQL acquires its lock. Different concurrent lessons can commit stale projections. |
| P0 | Purchases and premium behavior are unfinished | `UNAVAILABLE` is the default purchase port; the lesson runner also omits the premium heart setting. |
| P0 | No usable privacy/terms links or deletion journey | Settings URLs are undefined. No account deletion endpoint/UI was found; append-only review triggers also need a lawful-erasure design. |
| P1 | Offline retry has no scheduled wake-up | Backoff timestamps exist, but a transient failure waits for another enqueue/connectivity event or manual action. |
| P1 | Repetition and uniqueness defects | Memory starts empty and the seed restarts at one. Separately, a local selection probe returns ten slots containing nine distinct facts. |
| P1 | Production visibility is absent | Analytics is development logging; crash reporting defaults to a console sink. |
| P1; P0 if severe exposure is reachable | Dependency findings need triage | Production-graph audit reports 30 high and eight moderate vulnerabilities; Expo tooling is included, so runtime reachability must be assessed. |
| P1 | Content is limited | 65 countries, 350 fact records, 13 multiple-choice templates; 696 askable item/template combinations. These are not 696 different facts. |
| P1 | Local verification gives misleading results on Windows | Workspace filters match no projects, some tests assume LF, native script launches `npx` incorrectly, screenshots use illegal filename characters and English selectors inherit Swedish locale. |

P0 means block public release, payment, or the affected sensitive feature until fixed. P1 means finish before expanding a beta into a broad public launch. P2 means a competitive improvement after the core is trustworthy. P3 means an expansion hypothesis requiring evidence. These priorities are recommendations, not claims that every proposed feature is necessary for Apple's approval.

## What already deserves credit

The code has pure reusable engines, deterministic scheduling, reference FSRS traces, validated and independently cross-checked content, English and Swedish copy, visual/text question equivalents, an offline completion queue, signed Apple notification verification, atomic SQL reward persistence, achievement uniqueness constraints, screen-state components, and useful test harnesses. Email account linking/sign-in, quest payouts, achievement payouts and map questions **already exist**. Older documents saying otherwise should not drive new implementation.

The audits contain **148 uniquely numbered action items** across eight lists, with priorities, owner roles, rough effort and acceptance criteria. Related items overlap across disciplines; the roadmap consolidates them into workstreams. They distinguish **observed defects**, **unverified operational work**, and **proposed competitive improvements**. No finite audit can establish that every defect has been found, or promise a top App Store ranking.

## Backend recommendation

**Use Convex as the first candidate for a bounded migration proof.** It fits the TypeScript engines and lets grading and persistence share one transaction. Keep durable offline storage and an account-scoped outbox in the app. Convex's own documentation says its normal sync handles network interruptions but is not a complete offline-sync solution. [Convex sync](https://www.convex.dev/sync)

The alternative with the clearest low infrastructure floor is Cloudflare Workers + D1, with more authentication and backend assembly work. Firebase and Appwrite are credible alternatives; PocketBase is a smaller self-hosted option with a larger operational responsibility. Supabase is assessed only as the existing migration source, not recommended as the destination. Full prices, assumptions and acceptance gates are in [audit 7](07-backend-convex.md).

Start with the [roadmap](09-prioritized-roadmap.md). Do not begin by rebuilding all screens or launching a social network.
