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
4. Complete child policy, protected credential storage, abuse limits, erasure,
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
The Worker bundle is prepared but has not been deployed. Wrangler CLI has no login;
the existing Chrome session was sufficient to provision and verify the database.
