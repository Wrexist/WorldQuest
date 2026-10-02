# WorldQuest account email setup

## Current status — 2 October 2026

The owner authorized a free domain. `worldquest.dpdns.org` is now registered
through DigitalPlat using the free slot, with WHOIS privacy enabled. The dashboard
shows registration on 2 October 2026 and expiry on 2 October 2027; free renewal is
available within 120 days of expiry. Do not purchase advance renewal credits.

Cloudflare Free hosts the DNS zone (`a072faca8e840fd9febf249d9455c5a6`) in the
existing WorldQuest account. DigitalPlat delegation is saved as
`dahlia.ns.cloudflare.com` and `rodrigo.ns.cloudflare.com`; both were confirmed
through the public resolver `1.1.1.1`. The zone is active. GitHub Pages now claims
the domain, with the four GitHub apex A records and a DNS-only `www` CNAME to
`wrexist.github.io`. Public DNS and GitHub's Pages health check pass. GitHub issued
the certificate for both apex and `www`; HTTPS enforcement is enabled. The homepage
and privacy page both returned HTTPS 200. Production app legal URLs have not yet
been changed.

Resend verified `worldquest.dpdns.org` in Ireland (`eu-west-1`) on 2 October at
11:42 Stockholm time. Domain ID: `2aeb998d-bfdc-4d82-8858-2244eb6bd551`.
The configured sender is `WorldQuest <accounts@worldquest.dpdns.org>`; delivery
still needs real-delivery acceptance tests. The owner installed `RESEND_API_KEY`;
its presence was confirmed using Wrangler's secret-name list, without reading or
printing the value. Enforced TLS is enabled.
No tracking subdomain is configured, and open tracking remains disabled. These
code-only messages contain no links or tracking pixels. No inbound mailbox exists.

Published and independently resolved through `1.1.1.1`:

| Name relative to the WorldQuest zone | Type | Purpose / target |
| --- | --- | --- |
| `resend._domainkey` | TXT | Resend-generated public DKIM key |
| `rsend` | CNAME, DNS only | `rsend-euw1.forge.rmta.net` |
| `send` | CNAME, DNS only | `send.forge.rmta.net` |
| `_dmarc` | TXT | `v=DMARC1; p=none;` (initial monitoring policy) |

Resend displays names relative to `dpdns.org`; Cloudflare hosts the delegated
`worldquest.dpdns.org` zone. Full names were used to avoid duplicating `worldquest`.
The free namespace is revocable
and has no uptime guarantee; it is a beta address, not a permanent ownership or
launch-readiness guarantee.

## Earlier paid proposal (superseded for domain selection)

Decision prepared 13 September 2026.

Use `learnworldquest.com`, with `accounts@learnworldquest.com` for verification
and `support@learnworldquest.com` for account help. The logged-in Cloudflare
registrar quoted $10.46 for one year and $10.46/year renewal. The owner explicitly
deferred the purchase and asked development to continue with synthetic delivery.
Do not register a domain or enable paid email services under the earlier proposal.
Revisit real delivery when the owner resumes domain setup.

For low-volume testing, prefer Resend Free for transactional delivery and
Cloudflare Email Routing for inbound support forwarding. Resend currently allows
3,000 emails/month and 100/day; these limits include received mail, so support
forwarding should remain outside that quota. These are beta capacity limits, not
proof that a worldwide public launch fits the free plan. The owner has signed in
to Resend and installed the production sending key. Workers/D1 remains the
application backend. Other projects share this Resend account, so WorldQuest's
application caps do not reserve the provider's quota against their usage.

Cloudflare Email Sending is another option once Workers Paid is justified. Sending
to arbitrary recipients requires that paid plan; free sending is restricted to
verified destination addresses. Paid includes 3,000 outbound emails/month, then
$0.35/1,000. Do not upgrade billing as part of domain registration.

**Code status (25 September 2026):** the Worker has a Resend adapter
(`packages/backend/src/mail-resend.ts`). It is used only when both `RESEND_API_KEY`
(a Worker secret) and `MAIL_FROM` (a var) are set; otherwise the Worker keeps
answering `EMAIL_UNAVAILABLE`, which the app already explains. Messages carry the
eight-digit code, its purpose and the five-minute expiry in the learner's language,
from `account:mail.*` in the app's own locale files; no links, no images, no
tracking. Provider refusals and outages surface as `EMAIL_UNAVAILABLE` without the
address or code. Tests: `packages/backend/mail-resend.test.ts`.

To switch it on once the domain is verified in Resend:

```bash
pnpm --filter @worldquest/backend exec wrangler secret put RESEND_API_KEY --config wrangler.production.jsonc
```

The production `MAIL_FROM` value is already deployed. The Resend form was prepared
for `WorldQuest production sign-in`, **Sending access** scoped only to
`worldquest.dpdns.org`. The owner completed the credential entry and deployment;
the Worker now lists `RESEND_API_KEY` as an encrypted secret. Both authorized
delivery tests were accepted by Resend, confirming the credential and sender work.
Never put the credential into chat or source control.
Do not enable the closed development API as a substitute for production setup.

## Production backend staged on 2 October

- Worker: `worldquest-production-api`, configured in
  `packages/backend/wrangler.production.jsonc`.
- D1: `worldquest-production`, EU jurisdiction, ID
  `4cd24c6e-6150-4962-9923-067aec033283`; migrations 0001 through 0013 applied.
- Both `AUTH_SECRET` and `RESEND_API_KEY` are securely installed.
- `https://api.worldquest.dpdns.org/health` returns HTTP 200 with
  `apiEnabled: false`; application routes return HTTP 503 `API_NOT_READY`.
- API, leagues, and challenges remain disabled; workers.dev and previews are off.
- Persistent D1 send reservations cap WorldQuest at 30/hour, 90/day and 2,700/month
  on UTC calendar boundaries. Failed or uncertain sends consume their reservation.
  Anonymous global counters survive account deletion to prevent quota resets.
- Six real-D1 budget tests cover concurrency, daily/monthly exhaustion, UTC reset,
  provider failure and missing schema. These and the 26 identity tests pass; the
  other 60 backend tests passed in the preceding full run. Typecheck and production
  packaging pass. Native journeys remain untested; real email delivery is partial,
  as recorded below.
- Code deployment: `91e65f5a-f865-4bb3-8840-324f1b7b45b1`, followed by the owner's
  secret-only deployment. The bundle includes the
  earlier local launch-preparation changes; it is not yet a clean-checkout release.

## Owner-authorized delivery test, 2 October at 12:12 Stockholm time

Two sign-in-format messages were sent through the existing Resend adapter and
persistent D1 mail budget. A temporary Wrangler remote development session used
the installed secrets without exposing their values; its local listener was bound
to loopback and the session was stopped afterward. The production API stayed closed.
The test entry and generated configuration are ignored local artifacts, not
production routes or committed application code.

- English: Resend accepted the API request (HTTP 200), then Gmail rejected the
  message with SMTP `550-5.7.1`, classifying it as likely unsolicited mail.
  Resend ID: `01a0fc19-bf22-7d1a-8cfd-0097c05798d8`.
- Swedish: Resend accepted the request (HTTP 200) and reports **Delivered**.
  Resend ID: `01a0fc19-faf6-7b7e-8f9c-5ed63ce94082`.

Both messages were labelled `[Delivery test]`, with an explicit notice that the
codes cannot sign anyone in. This verifies transport and localized rendering,
not the end-to-end OTP/account flow. Delivered means recipient-server acceptance,
not confirmed inbox placement. No automatic retry was sent after the English
rejection. Do not infer that language itself caused the rejection; investigate
authentication, sender reputation and recipient filtering before acceptance.
Public email sign-in is not launch-ready until delivery and native recovery pass.

After registration:

1. Verify the sending domain with the selected provider's exact DNS records.
2. Configure SPF/DKIM/DMARC using provider instructions and inspect DNS readback.
3. Verify an owner-controlled inbox before forwarding support and account replies.
4. Add a narrowly scoped sending credential as a Worker secret, if using Resend.
5. Send plain-text and HTML EN/SV messages with the eight-digit code, purpose and
   five-minute expiry. Disable open/link tracking; redact addresses/codes from logs.
6. Exercise controlled real delivery, wrong/expired code, resend, bounce and quota
   failure. Verify the installed persistent global send budgets before public API activation.
7. Record the processor, message retention and account deletion/backup boundaries
   in the privacy workstream. Real-mail/native acceptance and B02 stay open until
   observed evidence is recorded.

Sources checked: [Resend pricing](https://resend.com/pricing),
[Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits),
[Cloudflare Email pricing](https://developers.cloudflare.com/email-service/platform/pricing/),
[Cloudflare routing destinations](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/).
