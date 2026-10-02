# Resend delivery investigation — draft, not sent

Destination: Resend support, from the account owner. No credential values or
verification codes belong in this request.

Subject: Authenticated transactional mail rejected or filtered by Gmail

We are testing WorldQuest's optional email sign-in before launch. The domain
`worldquest.dpdns.org` was verified on 2 October 2026 in eu-west-1. Sender:
`WorldQuest <accounts@worldquest.dpdns.org>`. Enforced TLS is enabled; tracking is off.

Two owner-requested messages were sent at approximately 10:12 UTC on 2 October:

- English: `01a0fc19-bf22-7d1a-8cfd-0097c05798d8`. Accepted by the API, then bounced
  with `550-5.7.1 [54.240.3.23 12]` and Gmail's likely unsolicited-mail explanation.
- Swedish: `01a0fc19-faf6-7b7e-8f9c-5ed63ce94082`. Marked Delivered, but landed in
  Gmail Spam. Gmail original-message results: SPF PASS, DKIM PASS for our domain,
  DMARC PASS, TLS 1.3. Sending IP: `54.240.3.16`.

The messages contain text and HTML, no links or images. They were clearly labelled
delivery tests with unusable test codes. They were not bulk mail. We have not
automatically retried or enabled public account email.

Please inspect these message IDs and advise whether shared sending-pool reputation,
the newly verified domain, or the test content explains this result, and what
supported remediation is appropriate before a small controlled retest.

Acceptance requires actual sign-in and recovery mail to arrive reliably. A provider
Delivered status alone is not an inbox-placement result.
