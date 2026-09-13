# WorldQuest account email setup

Decision prepared 13 September 2026. No domain or mailbox has been created yet.

Use `learnworldquest.com`, with `accounts@learnworldquest.com` for verification
and `support@learnworldquest.com` for account help. The logged-in Cloudflare
registrar quoted $10.46 for one year and $10.46/year renewal. Registration is
pending approval for a first-year total up to $15 including tax, with no add-ons.
Check the final checkout amount and registrant details before purchase.

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
