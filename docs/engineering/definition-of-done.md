# Definition of Done

> "A feature isn't complete until…"

The checklist is in [`../../PROJECT.md §12`](../../PROJECT.md#12-definition-of-done).
This document explains **why each line is there**, because a checklist whose reasoning
nobody knows is a checklist that gets skipped under pressure.

**The rule that makes it work: there is no "we'll do it in a follow-up".** The
follow-up never comes. It becomes a ticket, then a backlog item, then a known issue,
then the reason a user with a screen reader can't use the app. If it isn't done, the
feature isn't done — and the honest response is to ship *less scope*, fully finished,
rather than more scope, half finished.

Run it with `/wq-dod`.

---

## Function

**Works on iOS and Android, phone and tablet, smallest supported device (320 pt).**
Roughly half our users are on each platform, and "works on my iPhone 16 Pro" is not a
test. The 320 pt case is where layouts actually break.

**All five states exist: content · loading · empty · error · offline.**
The single most common source of "this app feels unfinished". A skeleton, not a
spinner — a spinner tells the user to wait; a skeleton tells them what's coming.

**Offline behaviour is defined and implemented.**
Priya is on the metro; Emma's tablet has no SIM. Every feature answers: does it work
offline, does it queue, or does it explicitly and gracefully say "not right now"?
Silence is not an answer.

**Server-authoritative for anything rewarding.**
If a client can grant it, someone will grant themselves a million of it, and every
leaderboard becomes meaningless.

---

## Quality

**Unit tests for engine logic; component tests for interactive UI.**
Engine coverage is gated at 90 % because it's pure and cheap to test. UI coverage is
monitored, not gated, because chasing UI coverage produces bad tests.

**No new `any`, no new `@ts-expect-error`, no new lint suppressions.**
Each one is a small hole in the type system. Individually harmless; collectively, the
reason a refactor becomes impossible in year two.

**Performance budget met; no dropped frames on a mid-tier Android.**
A learning app that stutters feels cheap, and cheap-feeling apps don't get opened
tomorrow. Test on the mid-tier device, not the flagship.

**Error paths logged to Sentry with actionable context.**
"Error occurred" in a log is a wasted incident. Include what the user was doing, which
domain, and enough to reproduce — and no PII.

---

## Craft

**Design tokens only — zero hardcoded colours, spacing, radii, durations.**
This is what makes theming, high-contrast mode, and seasonal live-ops possible without
touching components. One hardcoded hex is one screen that ignores the user's contrast
setting.

**Motion uses the right token; the reduced-motion path is verified.**
Some users get genuinely nauseated by our celebration animations. "Verified" means
you turned the setting on and looked — not that you wrote the conditional.

**Haptics on every meaningful outcome.**
Haptics are how correctness is confirmed when the sound is off and the user is
colour-blind. They're an accessibility feature that also happens to feel great.

**Sound respects the Settings toggle.**
A learning app that makes noise in a classroom or on a train gets deleted.

---

## Inclusion

**Every string is an i18n key; `en` and `sv` provided; no concatenation.**
Retrofitting i18n means touching every screen. Concatenated sentences cannot be
translated correctly into most languages — the word order is simply different.

**Screen-reader labels, roles, and focus order verified.**
Verified with VoiceOver and TalkBack, by a person. Automated tools catch about a third
of real problems.

**Contrast ≥ 4.5:1; touch targets ≥ 44×44 pt; colour is never the sole signal.**
8 % of men are red/green colour-blind, and a large share of our core audience is
10-year-old boys. Green-means-correct alone is a broken design for them.

**Layout survives 200 % text and RTL.**
Larger text is the most-used accessibility feature on both platforms by an order of
magnitude — it is not a niche case. RTL now costs minutes; RTL later costs weeks.

---

## Product

**Analytics events fired per the spec.**
An un-instrumented feature is a feature you cannot evaluate, which means you cannot
justify keeping it — or notice that it's failing.

**Serves a named persona; consistent with the Product Bible.**
If you can't name the persona, you're building for an imaginary user. That's how
products get bloated and stop being anyone's favourite.

**Copy reviewed against the voice guide; no shaming, no dark patterns.**
The line between "engaging" and "manipulative" is exactly where our brand lives, and
it is defended in review or not at all.

**Docs updated — including `PROJECT.md` if a rule changed.**
Documentation that lags the code is worse than none, because people trust it.

---

## Exceptions

An item may be waived **only** with:
1. A written reason in the PR,
2. A named owner,
3. A dated follow-up issue linked in the PR.

Waivers are reviewed weekly. **More than three open waivers pauses feature work** until
they're cleared. This is the mechanism that stops "temporary" from becoming permanent.

**Never waivable, under any deadline:** server-authoritative rewards · child-privacy
rules · data deletion · a wrong fact shipping.

---

## Definition of Done for a *release*

Beyond the per-feature list — see `/wq-ship-check`:

- [ ] All features meet the per-feature DoD, or their waivers are logged
- [ ] Full regression E2E suite green on real iOS and Android devices
- [ ] Performance budgets verified on a mid-tier Android
- [ ] Crash-free rate ≥ 99.5 % in beta
- [ ] Store metadata, screenshots, and data-safety declarations updated and accurate
- [ ] Release notes written in the product voice, not changelog-speak
- [ ] Migrations applied and reversible; rollback plan written
- [ ] Feature flags configured for the staged rollout
- [ ] Support docs updated; the support team knows what changed
- [ ] Analytics dashboards updated for the new events
- [ ] A rollback decision-maker is named and available for 48 h
