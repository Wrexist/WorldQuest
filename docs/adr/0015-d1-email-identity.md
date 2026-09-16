# ADR 0015: D1 email identity and stable progress ownership

Date: 13 September 2026. Decision: use Better Auth 1.7.4's sessionless email-OTP
verification behind a WorldQuest account gateway, with Drizzle 0.45.2 on D1.
Local workerd tests and the isolated iOS/Android account lifecycle proofs pass;
complete B02 account UI and real-delivery acceptance remain open. This serves
Alex's recoverable progress and Priya's dependable daily practice.

## Ownership and provider boundary

`accounts.id` remains the permanent progress owner. `auth_user.id` identifies the
email provider record; `identities` associates one verified identity with one
owner. New guests do not create provider users or disclose an email. Linking
preserves the guest owner; login selects an existing owner and never merges two
histories implicitly. Both are guarded D1 batches with new hashed bearer sessions.

Do not expose Better Auth's HTTP handler, anonymous plugin, sign-up, sign-in or
session APIs. Its anonymous linking replaces provider IDs and deletes the old user
by default, so it is unsuitable as the progress-owner boundary. Its Expo client
also does not replace ADR 0014's awaited credential lifecycle. The WorldQuest
client uses a backend-specific protected envelope containing session and pending
challenge together; accepting login and removing a challenge require one write.

The provider validates its complete core schema, including unused `auth_session`
and `auth_account` tables. Tests require those tables to remain empty. Only
sessionless `createVerificationOTP` and `verifyEmailOTP` run on the server.
WorldQuest bearer tokens remain random 256-bit values, stored as hashes in D1.

## Verification and policy

- Eight-digit codes expire after five minutes, with three attempts. The code is
  stored as an HMAC, scoped to a random challenge identifier and Worker secret.
  The provider verification identifier is that challenge ID, separating codes
  across owners and purposes even when delivery overlaps.
- Challenges bind the initiating session, owner, purpose and locale. D1 serializes
  resend and verification state changes; an email can have one current challenge.
  Resend waits 60 seconds and permits at most three sends. Owner request budgets
  are persistent. Public/IP/global budgets remain required before API activation.
- A verified challenge is a short-lived grant for retrying an interrupted atomic
  link/deletion commit. Consumed, expired, wrong-owner and revoked-session grants
  cannot issue a session. A changed user cannot claim another user's queue.
- Unknown/protected accounts cannot request email. The server derives a band from
  a one-time birth-year declaration and retains only the band. With a year alone,
  protect anyone who might still be under 16. Protected accounts cannot promote
  themselves by resubmitting age or passing a role field. This conservative gate
  is not legal clearance for every territory; S15 remains open.
- Linked deletion requires fresh mailbox proof. Erasure removes current identity,
  sessions, verification records, learning rows and projections in one guarded
  D1 batch. Guest deletion requires no email. Backup retention and restore behavior
  remain separate B16/S07 acceptance work.
- Migration 0004 adds a deletion acknowledgment keyed by the deleting token's hash
  and original challenge ID (null for guest deletion). It stores no owner, email,
  code or plaintext token. For 24 hours, replaying that exact deletion can confirm
  completion even though the account/session is gone. It cannot authorize account
  reads, another challenge or another session. The receipt and erasure commit in
  the same batch. Hourly maintenance removes up to 1,000 expired receipts per run;
  backlog monitoring and hosted retention acceptance remain B16 work.

## Deployment and evidence boundary

`nodejs_compat` supports the pinned provider's runtime. Drizzle transactions are
disabled because D1 uses atomic batches; inspection confirms the SQLite provider
consumes OTP rows with `DELETE ... RETURNING`. Real workerd tests verify behavior,
not a mocked SQL client. No provider secret, live email delivery or public route
has been configured by this implementation. The mobile app's active learning
adapter remains unchanged until the complete D1 learning contract is accepted.

The native proof is a separate app ID using loopback workerd/D1 and a synthetic
mailbox. Its HTTP transport exceptions and fixture endpoints are confined to the
proof checkout/server and must never enter a store build or production Worker.

Sources: [email OTP](https://better-auth.com/docs/plugins/email-otp),
[anonymous linking](https://better-auth.com/docs/plugins/anonymous),
[Expo integration](https://better-auth.com/docs/integrations/expo),
[Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), and the pinned
provider/adapter source inspected during implementation.
