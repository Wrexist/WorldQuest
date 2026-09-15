# Phase 2 work log

Started 13 September 2026 on `fix/phase-1-verification`.
[Execution checklist](execution-plan.md) · [Architecture decision](../adr/0012-backend-ports-and-convex-proof.md).

Primary persona: Priya, whose offline lessons must survive a restart and account
change. Also serves Alex's progress continuity and Emma's shared-device privacy.
This strengthens learning and return. Success means isolated account data and
one authoritative reward per lesson, not additional engagement surfaces.

## Source inventory and hosted limits

`pnpm backend:inventory` records tables, views, exposed RPCs, migrations, triggers,
scheduled work and edge functions in the
[generated inventory](../engineering/backend-inventory.generated.json).

Read-only hosted inspection found `worldquest-dev` inactive in `eu-north-1` and
listed version 1 of `submit-lesson`. Database table/migration inspection timed out.
The hosted schema and migration drift are unverified. The owner subsequently
confirmed that there are only development/test accounts. Build the corrected
backend directly; live-user identity migration is not required for this launch.
The source project was not restored, altered or migrated. No data was deleted.

## Implemented account and transport foundation

- Backend-neutral contracts, auth/account repository ports and a source adapter.
  Opened account handles retain their original token through later account changes.
- Provider SDK boundary check for the pure engines and domain contracts.
- Durable storage namespaces include backend and account. Fresh local guest work
  may be adopted only by its newly created anonymous identity.
- Account transitions detach query clients, optimistic awards, entitlement,
  inventory, favourites, accuracy/pace, achievements, quests and audience caches.
- Adopting a fresh guest identity keeps mounted query observers attached. Switching
  people detaches the departing persister before clearing its in-memory cache,
  so a delayed empty snapshot cannot overwrite that person's saved data. A mounted
  provider regression verifies live updates, persisted data and subsequent isolation.
- A persisted transition marker prevents an interrupted login from restoring the
  previous account's cache on restart before identity is reconciled.
- Queue persistence precedes acknowledgment. Delayed responses are ignored after
  an account change, and original work remains available for receipt-based retry.
- Pending retries have a timer; reconnects and scope changes also wake the queue.
- Logout keeps old account queues detached. English/Swedish notices explain that
  syncing resumes after signing back into that account on the same device.
- Legacy ownerless data and unreadable queues are preserved outside active reads;
  ownership recovery and user-facing recovery tooling remain B17/release work.

These changes do not establish working native auth, connected account recovery,
server-side child policy, grading transactions or per-fact memory hydration. Their
release actions remain open until the required connected/native evidence exists.

## Local Convex proof

`packages/backend` pins Convex 1.45.0 and convex-test 0.0.58. The mobile deployment
is unchanged. An anonymous local Convex service ran on loopback, with fresh synthetic
accounts and admin impersonation. This is not evidence of working end-user auth.

Both the five mock-backend tests and the real local proof passed. Two independent
HTTP clients proved concurrent duplicate receipt replay and different-lesson
conflict handling. The run also checked unauthenticated and cross-account rejection,
wallet/ledger reconciliation, retained reviews, failure-after-write rollback,
duplicate/invented slots and changed-payload rejection, then a safe retry.
The primary test account committed four lessons, twenty reviews and five fact
memories; each fact retained four repetitions. A separate account submitted two
first-day lessons concurrently and received the daily bonus only once. The same
proof passed in [fresh Ubuntu CI](https://github.com/Wrexist/WorldQuest/actions/runs/34752588625).
No cloud account or paid deployment was created.

This is a deliberately bounded transaction prototype: server-held five-slot capital
lessons and the existing pure grader. It does not yet implement quests, achievements,
streaks, production ticket issuance, native auth, offline history replay, timezone
policy, operational limits or production recovery. In particular, its eight-duplicate-
slot check is not completion of the canonical-quest exploit action B05/S04.

## Verification

The final local `pnpm verify` pass at `8fc47d6` contains 1,533 tests: 695 mobile, 21 API, five Convex,
557 engine, 43 design, 28 localization, seven content, six analytics, 162 edge/tool
and nine Node regressions. Typecheck and provider boundaries passed. The full gate
initially stopped on the CLI-generated declaration headers; three exact generated
files are now documented in the checker, with no authored-code exemption. The
complete local gate subsequently passed. Security scanning reports no unexpected
advisories. [CI revision f560dcc](https://github.com/Wrexist/WorldQuest/actions/runs/34753062750)
passed `verify:full` on Windows and Ubuntu, plus the database job. The subsequent
query-cache fix at `8fc47d6` also passed the entire Windows/Ubuntu `verify:full`
matrix and database job in [final CI](https://github.com/Wrexist/WorldQuest/actions/runs/34754478764),
including 82/82 browser steps with one existing skip on each platform.
The fresh local browser export passed 82 checks with one skipped image-prompt
branch, and the accessibility-tree check passed on ten routes. Native exports are
4.56 MB per platform against the unchanged 4.6 MB gate.

The design driver passed 18 routes at three widths plus 102 flow screenshots.
The pending-sign-out component was additionally rendered in English and Swedish
at 320 points with normal and doubled text. Its notice wraps without clipping.
The doubled-text fixture exposes existing truncation in the email row and overlapping
preview tab labels; it is not a native accessibility pass or evidence that the entire
Settings screen meets U09. Export/deletion copy no longer falsely says that a linked
user has no identifying account data. Actual erasure/export remain release blockers.

Saved [evidence](phase-2-evidence/) includes the four rendered sign-out notices and
native baseline captures. Connected/native account transitions, crash reporting,
physical-device performance, native screen readers and account recovery are still
unverified. B03 is complete; E15, S01 and B07 retain their broader acceptance gates.

## Native acceptance carried from Phase 1

[Native CI baseline](https://github.com/Wrexist/WorldQuest/actions/runs/34750079858)
built the Android release APK on Linux. It installed and launched on the local
Pixel 6 Android 15 emulator. The initial iOS job failed because macOS 14 selected
Xcode 15.4 and CocoaPods was invoked from the repository root. The workflow now
uses macOS 15 and runs CocoaPods from the mobile iOS directory.

The corrected [native run](https://github.com/Wrexist/WorldQuest/actions/runs/34750705925)
passed both jobs. The iOS simulator app installed, launched and produced a manually
viewed welcome screen. Android completed onboarding, opened a lesson, paused and
finished it, and returned to Home after a force-stop/relaunch, retaining onboarding.
Both captures show bundled fonts and art. The earlier Windows Gradle failure was a
host limitation; no major Expo/Gradle upgrade was needed.

Those baseline binaries contain the Phase 1 application revision. The Phase 2
Android build from [run 34752521529](https://github.com/Wrexist/WorldQuest/actions/runs/34752521529)
was subsequently installed on the Pixel 6 Android 15 emulator. Onboarding,
lesson entry/pause/exit, first-run Premium dismissal, Home after force-stop/relaunch,
and `worldquest://country/%53%45` opening Sweden all passed. The saved Home and
Sweden screens were inspected; fonts, art, flag and map rendered.

The iOS Phase 2 app also compiled. Its first automated journey stopped at language
selection. The test flow was corrected for the actual Next/Continue controls and
first-run Premium screen, and a replay workflow now preserves hidden Maestro
debug output plus the final simulator screenshot. It reuses the recorded simulator
binary rather than recompiling on every selector change.

[Final iOS replay](https://github.com/Wrexist/WorldQuest/actions/runs/34753801839)
passed on iPhone 16 Pro / iOS 18.5, using the `f560dcc` simulator binary from
[build run 34753062498](https://github.com/Wrexist/WorldQuest/actions/runs/34753062498).
It completed onboarding, lesson entry/pause/exit, Premium dismissal, retained Home
after restart and the encoded Sweden deep link. The previous replay had passed
through restart but stopped at the iOS "Open in WorldQuest?" confirmation; the flow
now accepts that OS dialog. The final country screenshot was inspected: fonts,
flag and map render correctly.

An [additional replay](https://github.com/Wrexist/WorldQuest/actions/runs/34754127288)
of the same binary passed on iPhone 17 Pro / iOS 26.4 with Xcode 26.6 tooling.
Both replay flows and the native binary revision are recorded separately in the
saved evidence; a newer runner image does not mean the app was rebuilt with it.

**Historical finding, superseded by the full-resolution correction below.** Both native
platforms compile and exercise the affected storage/navigation/asset paths with
the updated lockfile. However, the iOS 26.4 screenshots show a blank country
practice button, including the capture taken after the flow finished. The same
binary renders the label on iOS 18.5. The cause is unverified; investigate this
OS-specific rendering difference before closing E18. The native flow asserts the
country heading and does not prove that the button label is painted.

These binaries predate the `8fc47d6` query-cache fix; that
fix has mounted component coverage and separate full CI verification. Neither
native run proves connected account transitions, production auth, physical-device
performance or the full release OS/device matrix. Those remain Phase 2/A11 gates.

## Remaining order

1. B02: choose and prove native guest/auth/link/recovery, including protected accounts.
2. Extend the selected D1 transaction slice to the complete canonical lesson/quest,
   streak, achievement and purchase contract before adding the mobile adapter.
3. Implement revisioned per-fact history, late-event replay and offline hydration.
4. Complete child policy, abuse limits, erasure,
   export/restore and measured hosted cost. Only then rehearse app cutover.

The full 148-action [execution checklist](execution-plan.md) remains authoritative.
No store submission, production cutover or paid backend provisioning occurred.

## Full-resolution native evidence correction (2026-09-13)

The earlier missing-label finding was a preview-reading error. Inspection of the
original full-resolution iOS 26.4 PNG shows the Practice button text. The new
`scripts/check-native-button.cjs` finds 6,149 white label pixels inside that button.
The clipping experiment was reverted; there is no final Button component change.
The saved original iOS 18.5/26.4 and Android journeys therefore close E18 and Phase
1 (14/14). A replay at 29ced6b also passed on iOS 26.4. Two iOS 18 replay attempts
failed at driver startup/early tap; they do not invalidate the prior passing run.
Maestro now retries a welcome tap if the screen does not change, and the replay
workflow checks the final country screenshot pixels. This is not full A11 acceptance.

## Cloudflare D1 selection (2026-09-13)

The owner selected D1 instead of Convex. ADR 0013 supersedes the destination in
ADR 0012. The unfinished Convex auth candidate was removed from active source;
the committed transaction prototype remains recoverable from Git. The account
ports and mobile isolation work are retained. B19 is complete as a product choice;
B02/B04 remain open for their full application acceptance.

Created `worldquest-development` in the existing Cloudflare account, with EU
jurisdiction. Applied `0001_accounts_and_lessons.sql` through the signed-in Chrome
dashboard; a subsequent SQL query confirmed eight application tables, zero accounts
and the migration record. No plan upgrade. `packages/backend` now contains a Worker, D1 schema,
hashed opaque guest sessions, immediate logout revocation, strict bounded input,
account-derived ownership, authoritative grading and transactional receipts.
An account revision CHECK guard makes conflicting D1 batches abort and re-grade.
Bulk SQL keeps the worst-case bounded retry path below Free's 50-query invocation
limit. No client can supply rewards or upload an answer key.

Ten passing local workerd/SQLite integration tests exercise actual HTTP bearer sessions,
concurrent duplicates, conflicting lessons, single first-day bonus, reconciliation,
failure-after-ledger rollback, forged slots, oversize payloads and revoked/expired
sessions. A maximum 20-slot lesson uses 11 SQL statements plus authentication;
revocation between grading and commit aborts with no reward. These are development
foundation tests, not email/native auth acceptance.
The deployment configuration disables public routes, preview URLs and the app API.
The mobile adapter still uses the old backend until the full D1 contract is ready.
The initial database provisioning used the existing Chrome session. Subsequent
Wrangler authorization and development deployment are recorded below.

`pnpm verify` passed with 1,538 tests at the D1 implementation revision `e0325f3`.
The dependency security check has no unexpected advisories. The subsequent
`d68b2f5` change reads concurrent test response bodies as they arrive; its ten D1
tests pass locally and in the [dedicated D1 CI run](https://github.com/Wrexist/WorldQuest/actions/runs/34757852417).
The [full CI run at d68b2f5](https://github.com/Wrexist/WorldQuest/actions/runs/34757852507)
passes Windows and Ubuntu `verify:full` plus the retained source-database checks.
The [iOS replay](https://github.com/Wrexist/WorldQuest/actions/runs/34757666031)
passed with the final retry/paint-check workflow on iPhone 17 Pro / iOS 26.4.
It reused the `f560dcc` binary without rebundling JavaScript. The final screenshot
was inspected at original resolution and the checker again counted 6,149 label
pixels. This validates the native test changes; it is not a D1-connected app run.
See the [D1 implementation audit](../audits/2026-09-13/10-cloudflare-d1-update.md)
for the remaining order and cost/scale constraints.

## Cloudflare setup and development deployment (2026-09-13)

Fetched and applied the official `https://developers.cloudflare.com/agent-setup/prompt.md`
Codex instructions. All 14 Cloudflare skills are installed under
`C:/Users/IsacC/.codex/skills` (also copied to `.agents/skills`), and the five
documented MCP servers are registered in the user's Codex config. After restart,
the main Cloudflare connector successfully read the account's WorldQuest resources.
The public docs connector requires no login; Bindings, Builds and Observability
are registered and await their own first-use OAuth login.

Wrangler credentials are encrypted with their key in Windows Credential Manager.
The original `workers:write` scope allowed D1 work alongside `d1:write` but did
not authorize Worker script deployment. The owner approved adding
`workers_scripts:write`; no unrelated product scopes were added. An expired OAuth
callback was discarded and a fresh login succeeded. The existing MCP grant also
rejected script upload, so deployment used the approved Wrangler grant.

`pnpm --filter @worldquest/backend run deploy` successfully uploaded and activated
`worldquest-development-api`, version `dc8bd22b-f2ec-4ab1-9cb7-6915dd20bb87`.
Cloudflare API readback confirmed this version at 100%, the exact development D1
binding, `API_ENABLED=false`, and disabled workers.dev and preview URLs.
`wrangler d1 migrations list DB --remote` reports no pending migrations.
The deployment's reported startup time was 5 ms; this is not a request CPU/load
measurement. No public endpoint was enabled or native adapter switched.

Validation for this deployment used the unchanged, previously passing source,
a fresh Worker dry run, actual deployment, remote configuration readback and
migration inspection. The earlier full test/CI evidence above remains applicable;
the account, recovery, child policy and full native acceptance gates remain open.

## Native credential protection (2026-09-13)

Implemented ADR 0014: native credentials now use Expo SecureStore, with legacy
MMKV migration, serialized operations, transport generation invalidation at logout,
a durable erasure marker and an installation boundary for retained iOS Keychain
entries. Browser credentials are memory-only. Logout awaits protected erasure
before navigating; app caches remain separately scoped and preserved.

Twelve failure-injection vault tests pass. Two logout-hook tests cover failure/retry
and overlapping taps; all 45 Settings component tests pass, including the new
announced error. The final focused run is 59/59. The full local verification passed
1,544 Vitest tests plus nine Node tests (1,553 total). End-to-end: 82 executed steps
passed; the existing randomized no-image-question case is the one skipped assertion.
The dependency security check found no unexpected advisories.

The Settings failure path now offers translated retry copy and suppresses overlapping
logout. Its account email uses a wrapping block after the 200% preview exposed the
old trailing-value clipping. `pnpm design:shots` passed its 18-route × three-width
measurements plus 102 flow captures. The isolated static error fixture was inspected
in English/Swedish at 320 pt and 100%/200% text, including the scrolled retry target.
Saved captures are in `phase-2-evidence/credentials/`; reproduce with
`node scripts/native-credentials/settings-shots.cjs`. The static renderer now resolves
web module variants and removes the obsolete Settings tab from that fixture.
These UI captures were seen in Chromium, not on a phone; physical screen-reader and
device-matrix acceptance remain A11 work.

The native proof uses a separate app ID, actual native modules and synthetic data.
Initial Android migration/restart/logout/reinstall runs passed. The initial iOS
assertion found a blank proof screen; the harness now explicitly hides the splash
on layout and uses readable colors. Hidden Maestro diagnostics are now retained.
Native-source inspection also found ignored persistence/deletion statuses in
SecureStore 15.0.8. ADR 0014 records the narrow patch and Android cache rollback.
Expo's prebuilt Android module would bypass that patch, so the production app now
explicitly builds SecureStore from source. Native results for that final configuration
are recorded below. S08 is complete; native D1 accounts and the full release-device
matrix remain open.

The [full CI run at 5afe3f6](https://github.com/Wrexist/WorldQuest/actions/runs/34765011092)
passed Windows and Ubuntu `verify:full`, dependency security and source-database
checks. The [Android native run at bcd6728](https://github.com/Wrexist/WorldQuest/actions/runs/34763927826)
passed migration, restart, logout and uninstall/reinstall on API 35, with
`PASS_REINSTALL_KEYCHAIN_EMPTY`. All three compiled Kotlin persistence-failure
tests passed. The app implementation is unchanged between these revisions.

The [iOS build at 5afe3f6](https://github.com/Wrexist/WorldQuest/actions/runs/34765011134)
passed migration, process restart and logout on iPhone 16 Pro / iOS 18.5. Its
reinstall flow stopped at the system's first-link Open confirmation, as confirmed
by the saved screen hierarchy and screenshot. The updated flow accepts that dialog.
Xcode now embeds the fixture's simulated entitlements at build time; the earlier
unsigned and post-build signing approaches are rejected. The replay keeps the
original compiled app and signature intact.

The [final iOS replay at 33be56b](https://github.com/Wrexist/WorldQuest/actions/runs/34765806728)
passed all migration/restart/logout/reinstall assertions using that unchanged
`5afe3f6` binary. The final screenshot was inspected and reads
`PASS_REINSTALL_KEYCHAIN_RETAINED`: the fixture survived in Keychain, while the
reinstalled application rejected the previous identity. Native captures, the
Android unit-test report, synthetic simulated entitlements and exact revision/run
references are retained in [credential evidence](phase-2-evidence/credentials/README.md).
S08 is checked; Phase 2 now has three of its 38 actions complete. These are
simulator/emulator results, not a substitute for A11's full physical-device matrix.

B02 remains open: native email linking/recovery, account deletion and D1 identity
integration are not completed by credential storage. The [next implementation
plan](d1-native-auth-acceptance.md) defines their order and acceptance conditions.

## D1 email account gateway (implementation checkpoint)

ADR 0015 selects sessionless Better Auth OTP verification with separate stable
WorldQuest owners. Twelve new real workerd/D1 account tests cover linking,
second-installation login, protected users, challenge isolation, concurrency,
delivery failure, rollback/retry and current-data deletion. The existing ten D1
reward/ownership tests also pass. Seven portable-client tests cover protected
storage failure, restart recovery, offline logout and stale login completion.
A local HTTP smoke journey ran this client through actual workerd/D1 and confirmed
linking/recovery retained the seeded owner and progress before deletion.

The isolated native account workflow is prepared for iOS/Android and uses synthetic
delivery only. Native results are not accepted yet. The production mobile adapter
is still legacy; real account UI integration, actual mail delivery, abuse controls,
response-loss recovery and the wider release/device matrix remain open. B02 stays
unchecked. Migrations 0002/0003 and the account Worker have not been deployed.

Sender recommendation: `learnworldquest.com`, `accounts@learnworldquest.com` and
`support@learnworldquest.com`. Cloudflare's logged-in registrar showed the domain
available at $10.46 for registration and renewal. Registration approval is pending
with a $15 first-year total cap, no paid add-ons; none of these addresses is active.

At `29fa1f5`, local `pnpm verify` passed 1,563 Vitest tests plus nine Node tests
(1,572 total). Browser E2E passed 82 executed steps with the existing randomized
image-question skip. The security check has zero unexpected advisories. The
[hosted D1 local-proof job](https://github.com/Wrexist/WorldQuest/actions/runs/34769929565)
passed. The [native account builds](https://github.com/Wrexist/WorldQuest/actions/runs/34769929495)
and [full platform CI](https://github.com/Wrexist/WorldQuest/actions/runs/34769929480)
were started at that revision; their results must be inspected before accepting
native accounts. The [sender setup note](../engineering/account-email-setup.md)
records the free beta delivery option and paid Cloudflare alternative.

The current exported app also passed all measured design checks (18 routes at
three widths, plus 102 flow captures). The 320 pt account screen capture was
inspected: labels and email field render, and the existing copy correctly says
progress recovery is still being tested. These captures exercise the current app
and do not prove the new D1 account UI or physical-device accessibility.

## Native account acceptance and deletion retry

The owner deferred domain purchase and asked development to continue with
synthetic delivery. No domain, mailbox or paid subscription was created.

Both native jobs at `29fa1f5` passed. iOS ran on iPhone 16 Pro / iOS 18.5 with
Xcode 16.4; Android ran on API 35. The final screenshots were opened and show
`PASS_RECOVERY_AND_DELETION`. This proves the isolated native credential/client
lifecycle against local D1, including protected-guest refusal, pending-code restart,
link/login with the same progress owner, reinstall recovery and current-data
deletion. Three compiled Android SecureStore failure tests passed. Full Windows
and Ubuntu CI at that revision also passed. See [retained evidence](phase-2-evidence/accounts/README.md).

The next backend change closes deletion response loss. Migration 0004 stores a
24-hour acknowledgment in the same transaction as erasure, bound to the original
session hash and challenge. The old token can confirm only its deletion, never
authenticate, read data or affect a newly created account. Expired acknowledgments
are rejected and an hourly handler prunes at most 1,000 per invocation. This
handler/configuration has not been deployed; hosted retention/backlog and backup
restore acceptance remain open.

B02 is still open for production account UI, expiry/rotation and real delivery.
The active app backend is unchanged. The full learning/reward contract and offline
replay remain prerequisites for mobile D1 cutover.

At `0ceb4e0`, the deletion changes pass full local `pnpm verify`: 1,567 Vitest
tests plus nine Node tests (1,576 total). The backend suite is 25/25 and the API
suite is 29/29; the Worker dry-run build passes. No production app UI changed,
so the previously inspected browser/design captures remain applicable. New
[full CI](https://github.com/Wrexist/WorldQuest/actions/runs/34773180441) and
[D1 CI](https://github.com/Wrexist/WorldQuest/actions/runs/34773180436) were started
for this revision; their final statuses are separate from the local pass.

Both runs at `0ceb4e0` subsequently passed: full Windows/Ubuntu CI and the separate
D1 proof are green.

## Recoverable session renewal

Migration 0005 and [ADR 0016](../adr/0016-recoverable-session-renewal.md) add session
rotation with a durably prepared replacement. The same owner, rewards and pending
email challenge survive renewal. An exact retry acknowledges a committed swap;
different simultaneous replacements cannot both succeed. Logout revokes the
device family, including a successor whose response never reached the client.
Deleting the account removes all rotation records. No remote migration or Worker
deployment was made.

The targeted backend suite passes 36 tests; the API suite passes 38. New tests
restart the portable client against real D1 after both response loss and secure
write failure. The mobile factory shares one client across consumers until
erasure succeeds and uses the asynchronous OS cryptographic generator. Two further
tests cover successful secure writes whose acknowledgement/readback fails, at
both preparation and final commit. Full local `pnpm verify` passes 1,590 Vitest
tests plus nine Node tests (1,599 total). The Worker dry-run build and dependency
security check pass, with zero unexpected advisories.

At implementation revision `512b046`, [D1 CI](https://github.com/Wrexist/WorldQuest/actions/runs/34780651322)
passed. [Full platform CI](https://github.com/Wrexist/WorldQuest/actions/runs/34780651351)
and [native renewal acceptance](https://github.com/Wrexist/WorldQuest/actions/runs/34780651323)
have their own run results. Full CI passed on both Windows and Ubuntu. Android
native passed. iOS passed renewal/restart but its reinstall assertion timed out
while the simulator delayed app launch; a subsequent capture visibly shows the
final recovery/deletion pass. A bounded simulator-wait correction and unchanged
binary replay are required before accepting that job. See [renewal evidence](phase-2-evidence/accounts/renewal/README.md).
The two extra readback-loss cases only change tests;
they do not change the native binary or Worker under proof.

The current app export passes 82 executed browser checks with the existing
randomized image-question skip. Design checks pass 18 routes at three widths
plus 102 state/flow captures. The 320 pt account capture was opened and inspected:
the existing screen still states that recovery is being tested. These checks
confirm the existing app; they do not prove D1 account UI integration.

Production account screens still use the legacy flow. The next integration must
support eight-digit D1 codes, restored pending verification, resend/error states,
explicit expired-owner recovery and protected-account behavior. Do not connect
D1 identities to the old learning adapter; account/queue isolation and the complete
authoritative progress contract remain prerequisites for the full app cutover.
The owner continues to defer domain purchase and real email delivery.

The iOS [unchanged-binary replay](https://github.com/Wrexist/WorldQuest/actions/runs/34781662605)
passed at `35e0b63`, resolving the simulator launch timeout with the original
`512b046` binary. The signed archive hash matches, and its final pass capture was
opened and inspected. Full CI at `35e0b63` was superseded by the next runtime fix;
the Ubuntu/database jobs had passed and the Windows job was cancelled.

Review then found that a retained old client's repeated logout could erase a new
client's credentials. At `fadcfe5`, successful erasure becomes a permanent no-op
for that old client; simultaneous logout calls share erasure, and failed erasure
still permits retry. The native factory also refuses cleanup from a discarded
client. Tests cover both concurrent cleanup and logout after a new client starts.
The expanded native probe repeats old-client logout after recovery and asserts
that the new session remains usable.

Full local `pnpm verify` at `fadcfe5` passes 1,592 Vitest tests plus nine Node tests
(1,601 total): API 40/40, backend 36/36, mobile 713/713. Fresh
[native acceptance](https://github.com/Wrexist/WorldQuest/actions/runs/34782079778)
and [full CI](https://github.com/Wrexist/WorldQuest/actions/runs/34782079757)
cover this final runtime change. Full Windows/Ubuntu CI passed. The final iOS
native job passed, and its recovery/deletion captures were inspected. Android's
first attempt lost the emulator connection before app launch; only that job was
restarted on a fresh runner. The Android retry passed at the same revision;
both final native jobs are green. The final recovery and deletion captures for
both platforms were opened and inspected, and the Android native failure suite
again passed all three tests. [Retained evidence](phase-2-evidence/accounts/renewal/README.md)
records the original failures and successful reruns. No production screen changed, so the already
inspected browser/design captures remain applicable. The [next UI batch](d1-native-auth-acceptance.md#next-ui-batch)
defines the integration work still required before B02 can close.

## Green revision after the D1 account UI batch

At `2a60dab`, local `pnpm verify` passes 1,620 Vitest tests plus nine Node tests
(1,629 total): backend 40/40, API 48/48, mobile 729/729, engines 557/557. The two
commits after it change only a Maestro flow file, which the gate does not read.
Push [CI](https://github.com/Wrexist/WorldQuest/actions/runs/35021542992) passed
at `2a60dab`, and both the push and pull-request
[CI](https://github.com/Wrexist/WorldQuest/actions/runs/35025186194) runs passed at
`80dcdd1`. The [D1 local proof](https://github.com/Wrexist/WorldQuest/actions/runs/35021543058)
also passed there.

The backend failure on the `2b654a8` push job was a timeout, not a product fault.
`proof.test.ts:124` boots a real workerd instance, applies the real migrations and
drives the bundled Worker over HTTP; the heaviest case takes about three seconds
warm, and under a loaded Windows runner it crossed vitest's 5-second default
*while the pull-request build of the same commit passed*. `packages/backend` had
no vitest config, so it inherited that unit-test budget.
[`packages/backend/vitest.config.ts`](../../packages/backend/vitest.config.ts) now
sets a 30-second test and hook timeout, deliberately without retries — a retry
would also hide a genuinely broken case, and the timeout exists to catch hangs,
not to police how long real D1 work takes.

The [native account acceptance](https://github.com/Wrexist/WorldQuest/actions/runs/35025186129)
passes on both platforms at `80dcdd1`, and the unchanged-binary
[iOS replay](https://github.com/Wrexist/WorldQuest/actions/runs/35028042727)
replays that run's signed archive green. This is the first iOS run in which the
rendered `D1AccountScreen` completed link → restart → confirm → delete. Two
harness faults had to be fixed to get there, and the deleted-account fixture
renders immediate permanent deletion rather than the obsolete 30-day copy: see
[the evidence note](phase-2-evidence/accounts/ui/README.md). Android needed three
attempts, all infra — a corrupted NDK download, then two pre-launch emulator
losses — with no repository change between them.

The three pushes at `2b654a8` left the iOS replay red on purpose: it refuses a
recorded binary whose protected runtime paths have changed since, and that commit
changed them. Its default recorded build is now `35025186129`, so the next
unrelated run of that workflow replays the current accepted proof instead of a
superseded one.

Still open: `onSubmitEditing`/`returnKeyType="done"` are inert on the iOS
number-pad fields, so the return key never submits the birth year or the code;
the visible button covers the journey, but the keyboard cannot be dismissed
without it. Production account screens, real delivery and the public D1 route
remain required before B02 closes.
