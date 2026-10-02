# Launch preparation - October 2, 2026

Approved scope: production-connected TestFlight preparation, first-lesson course
handoff, and quest progress from normal learning. Owner confirmed a **free first
release, Premium later**, with iPhone as the primary beta device and Android as a
secondary acceptance pass. Selling stays explicitly disabled.

Implemented:
- Introductory lessons resolve to the first shipped course node. One completed
  introduction is one lesson of its two-lesson step; interrupted lessons do not earn
  completion. A starting progress snapshot avoids adding a fast receipt twice.
- New D1 daily quests accept eligible correct facts from ordinary lessons, with
  server-derived first-seen/due classification, one task per fact per day, and the
  existing transactional reward cap. Previously issued fixed-fact quests are preserved.
- English and Swedish copy describes the selected region as a free-practice preference
  and uses task labels matching the new eligibility rules.
- EAS production builds fail before dependency installation if the D1 backend or
  required HTTPS URLs are missing/invalid. This uses the documented EAS hook:
  https://docs.expo.dev/build-reference/npm-hooks/
- The connected test harness isolates Metro caches by API port, fixing a cached
  localhost address that otherwise caused guest creation to fail.
- D1 receipts now settle the local reward predictions before progress is refreshed.
  The two-phone journey exposed an existing display bug: a synced first phone added
  its old predicted XP to the server total while the recovered phone showed the
  correct total. Persisted receipts also repair predictions left by an older launch.
- Choosing Finish here after hearts run out follows the machine's completed-lesson
  transition, matching D1. Previously the screen used voluntary abandonment, so
  offline course credit waited for a server receipt and analytics misclassified it.

Verification:
- Final `pnpm verify` after the responsive quest layout fix passed: 1,118 mobile,
  92 backend, 780 engine and 162 edge tests, plus the remaining workspace suites,
  typechecking and release gates. Existing 13 content and 5 i18n warnings remain.
  An earlier parallel run hit the 60-second question-construction timeout while
  two Metro builds were competing for CPU; the isolated rerun passed without
  changing the test limit or reducing its cases.
- Follow-up quest component checks: 13/13 passed; mobile typechecking passed.
- Follow-up browser journey: 107/107 checks passed, one image-question check skipped.
  Connected local D1 journey: 44/44 passed, with locally intercepted email. These
  ran before the subsequent quest-card layout fix; card layout is reviewed below.
- `pnpm verify` passed again after the D1 reconciliation fix: 86 backend tests,
  1,118 mobile tests, all other workspace
  suites, type checks, content/i18n, accessibility, contrast, and workflow gates.
  Content retains 13 existing authored-difficulty warnings and i18n 5 existing warnings.
- The browser journey passed 107/107 checks, with one image-question check skipped.
  This includes the existing 200% text and keyboard coverage.
- The focused course/progress/quest component run passed 26 tests after the course
  receipt fix. Mobile typechecking passed again after that fix.
- The later D1 receipt/award/course regression run passed 37 tests, including a
  prediction that differs from the server reward and must disappear after sync.
- After correcting the out-of-hearts completion handler, the lesson screen,
  out-of-hearts, and D1 receipt suites passed all 54 tests.
- The production environment gate passed its four tests, including reserved
  development domains; it checks configuration shape, not DNS or hosted API health.
- Targeted design measurements passed for onboarding and quests at 320, 390, 430,
  and 768 pixels. Screenshots were opened, including the connected quest and Home.
- The rebuilt connected D1 journey passed all 44 checks: introductory course credit,
  immediate offline advancement, receipt reconciliation, matching two-phone balances,
  cross-device submissions, ledger totals, recovery, deletion and child protections.
  Email was intercepted locally. Browser account recovery is not evidence of actual
  email delivery or native device acceptance.

Design review (current daylight contract, not the superseded dark mockup):
- Verdict: browser layout checks pass; native launch acceptance remains open.
- No blocker or high-severity visual finding in the inspected screenshots.
- The initial review found three identically titled practice tasks on new accounts.
  The follow-up numbers each practice round and shows its distinct-fact goal;
  screen-reader labels include the goal. Follow-up render verification is recorded below.
- Contrast gates passed 79 curated and 40 generated pairs, plus 54 night-theme pairs.
- Not covered: live email, native gestures, haptics, native screen readers, device
  performance, and all five visual states for each screen. No part of this was seen
  on a phone.

Rendered evidence: [onboarding](../design/reviews/launch-2026-10-02/onboarding-region.png),
[first course step](../design/reviews/launch-2026-10-02/home-path.png),
[connected quests](../design/reviews/launch-2026-10-02/quests.png),
[first phone](../design/reviews/launch-2026-10-02/first-phone-profile.png), and
[recovered phone](../design/reviews/launch-2026-10-02/second-phone-profile.png).

Follow-up design review: the actual QuestScreen was rendered with representative
activity tasks in an isolated local component preview, in addition to the connected
D1 journey. Reviewed English at 320, 390, 430 and 768 px and Swedish at 320 px with
200% text. The initial 200% review exposed a clipped title and descriptions squeezed
between artwork and counters. Small widths and large native font scales now stack
the card's artwork/counters above full-width text; the heading also stacks beneath
the narrow breakpoint. The inspected follow-up has no horizontal document overflow.
The Swedish heading and task goals are legible without clipped words. Native font
scaling, VoiceOver/TalkBack, gestures and performance still require a device.
No part of this was seen on a phone.

Evidence: [320 px](../design/reviews/launch-2026-10-02/quests-rounds-320.png),
[390 px](../design/reviews/launch-2026-10-02/quests-rounds-390.png),
[430 px](../design/reviews/launch-2026-10-02/quests-rounds-430.png),
[Swedish 200%](../design/reviews/launch-2026-10-02/quests-rounds-sv-320-text2x.png),
[Swedish heading](../design/reviews/launch-2026-10-02/quests-heading-sv-320-text2x.png).
Preview and working-tree screenshots include the owner's existing local mascot
artwork, which is not part of the launch-code commit.

The economy simulation before the change: casual L26 / 25,950 XP / 10,025 coins in;
regular L43 / 64,595 XP / 26,310 coins in; heavy L84 / 228,755 XP / 98,795 coins in.
All existing simulation health checks passed. The simulator models preset quest
completion; unchanged output cannot predict the increase in completion from this
eligibility change. The daily payout ceiling is unchanged and tested independently.

Production update: the free `worldquest.dpdns.org` domain is registered, Cloudflare
DNS is active, and Resend has verified it in Ireland. The EU D1 database and Worker
are deployed with all 13 migrations. API HTTPS health passes; sign-in remains closed.
The website's GitHub Pages HTTPS certificate is issued and HTTPS is enforced.
Persistent send caps (30/hour, 90/day, 2,700/month) are implemented and tested.
The owner completed the sending-key handoff. Both authorized test messages were
accepted by Resend, but Gmail rejected English and sent Swedish to Spam. SPF,
DKIM and DMARC all pass. Reliable delivery, current iOS and Android device journeys,
two-device recovery, monitoring, and release metadata remain required. Details are in
[account email setup](../engineering/account-email-setup.md).
GitHub secret-name inventory contains EXPO_TOKEN and all three APP_STORE_CONNECT
entries; no credential contents were read or reported. EAS reports active iOS signing
credentials expiring 27 May 2027. All six EAS production public values now use D1
and the new domain and were read back successfully. All four legal/support URLs
returned HTTPS 200. No production API was enabled or TestFlight build submitted.

Next production steps, in order:
1. Resolve Gmail filtering with Resend; a support draft is prepared, not sent.
2. Retest actual code delivery and hosted recovery under controlled access.
3. Keep the application API closed until controlled acceptance is ready; complete
   quota/health monitoring and operational response checks before public activation.
4. Verify real code delivery, sign-in, recovery, offline sync and deletion against
   the hosted backend on physical iOS and Android devices.
5. Build the production-connected TestFlight candidate, then complete the remaining
   native, monitoring and store acceptance gates in the launch runbook. Billing is
   deferred under the owner's free-first-release decision.
