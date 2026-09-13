# Next implementation: D1 native accounts (B02)

Scope: worldwide English/Swedish, beginning with the approved 16–24 audience and
preserving the existing younger-user protections. There are no live users to migrate.
Workers/D1 is the destination. The mobile app still uses the legacy adapter.

## Start with one complete account journey

Build a guest → verified email link → logout → sign in on a second installation
proof on both Expo native platforms. Reuse ADR 0014's protected storage port with
a distinct D1 key namespace. Do not switch the full app until the authoritative
learning contract and offline replay are ready.

Evaluate Better Auth's Expo, anonymous, email-OTP and SQLite/Drizzle integration
against the actual Workers/D1 runtime. It is a candidate, not an accepted dependency.
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

The email sender needs a project-owned sender domain, verified delivery and a
documented free/low-cost allowance. Use synthetic delivery in local tests; do not
send real codes or adopt an unrelated Cloudflare domain as a shortcut. Sender setup
is the owner input to obtain when the concrete email integration is ready.

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
