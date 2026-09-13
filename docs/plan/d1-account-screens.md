# D1 account screens

Serves Alex's progress continuity, Priya's return on another device and younger
users' privacy. `D1AccountScreen` and `useD1Account` use the existing design system
with an injected D1 account client. The main account route still uses the legacy
adapter until the learning and operational cutover gates pass.

Implemented: eight-digit code entry, protected pending-challenge restoration,
server-provided resend availability persisted across restart, delivery-failure
retry, expired-code guidance, unknown-age collection before email, protected-age
email refusal, explicit session recovery, fresh proof for linked deletion,
credential-cleanup retry and failed cache-activation retry. Copy is English/Swedish.
No domain, mailbox or real email delivery has been purchased or enabled.

The D1 account host pauses learning before identity changes, invalidates captured
handles and stores a transition marker before the server mutation. Cache namespaces
include the D1 endpoint and stable account owner. Old queued work is retained during
recovery/switching; deletion targets only the deleted owner's namespace. The host
requires real learning lifecycle callbacks when connected to the main app. The
isolated UI fixtures have no learning process and therefore use empty callbacks.

## Acceptance

The full local `pnpm verify` gate passes: 1,616 tests (including 728 mobile),
typecheck, content, localization, accessibility lint, state/scroll checks and the
economy simulation. Browser screenshots selected for review are retained in
[account-screen evidence](phase-2-evidence/accounts/screens/).

- Nine screen tests use the real protected auth transport with synthetic responses:
  pending restart, eight-digit validation, resend cooldown, delivery failure,
  wrong-code retry, protected deletion, server age policy, expired-session choice,
  interrupted credential cleanup, offline return and explicit guest creation.
- Six account-host tests exercise detached work, same-owner data retention, failure
  to stop learning, restart after failed activation, scoped deletion retry and recovery.
- `node scripts/native-accounts/build-ui.cjs` then
  `node scripts/native-accounts/ui-proof.cjs` starts a fresh local workerd/D1 database
  with all migrations and a synthetic mailbox. It drives actual screens through
  linking, process-equivalent page reload, wrong code, a separate browser identity,
  recovery and deletion. Credentials in this browser-only fixture are synthetic;
  native credentials still use the OS vault.
- Rendered EN/SV captures at 320/768, including doubled Swedish text and reduced
  motion, are in `node_modules/.cache/d1-account-ui/evidence`. The narrow-screen
  input overflow found on the first run was fixed. Visible controls pass 44-point
  target checks; document horizontal overflow is rejected.
- The native account workflow now also drives the rendered form with the real
  Keychain/Keystore. Its new run must pass before claiming native UI acceptance.
  The existing transport-only proof is retained.

The browser review used actual rendered screenshots, including Swedish at 200%.
No part of that browser review was seen on a phone. Native screen-reader task
completion, physical-device keyboard/text scaling and haptics remain acceptance
work. Full resend/error/expiry combinations need native UI coverage as well.

Maestro's synthetic-mail helper follows its official
[HTTP request](https://docs.maestro.dev/maestro-flows/javascript/make-http-requests)
and [runScript](https://docs.maestro.dev/api-reference/commands/runscript) APIs.

## Before main-app cutover

Finish the D1 learning repository, authoritative reward categories and bounded
offline/history protocol; connect real pause/activate/erase callbacks and test
queued lessons across identity changes. Preserve the public API gate until real
email delivery, abuse budgets and remaining operational acceptance pass. These
screens alone do not close B02 or make the app launch-ready.
