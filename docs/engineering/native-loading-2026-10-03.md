# Native lesson loading investigation — October 3, 2026

Primary persona: Priya, who must be able to start a lesson after onboarding.

## Activated repair

After the full local verification suite, native exports and the 44-step connected
D1 journey passed, commit `d0bf0dcc` was deployed on October 3 to the existing
production Worker. Active version: `1edc8e85-3f98-44cf-a0ef-6d63f096d9c3`.
`API_ENABLED=true`; `EMAIL_AUTH_ENABLED`, leagues and challenges remain false.
No migrations or secret changes were made.

The explicit-target hosted guest smoke passed against the production endpoint:
five genuine Swedish beginner questions parsed by the shipped client, followed
by successful deletion of only the temporary guest. No lesson was submitted, no
rewards were awarded and no email was sent. This restores the backend used by
Build 14; visual/client changes require the new app build. Physical-device replay
and real email delivery acceptance remain open. The investigation below records
the earlier disabled state and the reasoning for this repair.

The reported Swedish error with Retry and Back matches `LessonScreen.ErrorState`.
`ContentGate` uses the same copy but has an illustration and no Back action.

## Hosted evidence

Read-only inspection of [iOS build run 37116947019](https://github.com/Wrexist/worldquest/actions/runs/37116947019)
at `18ee0ba8d93618c97efb4fe90877706ebd845492` found:

- Its IPA identifies itself as version **1.0.0 (14)** in `Info.plist`.
- The build log loads `EXPO_PUBLIC_BACKEND` and `EXPO_PUBLIC_D1_URL` from EAS
  production. Its Hermes bundle contains `https://api.worldquest.dpdns.org`.
- A GET of that endpoint's `/health` returned HTTP 200 with
  `{"service":"worldquest","backend":"cloudflare-d1","apiEnabled":false}`.
- `packages/backend/src/index.ts` refuses app API requests with
  `API_NOT_READY` / HTTP 503 when that flag is false. A first D1 lesson needs a
  guest identity and an issued ticket; a bundled content pack cannot authorize it.

The owner confirmed the installed app is build 14, matching the inspected artifact.
It targets a disabled service. No remote configuration, database, deployment or
account was changed during this investigation.

The production build pre-install check now requires an enabled D1 health response,
with a 10-second timeout. It prevents another build against this known disabled
endpoint; it does not enable the service or repair an already installed build.
The local repair separates guest learning from held email identity changes.

## Production readiness and activation candidate

Read-only Wrangler inspection on October 3 confirmed:

- Active Worker `worldquest-production-api`: version
  `f7a1465e-e15f-465f-bdd0-7e84a680b4f6`, deployed October 2 at 09:58:29 UTC.
- Its `API_ENABLED`, `LEAGUES_ENABLED` and `CHALLENGES_ENABLED` bindings are all
  `false`; `MAIL_FROM` is the configured WorldQuest account sender.
- `AUTH_SECRET` and `RESEND_API_KEY` are installed. Only secret names were listed.
- The DB binding points at production D1
  `4cd24c6e-6150-4962-9923-067aec033283`. A read-only migration-table query returned
  all 13 source migrations; Wrangler reports no migrations pending.
- Production packaging of the repair with `wrangler deploy --dry-run
  --config wrangler.production.jsonc` passes: `API_ENABLED=true`,
  `EMAIL_AUTH_ENABLED=false`, and both social flags false. This is a local
  packaging check; the remote API remains disabled at inspection time.

The hold is intentional in the [launch runbook](../plan/ios-launch-runbook.md),
not a missing migration or secret. The last recorded real-mail result is an
English Gmail bounce and Swedish delivery to Spam, despite successful sender
authentication. The [Resend support report](resend-delivery-investigation.md)
was sent and acknowledged; no resolution or successful hosted OTP/recovery
acceptance is recorded. No new emails were sent during this investigation.

Previously the single switch held guest learning together with email accounts.
The repair adds a fail-closed `EMAIL_AUTH_ENABLED` gate. The production candidate
enables the application API while retaining the email hold and both social holds.
Guest creation, audience protections, issued lessons, server grading, durable
replay, existing session renewal and guest deletion use their existing paths.

Linking, email sign-in and their request/resend/verify paths return `EMAIL_NOT_READY`
while held. Existing linked-account deletion remains available with its original
reauthentication requirement: a request must target the account's stored linked
email; resend/verify exemptions require an existing owner/session-bound challenge
whose server-stored purpose is deletion. A client-supplied purpose alone cannot
bypass the hold. Existing expiry, code-attempt, protected-account and rate limits
still apply. Completed deletion retries remain acknowledged without repeating it.
Real deletion mail remains subject to the unresolved delivery limitation.

The concrete activation candidate is the reviewed source plus
`packages/backend/wrangler.production.jsonc`, deployed to
`worldquest-production-api`. It preserves secrets and the production D1 binding;
no migration or replacement credential is required. The corresponding command
from the repository root is:

```sh
pnpm --filter @worldquest/backend exec wrangler deploy --config wrangler.production.jsonc
```

That command was **not executed** in this investigation. After activation, verify
that `/health` reports enabled and the installed iPhone can create a guest and
start its first issued lesson, then exercise offline replay and exactly-once
reconciliation. Record backend version and native build. Email sign-in/recovery
acceptance remains open and `EMAIL_AUTH_ENABLED` stays false. Disabling
`API_ENABLED` again closes access without deleting D1 data. Guest account creation
currently has no separate rate limiter; this candidate is beta repair, not evidence
for unrestricted public-launch abuse/cost acceptance.

The explicit-target hosted smoke below creates one temporary guest, declares a
synthetic adult audience, and requests five Swedish beginner questions from the
shipped first course step. It uses the app's authentication and lesson parsers and
deletes only its own newly created guest in `finally`. It neither sends email nor
submits answers or awards rewards. Tokens and account IDs stay in memory and are
not logged. A cleanup failure exits nonzero with a sanitized error; a lost guest
creation response is explicitly reported as unconfirmed creation/cleanup.

```sh
pnpm exec tsx scripts/smoke-hosted-guest.ts https://api.worldquest.dpdns.org
```

This command has not been run against production during this investigation. Its
success, malformed-response cleanup and cleanup-failure paths pass against local
workerd with real migrations/content; the success proof retains an unrelated
guest and checks that no email challenge or reward was created. Missing or
insecure CLI targets are refused before any request.

The app uses `POST /v1/auth/guest` for session creation, not `/session/init`.
The new lesson handling recognizes `API_NOT_READY` as a service hold, explains it
in English/Swedish and offers Back instead of an immediate retry loop. Other
recoverable errors retain Retry. Held email sign-in explains that learning on the
current device remains available and never claims a code was sent.

## Separate client contract defects

The D1 request parser silently removed `maxModifier`, `introduceFrom` and
`placement`. Its question parser rejected the single answer key of a typed
question and removed matching-board metadata. The parsers now validate and retain
those fields through network and durable-queue reads.
Placement checks also match only saved placement tickets, so a prefetched ordinary
lesson cannot replace the fixed cross-level check.

Regression tests compose questions from the real shipped geography packs. Before
the fix they reproduced rejected typed questions, lost board metadata and lost
request preferences. These defects are independent of the disabled endpoint:
the current composer does not emit typed questions when the omitted modifier
preference is absent, so they are not evidence for the reported first-lesson error.

Validation: API package tests and typecheck; mobile content and D1 lesson queue
tests; selected real workerd/D1 proofs for durable replay and beginner presentation;
production-environment gate tests. Additional real workerd/D1 proofs cover guest
learning and one reward across replay while email is held, existing linked session
renewal, and secure linked deletion while signup/sign-in remain blocked. Frontend
tests cover held-service exit, ordinary Retry and the held-email explanation.
Backend and API typechecks and production dry-run packaging pass. No iOS or Android
device replay was available in this investigation. Server reward and ownership
rules are unchanged.
