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
The real run committed four lessons, twenty reviews and five fact memories; each
fact retained four repetitions. No cloud account or paid deployment was created.

This is a deliberately bounded transaction prototype: server-held five-slot capital
lessons and the existing pure grader. It does not yet implement quests, achievements,
streaks, production ticket issuance, native auth, offline history replay, timezone
policy, operational limits or production recovery. In particular, its eight-duplicate-
slot check is not completion of the canonical-quest exploit action B05/S04.

## Verification

The final local test pass contains 1,532 tests: 694 mobile, 21 API, five Convex,
557 engine, 43 design, 28 localization, seven content, six analytics, 162 edge/tool
and nine Node regressions. Typecheck and provider boundaries passed. The full gate
initially stopped on the CLI-generated declaration headers; three exact generated
files are now documented in the checker, with no authored-code exemption. All
remaining verification gates then passed. Security scanning reports no unexpected
advisories. CI for the final revision is recorded separately when it finishes.

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

Those binaries contain the Phase 1 application revision. The workflow now adds a
Maestro iOS journey for onboarding, restart and encoded deep-link navigation, and
will rebuild the Phase 2 application. E18 remains open until the new results are
recorded; startup alone does not certify all affected native paths.

## Remaining order

1. Finish E18 native journey acceptance on the rebuilt revision.
2. B02: choose and prove native guest/auth/link/recovery, including protected accounts.
3. Extend the Convex transaction slice to the complete canonical lesson/quest,
   streak, achievement and purchase contract before adding the mobile adapter.
4. Implement revisioned per-fact history, late-event replay and offline hydration.
5. Complete child policy, protected credential storage, abuse limits, erasure,
   export/restore and measured hosted cost. Only then rehearse app cutover.

The full 148-action [execution checklist](execution-plan.md) remains authoritative.
No store submission, production cutover or paid backend provisioning occurred.
