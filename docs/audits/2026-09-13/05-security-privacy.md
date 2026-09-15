# Audit 5: security, privacy and reward integrity

**Verdict: do not open public paid accounts or competitive rewards yet.** This is a source-based security review with local deterministic probes, not penetration testing of hosted services. No production account or database was accessed or modified.

## Existing protections worth keeping

The database has RLS and protected profile columns; sensitive SQL functions revoke public execution. The submission endpoint authenticates the user and recomputes correctness from its answer key. Reward persistence is transactional, lesson IDs are idempotent, subscription notifications undergo signature/chain/audience checks, and achievement tiers have uniqueness constraints. Child/unknown accounts emit no events through the current client analytics adapter. These controls materially reduce risk; they do not establish safety of the complete journey.

## Critical findings

**S01 — Account lifecycle leaves stale in-memory state (P0, code-confirmed path).** [signOut.ts](../../../apps/mobile/src/features/account/signOut.ts) calls `clearAll`, resets audience/API state and changes route. It does not clear `queryClient()` from [query.tsx](../../../apps/mobile/src/lib/query.tsx), the module queue from [sync.ts](../../../apps/mobile/src/lib/sync.ts), or in-flight callbacks. Query keys contain no account ID; queued submissions contain no owner ID. Disk erasure cannot erase those objects. `send()` resolves the current session at delivery time. A sign-out/sign-in transition therefore needs to stop old sends and prevent old work from reaching a new identity. Cross-account effects were not exercised against live accounts; the missing lifecycle barrier is established in source.

**S02 — Local child status does not reach the server (P0, code-confirmed).** [client.ts:86](../../../packages/api/src/client.ts) uses `signInAnonymously()` without metadata. [useOnboarding.ts](../../../apps/mobile/src/features/onboarding/useOnboarding.ts) persists age locally. [handle_new_user](../../../supabase/migrations/20260805240000_qualify_trigger_functions.sql) derives `is_child` from metadata and sets it false when birth year is absent. There is no reviewed API path that connects these decisions. Server league restrictions that rely on `profiles.is_child` consequently cannot be assumed to protect the normal signup path. Unknown should be a protected state; reconcile it deliberately after age selection.

**S03 — Account route relies on entry-point hiding (P0/P1).** Settings hides account controls for children, but the account route itself has no equivalent age guard. The welcome screen intentionally offers sign-in before the age question. Design a legitimate returning-user path without letting a deep link bypass child-account policy. Check request-level policy, not only button visibility.

**S04 — Quest pinning validates shape, not an approved quest (P0, locally reproduced).** [parse-submission.ts](../../../supabase/functions/_src/_shared/parse-submission.ts) accepts up to eight tasks, arbitrary slot strings, targets of one, and repeated fact sets. The server stores the first proposal via [pin_daily_quest](../../../supabase/migrations/20260818100000_pay_daily_quest.sql). A local probe accepts eight arbitrary slots referencing the same fact and `replayQuest` completes all eight from one correct answer. The SQL payout counts completed unpaid slots. Pinning prevents later substitution but does not validate the initial proposal. Require approved slots, uniqueness, canonical targets and generation evidence; ideally issue/version the daily quest on the server while preserving an explicit offline policy.

**S05 — Grading occurs before the transaction lock (P0, source-confirmed race opportunity).** [submit-lesson](../../../supabase/functions/_src/submit-lesson/index.ts) reads facts, daily XP, streak and achievement progress, computes changes, then invokes `record_lesson`. The latest [SQL definition](../../../supabase/migrations/20260818120000_pay_achievements.sql) locks only inside that call and overwrites projections supplied by the caller. Two distinct lessons can both read revision N and commit different N+1 states. First-lesson/streak bonuses can be based on the same old state. The unique achievement award rows prevent duplicate tier payments, but do not prevent lost counters. Move reads, derivation and persistence inside one transaction or enforce a revision compare-and-retry protocol. A hosted concurrent reproduction remains required.

**S06 — An old absolute freeze assignment was reintroduced (P0/P1, static).** The endpoint sends `freezeUsed` with a comment describing delta semantics, but the latest `record_lesson` writes `freezes_held = excluded.freezes_held`. That absolute value was read before the lock. A freeze purchase between read and commit can be overwritten. Port the actual final migration semantics, not comments or an earlier fixed version.

**S07 — Missing account erasure implementation (P0).** No deletion route or endpoint was found. `clearAll()` is local sign-out cleanup, not server erasure. `review_log` has unconditional append-only DELETE triggers while profile foreign keys specify cascading deletion. A privileged deletion workflow must explicitly reconcile audit immutability, cascade behavior and required retention. Do not assume deleting the auth row will work. Apple also requires a deletion option for automatically created guest accounts. [Apple deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/)

**S08 — Shared embedded storage encryption key (P1).** [storage.ts:33](../../../apps/mobile/src/lib/storage.ts) embeds the same MMKV encryption key in every app binary. This is not a per-device secret. Prefer platform Keychain/Keystore-backed credential storage or a random device key protected there. This finding is about protection when app files are extracted; it is not evidence of a remote compromise.

**S08 resolution, 13 September 2026:** implemented platform-protected credentials
under [ADR 0014](../../adr/0014-native-credential-storage.md). Legacy migration,
restart, logout and reinstall pass in actual native modules on iOS and Android;
failure injection also covers interrupted persistence and stale client writes.
The embedded key remains only for reading/deleting legacy entries. See the
[evidence record](../../plan/phase-2-evidence/credentials/README.md). D1 accounts
and the physical-device release matrix remain separate open work.

**S09 — Collection declarations need reconciliation (P0).** The app manifest lists no collected data, while hosted accounts, identifiers, learning events and subscriptions are part of the architecture. A privacy manifest is not the App Store privacy questionnaire, and neither is automatically satisfied by disabling tracking. Inventory the actual production flows and SDK behavior before filling either. [Apple privacy details](https://developer.apple.com/app-store/app-privacy-details/)

**S10 — Analytics preference is not enforced at its sink (P1 before telemetry).** `track()` checks child status and declared event names, but does not read the adult `preferences.analytics` toggle. It currently only logs in development, so this is not evidence of current production tracking. Wire consent to the eventual transport before enabling it.

## Further threat boundaries

**Dependency scan requires triage.** `pnpm audit --prod --json` exited 1 and reported zero critical, 30 high and eight moderate vulnerabilities across a graph of 742 dependencies. These are the package manager's reported counts, not 38 proven exploitable WorldQuest defects. The graph includes Expo CLI/configuration/Metro dependencies through production package declarations; `--prod` does not mean every flagged package ships in Hermes. Examples in the results include `@xmldom/xmldom` through Expo plist/config tooling, `js-yaml` through Expo CLI, `nanoid` through React Navigation and `decode-uri-component` through navigation query parsing. Prioritize reachable runtime/deep-link code and CI processing of untrusted inputs, inspect advisory conditions and fixed ranges, then apply compatible upgrades and rerun native/journey checks. Do not apply broad overrides solely to erase the count. E18 owns this work; no dependencies were upgraded in this audit.

The 38 advisory entries represent **28 unique advisory IDs across eight package names**, with duplicated version-family entries. The [saved registry summary](dependency-audit-summary.json) retains IDs, advisory URLs, installed/fixed ranges and example dependency paths for reproducible triage.

| Flagged package | Installed version(s) | First exposure boundary to inspect |
|---|---|---|
| `nanoid` | 3.3.16 | React Navigation runtime use and advisory preconditions |
| `decode-uri-component` | 0.2.2 | Navigation query/deep-link parsing of external values |
| `postcss` | 8.4.49 | Metro/CSS build inputs |
| `image-size` | 1.2.1 | Metro image processing and asset provenance |
| `uuid` | 7.0.3 | Xcode configuration tooling |
| `@xmldom/xmldom` | 0.8.13, 0.9.10 | Expo plist/XML configuration inputs |
| `fast-uri` | 3.1.5 | Content AJV validation and external schema/content inputs |
| `js-yaml` | 3.15.1, 4.3.1 | CLI/build configuration parsing |

The local answer key is necessary for offline feedback and can be extracted. Server-side correctness therefore does not prove that a human studied. Protect competitive standings using sensible issuance, duplicate/rate/novelty checks and abuse detection; avoid presenting a client-timed quiz as cheat-proof. Payloads accept unrecognized template IDs and weak UUID shapes; reject invalid protocol data before it reaches SQL, rather than creating retryable 500 responses.

Several endpoint reads destructure `data` and ignore `error`, then substitute zero/empty values. A failed memory lookup must not silently become “new learner” during grading. Fail retriably before an authoritative write. Timezone changes also alter daily boundaries; test legitimate travel and repeated switching against first-daily rewards and streak jobs.

## Action list

| ID | Priority / owner / effort | Completion evidence |
|---|---|---|
| S01 | P0 / Mobile + Backend / L | Account-scoped queues/caches, transition barrier and cancellation/generation checks; A → B sign-in under delayed requests reveals and submits no A data. |
| S02 | P0 / Backend / M | Server unknown/child/adult policy plus onboarding reconciliation; ordinary child signup produces protected server state. |
| S03 | P0 / Mobile + Backend / M | Enforce age/account policy on deep links and API paths; child access cannot bypass rules via `/account`. |
| S04 | P0 / Backend / M | Reject noncanonical quests and duplicated/invented slots; local probe and authenticated integration reproduction fail safely with no payout. |
| S05 | P0 / Backend / L | Transactional read/grade/write or version retries; concurrent different lesson IDs preserve both reviews and award daily bonuses once. |
| S06 | P0 / Backend / M | Freeze consumption commutes safely with purchase; regression test buys a freeze while another lesson is being submitted. |
| S07 | P0 / Backend + Mobile / L | Guest/linked deletion, reauthentication where needed, session revocation, erasure job, receipt and backup-retention policy; test accounts with review history. |
| S08 | P1 / Mobile / M | Platform-protected credential storage with migration and reinstall behavior; no shared hardcoded key is treated as protection. |
| S09 | P0 / Privacy owner / M | Approved production data inventory aligns policy, store labels, manifest and SDK captures; no unsupported “collects nothing” claim. |
| S10 | P1 / Mobile + Data / S | Adult analytics opt-out and unknown/child denial enforced centrally; network inspection confirms zero forbidden events. |
| S11 | P1 / Backend / M | Bound request bytes/strings, validate full IDs and content/template compatibility; malformed payloads return stable nonretryable protocol errors. |
| S12 | P0 / Backend / M | Any required grading-read error aborts safely; injected database failures never reset memory or award from empty defaults. |
| S13 | P1 / Backend / M | Define abuse budget for sessions, OTP, submissions and webhooks; include anonymous-account farming and expensive failed requests. |
| S14 | P1 / Backend / M | Enforce timezone-change and late-event reward rules; travel remains usable without repeated daily bonuses. |
| S15 | P1 / Privacy + Product / M | Decide launch age/territories, guardian needs and child recovery path; app copy matches implemented protections. |
| S16 | P1 / Operations / M | Redaction, least-privilege support access, secret rotation, audit trail and incident response are exercised, including backup restore. |

Effort scale is defined in [audit 2](02-learning-content.md). S01, S02, S04–S07 and S12 are migration acceptance tests, not defects to carry unchanged into Convex. Legal requirements vary by product audience and territory; this audit records implementation risks and Apple requirements, not a legal compliance certification.
