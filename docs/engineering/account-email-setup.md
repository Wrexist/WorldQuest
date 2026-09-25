# WorldQuest account email setup

Decision prepared 13 September 2026. No domain or mailbox has been created yet.

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
proof that a worldwide public launch fits the free plan. No Resend account or API
key has been configured. Workers/D1 remains the application backend.

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
cd packages/backend
npx wrangler secret put RESEND_API_KEY
```

then set `"MAIL_FROM": "WorldQuest <accounts@learnworldquest.com>"` under `vars` in
`wrangler.jsonc` and deploy. Turn open and click tracking off in the Resend domain
settings.

After registration:

1. Verify the sending domain with the selected provider's exact DNS records.
2. Configure SPF/DKIM/DMARC using provider instructions and inspect DNS readback.
3. Verify an owner-controlled inbox before forwarding support and account replies.
4. Add a narrowly scoped sending credential as a Worker secret, if using Resend.
5. Send plain-text and HTML EN/SV messages with the eight-digit code, purpose and
   five-minute expiry. Disable open/link tracking; redact addresses/codes from logs.
6. Exercise controlled real delivery, wrong/expired code, resend, bounce and quota
   failure. Add persistent global send budgets before public API activation.
7. Record the processor, message retention and account deletion/backup boundaries
   in the privacy workstream. Real-mail/native acceptance and B02 stay open until
   observed evidence is recorded.

Sources checked: [Resend pricing](https://resend.com/pricing),
[Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits),
[Cloudflare Email pricing](https://developers.cloudflare.com/email-service/platform/pricing/),
[Cloudflare routing destinations](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/).
