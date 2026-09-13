# ADR 0016: Recoverable D1 session renewal

Date: 13 September 2026. Development implementation; public API activation and
production account screens remain separate acceptance gates.

## Decision

WorldQuest sessions last 30 days and can rotate during their last seven days.
Rotation retains the WorldQuest progress owner. It does not grant rewards, change
the audience band, or create a new account. The server decides expiry and the
renewal window. A retired bearer immediately loses ordinary API access.

The portable client generates a new 256-bit token and awaits a protected write of
the old session, replacement token and pending email challenge **before** calling
`POST /v1/auth/renew`. The native factory uses Expo Crypto 15.0.9's asynchronous
OS random-byte API; its synchronous debug fallback is deliberately avoided.
All native consumers share one auth client until credential erasure succeeds,
preventing concurrent writers from overwriting each other's prepared replacement.

A single D1 batch creates the new hashed session, records the old/new hash pair,
rebinds the pending verification and removes the old session. A lost response can
be retried with the same two saved tokens. Only that exact pair acknowledges the
existing successor; it cannot issue another bearer, extend expiry again or revive
a revoked successor. Concurrent different replacements have one winner.

After D1 acknowledges, one protected write accepts the new session and removes
the pending replacement, keeping the email challenge. Network failure, process
termination or a failed final write leaves the prepared pair recoverable. This
differs from first-login rejection: revoking the successor after a renewal storage
failure would destroy the already persisted recovery path.

## Revocation, retention and expiry

Migration 0005 adds a family identifier to sessions and `session_rotations`.
Existing sessions receive their own hash as family ID. The receipt contains only
hashes, owner/family identifiers and expiry; no plaintext bearer, email or code.
It expires with the successor, at most 30 days after creation. The hourly handler
prunes at most 1,000 expired rotation records in addition to deletion receipts.
Hosted retention/backlog monitoring remains required before launch.

Rollback must retain a Worker that understands migration 0005's family erasure.
An older Worker cannot correctly delete an owner with rotation rows. Disable the
API before rolling back incompatible auth code; restoring an export uses a new
database rather than reversing this migration in place.

Either saved bearer can log out the entire family. Logout is serialized against
rotation in D1; a delayed renewal cannot escape that revocation. Another device's
independent family remains valid. Email linking revokes the old guest families;
account deletion erases every family and rotation record. An expired rotation
receipt cannot authorize a retry. It never authorizes account or learning access.

Offline logout guarantees local erasure and makes a best-effort server request.
It cannot promise remote revocation without network access; a remaining remote
bearer expires normally. This limitation is unchanged from the previous client.

`restore()` is a read-only local operation. `sessionStatus()` distinguishes missing,
active, due, interrupted and expired credentials. `ensureSession()` settles any
interrupted renewal before protected work. Server rejection retains the original
owner for an explicit recovery choice. `startGuest()` never silently replaces an
expired stored owner. Linked users can recover through email on another session;
an unlinked guest has no mailbox recovery credential. The account UI must explain
that boundary and preserve/quarantine that owner's local queue until the user
explicitly chooses what to do. Those UI and offline-queue gates remain open.

## Evidence

Real workerd/D1 tests cover exact retry, different/same concurrent replacements,
expiry, rollback, pending email verification, per-device logout, logout races,
deletion and cleanup. Portable-client tests inject protected-write and response
loss; integration tests restart the client against real D1 after both failures.
The native acceptance fixture ages a synthetic session, drops the committed
renewal response, restarts the app and resumes through the actual vault/OS RNG.
Its current run status is recorded in the phase verification log, not inferred
from the presence of the workflow.

Sources: [D1 batch transaction semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch),
the pinned Expo Crypto implementation, and real local workerd tests.
