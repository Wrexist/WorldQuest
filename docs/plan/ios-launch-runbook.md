# WorldQuest free-launch runbook

Updated 4 October 2026. Owner decision: **free first release; Premium later**.
Primary acceptance device: iPhone. Follow with a shorter Android pass. This is a
release checklist, not a statement that public launch is ready.

## Ready

- Free domain: https://worldquest.dpdns.org. GitHub Pages HTTPS is enforced.
  Privacy, terms, support and licences pages each returned HTTP 200.
- Production Cloudflare Worker and EU D1 exist, with migrations 0001–0013.
  Guest learning is active at Worker version `1edc8e85-3f98-44cf-a0ef-6d63f096d9c3`
  from commit `d0bf0dcc`. The hosted smoke issued five Swedish beginner questions,
  then deleted its temporary guest. Email identity changes and social features
  remain held. [Repair evidence](../engineering/native-loading-2026-10-03.md).
- Resend sender is verified; both Worker secrets are installed. Gmail confirms
  SPF, DKIM and DMARC PASS. Transport is configured; inbox delivery is not accepted.
- EAS production has all six public values: `EXPO_PUBLIC_BACKEND=d1`,
  `EXPO_PUBLIC_D1_URL=https://api.worldquest.dpdns.org`, and the four
  `EXPO_PUBLIC_{PRIVACY,TERMS,SUPPORT,LICENCES}_URL` values on the new domain.
  Read back with `eas env:list production --format short`.
- EAS iOS credentials inspection reports an active App Store provisioning profile
  and distribution certificate, both expiring 27 May 2027. This was read-only;
  Apple portal revocation was not independently checked.
- Purchase entry points remain disabled explicitly for the free release. The
  animated Premium design is retained for a later release; no subscriptions are sold.
- Introductory lessons advance the first course step. New D1 quests count eligible
  facts from ordinary lessons. XP prediction reconciliation avoids double counting.

## Blocking email acceptance

The English delivery test was rejected by Gmail; the Swedish message landed in Spam.
Do not treat Resend's Delivered status as inbox success. Authentication passed.
See [delivery evidence](../engineering/account-email-setup.md) and the
[Resend support report](../engineering/resend-delivery-investigation.md).
The report was sent and acknowledged October 2. No repeated tests or inbox filter
overrides were applied.

Resolve delivery, then run controlled actual code verification and recovery. Keep
`EMAIL_AUTH_ENABLED=false` until those email identity flows are accepted. The October 3
repair separates guest learning from this hold: the production candidate sets
`API_ENABLED=true` while retaining the email and social holds. Existing linked
account deletion keeps its verified-mail path; this does not waive delivery acceptance.
Before unrestricted public activation, check guest-creation abuse limits, persistent
send budgets, failure behavior and operational response.
The existing temporary remote-mail test is not a public application endpoint.

## Prepare a reproducible iOS candidate

1. Commit and push the reviewed launch changes. Keep unrelated local artwork out
   of the release commit unless separately reviewed.
2. Pass `pnpm verify`, native bundle checks and connected journey tests. Record
   the actual commit and results in the [launch log](launch-preparation-2026-10-02.md).
3. Confirm the EAS account's current free allowance before starting a cloud build;
   do not upgrade or spend money without a separate owner decision.
4. Run `.github/workflows/eas-testflight.yml` on the reviewed branch with
   `submit_testflight=false` for build-only preparation. The workflow stamps a unique
   build number and uses the configured production environment and iOS credentials.
5. Arrange controlled backend access before distributing a usable beta. A build
   pointing at a closed API is not a passing sign-in or learning test.
6. Submit the accepted candidate to TestFlight and record build number, commit,
   install link and backend version. Do not submit the public App Store release yet.

## iPhone beta — owner performs the physical interactions

Record iPhone model, iOS version, language, build and backend version. Use a disposable
beta account. Never post verification codes or credentials in the test report.

- Fresh install: complete onboarding, play the introduction, verify first-step credit.
- Lesson: correct and wrong answers, map/flag/capital questions, sound and haptics.
- Interrupt: lock/unlock and background/foreground during a lesson. Separately
  force-close and relaunch, then reopen the same course step or practice entry.
  D1 lesson input is now saved locally and replayed against the same issued ticket;
  native acceptance remains open. Run `apps/mobile/e2e/native-lesson-recovery.yaml`
  from Home on a D1 candidate and compare the before/after feedback screenshots.
- Offline: prepare a lesson online, enable airplane mode, finish it, reconnect.
  XP, coins, quest credit and course progress must settle once, without duplication.
- Account: receive a real code; test wrong code, expiration and resend behavior.
- Recovery: sign into the same account on a second device or after reinstalling;
  compare XP, streak, course progress, cosmetics, preferences and learned facts.
- Privacy: verify child restrictions and parental gates. Delete only the disposable
  beta account; confirm old sessions can no longer access it.
- Accessibility: VoiceOver, largest supported text, reduced motion, dark/light mode.
- Free release: no Premium prompt, trial claim, Restore purchase row or payment flow.

Android follows with install, a complete lesson, backgrounding, offline sync,
recovery, TalkBack and large text. Use a mid-tier device for the performance budget.
iPad support is still configured; iPad acceptance and store screenshots remain open.

## Store and operations gates still open

- App Store metadata, current screenshots, age rating, privacy disclosures, review
  notes and territorial availability must match the actual free build. Prioritize
  iPhone screenshots, but do not silently waive the configured iPad requirements.
  [English/Swedish store copy](../product/store-listing-free-v1.md) is prepared as a
  draft; it has not been submitted.
- Owner-only legal declarations (including EU trader status and any agreements)
  need the owner's answers and submission; never invent them. No paid-product setup
  is needed for this free release.
- Real-device acceptance, delivery reliability, quota/health monitoring, incident
  response and restore rehearsal need recorded evidence.
- Durable unfinished-lesson recovery is implemented for D1 and awaits native
  force-close acceptance. Due-review-first Home selection remains open product work.
  See the [recovery implementation and acceptance notes](../engineering/lesson-recovery-2026-10-04.md).
  Browser tests are not evidence of native gestures or performance.
- Course English/Swedish copy and content review remain launch checks. Existing
  authored-difficulty warnings are not silently waived.

The [execution checklist](execution-plan.md) remains the full source of release gates;
this runbook narrows the next operational steps and does not close unverified items.
