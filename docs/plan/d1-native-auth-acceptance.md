# Next implementation: D1 native accounts (B02)

Scope: worldwide English/Swedish, beginning with the approved 16–24 audience and
preserving the existing younger-user protections. There are no live users to migrate.
Workers/D1 is the destination. The mobile app still uses the legacy adapter.

## Start with one complete account journey

Build a guest → verified email link → logout → sign in on a second installation
proof on both Expo native platforms. Reuse ADR 0014's protected storage port with
a distinct D1 key namespace. Do not switch the full app until the authoritative
learning contract and offline replay are ready.

Better Auth 1.7.4's sessionless email-OTP and SQLite/Drizzle integration now pass
local Workers/D1 tests; [ADR 0015](../adr/0015-d1-email-identity.md) records the choice.
The anonymous plugin exposes old and new users when linking and deletes the
anonymous user by default. Therefore provider user IDs must not implicitly become
WorldQuest progress owner IDs. Prove the ownership transition in D1 before choosing
that integration. Sources: [Expo](https://better-auth.com/docs/integrations/expo),
[anonymous accounts](https://better-auth.com/docs/plugins/anonymous),
[email OTP](https://better-auth.com/docs/plugins/email-otp),
[Drizzle](https://better-auth.com/docs/adapters/drizzle).

## Implementation order and acceptance

| Order | Deliverable | Required evidence |
|---|---|---|
| 1 | Stable WorldQuest owner and separate verified auth identities | Guest linking retains the same progress owner; concurrent links cannot attach one identity to two owners; switching accounts cannot submit another owner's outbox |
| 2 | Server-enforced audience policy | Unknown/protected accounts cannot request email, commerce or social permissions merely by changing a client field; eligible promotion follows the approved age policy |
| 3 | Bounded email verification | Expiry, attempt limit, resend throttling, single use, purpose and owner binding; no plaintext codes in D1/logs; no account enumeration through the public response |
| 4 | Native session lifecycle | Durable protected write before accepting login; process restart; expiry; rotation; failed storage; offline logout; server revocation; reinstall requires sign-in |
| 5 | Linking, login and recovery | Fresh guest retains progress when linking; existing-account sign-in selects its existing owner; failed or cancelled linking changes neither owner nor rewards |
| 6 | Complete account deletion | Revoke sessions and erase identities, verification records, learning state and projections; retries complete interrupted erasure without recreating the account |
| 7 | Native acceptance | English/Swedish journeys on iOS and Android; airplane mode, interrupted verification, replayed code, simultaneous requests, second installation and stale SDK completion |

Session renewal is now implemented under [ADR 0016](../adr/0016-recoverable-session-renewal.md).
The native client saves a replacement before rotation, resumes a lost response or
failed final secure write, and revokes the device family on logout. Real D1 tests
cover concurrency, rollback, deletion and challenge continuity. The extended
native restart proof now passes on both platforms, including repeated logout
from a discarded client after recovery; see the [retained evidence](phase-2-evidence/accounts/renewal/README.md).
Production account screens, explicit expired-owner recovery and
queue isolation still need integration before B02 can close.

The email sender needs a project-owned sender domain, verified delivery and a
documented free/low-cost allowance. Use synthetic delivery in local tests; do not
send real codes or adopt an unrelated Cloudflare domain as a shortcut. Sender setup
is deferred by the owner. The candidate is `learnworldquest.com`, using
`accounts@learnworldquest.com` and `support@learnworldquest.com`. These are planned
addresses, not active mailboxes. Cloudflare quoted $10.46 registration and annual
renewal; no domain has been purchased. The owner chose to defer the purchase and
continue development with synthetic delivery; the earlier spending proposal is
not authorization to buy.

## Next UI batch

Implementation and current UI evidence are recorded in
[D1 account screens](d1-account-screens.md). The rendered local D1/browser flow
passes; new native UI acceptance and the main learning integration remain open.

Use the existing account route and design system, serving Alex's recoverable
progress and Priya's return-to-learning journey. Develop against the injected D1
client and synthetic mailbox before enabling the production route's D1 cutover.

1. Replace the legacy six-digit form with the eight-digit D1 contract. Restore
   pending verification before rendering the email step. Add resend, cooldown,
   expired-code and delivery-failure states from server results; never display
   a successful-send claim after `EMAIL_UNAVAILABLE`.
2. Map local session hints and authoritative `SESSION_EXPIRED` responses into a
   recovery state. Keep the original owner and its local progress/queue until
   an explicit choice. Explain that an unlinked guest has no email recovery;
   do not silently reset that guest or request email from a protected account.
3. Use the single native account client for link, sign-in and deletion. Unknown
   audience requires the approved age flow; a client-side age flag cannot replace
   the server policy. Add friendly English/Swedish errors, retryable protected
   cleanup, and fresh email proof before deleting a linked account.
4. Finish the owner-transition coordinator alongside the D1 learning adapter.
   Stop/quarantine the previous owner's queued work before accepting another
   owner. Renewing a bearer for the same owner must preserve its cache and queue.
   Do not combine D1 identity with the legacy learning repository.
5. Exercise the real screen through restart, offline/resume, denied email,
   wrong/expired codes, resend, interrupted deletion, and account switching.
   Review small-screen/large-text captures and complete native accessibility
   acceptance; the white-screen transport proof is not a UI acceptance test.

Real sender delivery, public abuse budgets and the full authoritative learning
contract remain required before enabling the app's public D1 API. Domain deferral
does not prevent this UI and local integration work.

## Then continue Phase 2

1. Complete authoritative tickets, lesson/quest rewards, streaks, inventory,
   achievements and entitlement projections (B04/B05/B08/B09/E15/S01).
2. Connect bounded learning history and deterministic offline replay, including
   two-device and account-switch tests (B06/B07).
3. Finish abuse budgets, export/erasure/restore and measure hosted D1/Worker cost
   and latency (B12–B16). Free-tier capacity is not established by local SQL counts.
4. Reset development data deliberately and cut the app over to D1 (B17/B18/B20).
5. Continue the learning-course, UX/device, privacy/payments and launch gates in
   the [execution checklist](execution-plan.md). B02 alone does not make the app
   ready for App Store submission.
