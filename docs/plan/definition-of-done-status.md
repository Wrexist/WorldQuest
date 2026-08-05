# Definition of Done — where this actually stands

Run against [`PROJECT.md §12`](../../PROJECT.md#12-definition-of-done) after the UI
completion waves. The skill's own instruction is the reason this file exists:

> Never report "complete" with an unticked box.

So this is the unticked boxes, named. **The app has never run on a phone**, which is
the single fact that most of the rest follows from.

---

## Automated: green

`pnpm verify` runs typecheck, **873 tests** across seven packages plus **108** against the
edge functions, content validation, i18n completeness, **26 contrast pairs**, `lint:a11y`,
`escape-hatches`, `reachability` and `five-states`.
`pnpm e2e` runs **67 steps** against the real Metro bundle in Chromium — including six
screens re-measured at 200 % text — `pnpm a11y:tree` walks Chromium's computed
accessibility tree over 10 routes, `pnpm design:shots` renders those routes at
320/390/768, and `pnpm bundle:native` builds both native platforms against a 6.0 MB
size budget. The **25** edge-bundle guards run inside `pnpm test` rather than under a
separate `pnpm edge:test`, which no longer exists.

**CI is green on both jobs**, which it had never been. Every failure between runners
returning and that point was a real pre-existing bug rather than an infrastructure
artefact — a Chromium path hardcoded to one container, a deploy bundle assembled in
memory and never written, an engine module the bundle did not contain, a pgTAP plan
that had never executed, and a types check comparing a hand-decorated file against raw
generator output. None of them could have been found by a green pipeline, because the
pipeline had not run.

That is a real floor, and it is not the same as done. The section at the bottom on
what the lesson actually asked is the argument for why: every one of those numbers was
green while two thirds of the authored content was unreachable.

---

## ⬜ Function

| Box | State |
|---|---|
| iOS **and** Android, phone and tablet, to 320 pt | ⬜ **Never run on either, and tablet means tablet-in-PORTRAIT.** No iOS Simulator without macOS, no Android emulator without `/dev/kvm`. Every layout claim in this repo is a claim about Chromium, now checked at 320/390/768. **Both platforms do now bundle** — `pnpm bundle:native`, **5.75 MB** of Hermes bytecode each against a 6.0 MB budget, plus **2.90 MB** of assets shipped beside it (2.09 MB fonts, 0.71 MB flags, 0.17 MB sounds). Until that script existed the app had only ever been bundled for web. `orientation` stays `portrait` on purpose: every layout here has been measured at 320/390/768 in portrait, and turning landscape on would ship an orientation nothing has rendered. **No store build is possible at all** — `icon` and `splash` do not exist, and asset-prompts.md files a brand mark under the same never-generate rule as a flag. The metadata around them is now complete: iOS privacy manifest (required since 2024, fails at upload without it), `NSPrivacyTracking: false`, an empty collected-data list, `permissions: []` and a blocked microphone on Android. |
| Five states everywhere | ✅ **Audited, and the audit is a script.** `pnpm five-states` checks all 16 screens; 15 states are waived with a recorded reason and the script fails on a waiver the code has outgrown. See below for what it found. |
| Offline behaviour | ✅ Queue, replay on reconnect, backoff, parked work surfaced. Real connectivity as of Wave 7. |
| Server-authoritative rewards | 🟡 **Real for XP, coins, mastery and streaks as of 2026-08-05; not yet for everything.** The box says "client cannot forge it", which is a stronger claim than "nothing on the client writes a balance" and was not true. `user_facts.mastery` was never written by anything, so the count on Home was always zero; `streaks` was written only by the signup trigger, so the streak was always zero; the shop performed no spend, so every cosmetic was free; and `answeredAt` was taken from the client unvalidated, which minted mastery and `factMastered` XP. All four are closed — see `record_lesson`, the mastery trigger, `purchase_item` and `_shared/submission-time.ts`. Since then: streak milestones are paid, `lessons.hearts_lost` is written, the freeze is buyable, `expire_streaks()` records a break hourly per user timezone, and every achievement event has a producer — seven of twelve could not move at all. What remains: achievement and quest AWARDS are still optimistic (the unlock is evaluated on device from server-derived events; the XP and coins behind a tier are not yet paid by a server path), and there is no sign-in, so there is deliberately no sign-out. |

## ⬜ Quality

| Box | State |
|---|---|
| Unit + component tests | ✅ **981 passing** — 873 across the workspace and 108 against the edge functions, 25 of those guarding the deploy bundle. The app now has a coverage floor (60/80/60) where it had none, and `passWithNoTests` is gone from four packages where it meant a deleted suite goes green. Two screens gained their first tests this wave — `RegionScreen` had none at all, which is why a reachability check rather than a failing assertion found it re-deriving totals the engine already owned. |
| No `any`, no `@ts-expect-error` | ✅ Zero of both outside tests — **and now checked**, by `pnpm escape-hatches` in `pnpm verify`. This box was true but unenforced: verified by hand, once, resting on nobody having broken it. Three `eslint-disable`s are allowlisted with written reasons (all lazy or static `require`s that cannot be expressed otherwise), and a stale allowance fails the build like a violation. |
| Performance on a **mid-tier Android** | ⬜ Not measured — there is no device. **One property of it now is:** `pnpm bundle:native` enforces a per-platform ceiling on the Hermes bundle, because Hermes reads every byte before the first frame and that is the part of cold start visible without hardware. It has already earned its keep twice. Adding Sentry pushed the bundle 3.80 → **5.72 MB** and the budget failed the build, turning a silent 50 % growth into a recorded decision (budget now 6.0). And when 701 KB of flag artwork landed against 250 KB of headroom, the script now reports assets separately and showed the real cost to the bundle was **0.03 MB** — Metro ships images beside the bytecode rather than inside it, so the obvious reaction (shrink the flags) would have degraded the artwork for nothing. Frame times, memory and actual startup remain unmeasured. |
| Errors to Sentry with PII-free context | 🟡 **Transport built, round trip unverified.** `@sentry/react-native` installed, `lib/reporting.ts` wires it, `ErrorBoundary` reports through it, init at module scope so a first-render crash is caught. No-op until `EXPO_PUBLIC_SENTRY_DSN` is set — no half-configured state. PII-free is enforced by the **type** (`CrashReport` has no free-text field) plus a `beforeSend` scrubber, both tested. What is missing is a DSN and proof an event arrives. Cost: **1.92 MB** of bundle. |

## 🟡 Craft

| Box | State |
|---|---|
| Tokens only | ✅ Guarded by `tokens.test.ts` and `design:contrast`. The whole system was rebuilt around one rounded face and pressable depth — see `docs/design/design-system.md` §4a and §5. |
| Reduced motion **verified** | 🟡 The code path is guarded and unit-tested — and the guard now proves the helpers it trusts actually consult the setting, which it did not before. Still not watched on a device with the setting on. **Newly known, and it changes what "unit-tested" means here:** jsdom has no `matchMedia`, and react-native-web answers `isReduceMotionEnabled()` with `true` when it cannot query — so *every* component test in this repo has always run the reduced-motion branch, and none has ever exercised the animated one. That is the right branch to have covered by accident, but it means a green suite says nothing about motion. `Animated.timing` in jsdom also completes in one frame, so an animation hook that did nothing would pass there too. Motion is therefore guarded at the source (`motion.test.ts`) and, for the XP tally, measured in real Chromium by `pnpm e2e`. Recorded in `apps/mobile/src/test/setup.ts`. |
| Haptics on every meaningful outcome | 🟡 Built and wired to the answer path and lesson completion, honouring the Settings toggle that until now wrote a preference nothing read. **Unverified on a device** — like everything else here, and a vibration is the one thing a screenshot can never show. |
| Sound respects the Settings toggle | ✅ Six sounds, **generated** rather than sourced, so the project owns them outright. Off by default per §9; the toggle that wrote a preference nothing read now drives them. |

## 🟡 Inclusion

| Box | State |
|---|---|
| Every string an i18n key, `en` + `sv` | ✅ **441 keys**, both locales complete, ICU plurals, 397 translator notes. |
| Screen reader verified with VoiceOver **and** TalkBack | ⬜ Neither exists here — but the **mechanical half is now checked against the tree a reader consumes**, not against source. `pnpm a11y:tree` walks Chromium's computed accessibility tree over 10 routes and fails on a control with no accessible name, a name that is only a glyph, a name that describes an icon rather than an action, a full-screen route with no way back, or focus order that fights reading order. It found two real defects immediately (see below) — including settings toggles that would have been **announced but impossible to operate with VoiceOver**. The primary task is also completable with the keyboard alone (`pnpm e2e`). What remains genuinely device-bound: announcement quality, the readers' own gestures and grouping, and whether any of it is comprehensible when heard with the screen off. |
| Contrast ≥ 4.5:1, targets ≥ 44 pt | ✅ 26 pairs checked; targets sized in code. |
| Survives 200 % text and RTL | ✅ RTL is linted (`lint:a11y`) after two real bugs. 200 % text is now measured on six screens in `pnpm e2e` — see below. |

## 🟡 Product

| Box | State |
|---|---|
| Analytics per spec | 🟡 **18 of 28** declared events fire (was 2). Every remaining one is blocked on a server, an account, or push — none is forgotten. The child no-op was broken; fixed. |
| Serves a named persona | ✅ |
| Copy against the voice guide | ✅ And asserted, not trusted: no-shame, no-guilt, no-dark-pattern rules are tests in the streak, welcome-back, out-of-hearts, paused and sync screens. |
| Docs updated | ✅ |

---

## What is left, and what each is actually blocked on

1. ~~**Haptics.**~~ Built. The wrong-answer pattern is `impactMedium`, never
   `Notification.Error` — that one is two sharp knocks, the pattern iOS uses for a
   failed payment, and this app does not punish a child for not knowing something yet.
   A test asserts the source never reaches for it, because a runtime test would pass
   just as happily with the punishing pattern: both spellings are "a function was
   called".
2. ~~**Sound.**~~ Built — and the reason it sat here for months was a bad
   classification, not a real blocker. It was filed next to flags and landmarks under
   "assets", and it is not the same problem: a correct-answer chime is a sine wave with
   an envelope. `scripts/make-sounds.py` generates all six, so the project owns them
   with no licence to track and nothing to take down.
   Three decisions worth keeping. **Wrong is a falling major second, not a buzzer and
   not a minor second** — the latter is the sound of a mistake in every film score ever
   written, and this app does not punish a child for not knowing something yet; it is
   the same rule that gives a wrong answer a muted surface instead of red.
   **`playsInSilentModeIOS: false`**, because iOS defaults to playing through the silent
   switch, which is what a music app wants and a game does not. And **off by default**:
   the stored default read `true`, which cost nothing while nothing played and would
   have been wrong the moment it did — a game that starts making noise on a bus has made
   an enemy in ten seconds.
3. ~~**Flags.**~~ Built — **and the note above got the contrast wrong**, which is worth
   recording because being half-right is what kept this shut. It said a flag is
   somebody's artwork with a licence attached, unlike a chime. Both halves are true and
   the conclusion does not follow: a flag *is* somebody's artwork with a licence
   attached, and that licence is MIT. `docs/design/asset-prompts.md` had named
   `flag-icons` as the source since the day it was written — in a row headed **do not
   generate**, because a hand-drawn flag with the wrong number of stars is a wrong fact.
   "Never draw this" was being read as "we cannot have this yet".

   `pnpm build:flags` rasterises all 65 from flag-icons 7.5.0 (MIT) at 600×450, the
   licence is recorded per entity in the countries pack, and the collection went from 65
   identical `⚑` placeholders to the mockup's screen 10. It also turned the lesson's
   picture question back on — see the section below on what the lesson actually asked.

   The lesson to carry: two blockers on this list in a row turned out to be filing
   errors rather than dependencies. Whatever is next on it deserves the same second
   look before it is reported as blocked.

4. **Sentry.** The *transport* turned out not to be blocked at all — only the round
   trip was. "Blocked on a DSN" had been standing in for "blocked on a DSN and also
   nobody has written any of it", and those are very different. The SDK is installed,
   wired, tested and bundling on both platforms; it needs a DSN to do anything, and
   proof that an event arrives still needs an account this environment does not have.

   Building it surfaced the cost the budget was added to surface: **1.92 MB**, a 50 %
   bundle increase from one dependency. Kept anyway, because an app that has never run
   on a physical device is the app that can least afford invisible crashes — but
   recorded in `scripts/bundle-native.cjs` as debt to revisit with real cold-start
   numbers rather than absorbed quietly.
5. **A device.** Not something code can fix. Everything that can be prepared for it
   now is: `apps/mobile/eas.json` has a `preview` profile that produces an installable
   build, and [`device-pass.md`](device-pass.md) is the checklist for the sitting —
   written so the four remaining boxes close in one pass rather than being rediscovered.

   One real defect turned up while writing it: **`supportsTablet` was `false`** in
   `app.json`, while `PROJECT.md` requires phone *and* tablet and the design system
   defines an `lg ≥ 600` breakpoint with a two-column Explore. The app would have
   shipped iPhone-only against its own spec. It is `true` now and has never been seen on
   a tablet, so expect that row of the checklist to find things.

   Three things that were being deferred to it turned out not to need it:

   - **Native bundling.** `pnpm e2e` exported `--platform web` and nothing else, so the
     app had **never been bundled for iOS or Android at all**. Metro resolves per
     platform — `foo.ios.ts` and `foo.web.ts` are different files, `react-native-web`
     substitutes on one platform only, and a native module that throws at import is
     invisible to a web build that never loads it. This repo has already lost a week to
     exactly that class of bug. Both platforms now bundle, checked by
     `pnpm bundle:native`. It proves the graph compiles; nothing executes the bundle.
   - **Keyboard operability.** A control a screen reader cannot activate is nearly
     always one the keyboard cannot activate either — both go through an accessibility
     action rather than a touch sequence, which is precisely how the tab bar once
     shipped inert on web *and* unreachable by screen reader on every platform. A
     lesson can now be answered with Tab and Enter alone.
   - **The accessibility tree.** "Screen readers need a device" was true of whether
     the app is *comprehensible* when heard, and untrue of whether it is *operable*.
     Chromium computes a real accessibility tree with real accessible names, and
     nothing was reading it: `lint:a11y` reads source, `design:shots` accepted
     `textContent` as a label (so a button whose only content is `✕` passed), and the
     E2E proved one keyboard path. `pnpm a11y:tree` reads the tree itself, and found
     two real defects on its first run — see below. The manual pass in
     [`device-pass.md`](device-pass.md) §4 is still required and still not done.
   - **Bundle size.** "Performance needs a device" was true of frame times and memory
     and quietly untrue of the one input to cold start you can weigh without hardware.
     Hermes reads the whole bundle before the first frame, so on the three-year-old
     Android this app is aimed at, megabytes are seconds. `pnpm bundle:native` now
     fails over 4.5 MB per platform. The remaining performance work is genuinely
     device-bound; this part was not.

6. ~~**CI had never actually run.**~~ Fixed, and it was the most expensive stale
   assumption in the repo. For dozens of heads both jobs "completed" in two seconds with
   `runner_id: 0`, an empty steps array and logs that 404 — no runner was ever assigned.
   The right way to judge a run is `runner_id`, a populated steps array and logs that
   DOWNLOAD; never status, and never duration alone.

   When runners returned, **every single failure was a real pre-existing bug** — none
   was environmental, which is the opposite of what was predicted:

   - `pnpm/action-setup@v4` refuses to run with both `version:` and `packageManager`.
   - Seven scripts hardcoded a Chromium path belonging to one container, so `pnpm e2e`
     exported the whole bundle and then died at launch. `executablePath` is not a hint.
   - `_content/answers.ts` was generated in memory and never written, so
     `pnpm edge:deploy` had never worked from any machine.
   - The on-disk edge function was never the deployable artefact — its import graph
     reaches `content/types.js`, which the bundle cuts with a shim. The function
     directory is now generated from `_src/`.
   - `verifyBundle` asked whether an import *looked* resolvable, never whether the file
     was being shipped. `grading` imports `MASTERY_ORDER` from a module the bundle did
     not contain; the deployed function would have failed to boot.
   - `rls.test.sql` planned 14 tests and ran 13. That file had never executed.
   - The types freshness check compared a hand-decorated file against raw generator
     output and **could never have passed**, however fresh the types were.

   The lesson is the one this file already makes twice: a guard nobody has watched fail
   is not a guard. Seven of them were decoration at once.

7. **The subscription writer.** The table, both enums, its RLS, the append-only
   notification log and the unique `notification_id` that makes a redelivered RENEWAL a
   no-op all exist and are tested. `useSubscriptionSync` closed the other half — the
   entitlement cache had a writer seam that **nothing ever called**, so every check in
   the app answered "free" from a value the server had never been asked about. Not a
   security hole (the client deciding it was Premium is the hole, and having no writer
   made that impossible) but a paying user would have seen the paywall.

   > **Built, and "needs credentials, not effort" was half right — the fifth time that
   > exact sentence has been wrong on this list.** What needed a credential was the
   > *pin value*, `APPLE_ROOT_FINGERPRINT`. The endpoint, the chain verification, the
   > nested-JWS transaction check, the payload parsing, the RPC and the composition were
   > all buildable and all testable, against a certificate chain generated in the test
   > fixtures. `store-notifications/` now exists, deploys with `--no-verify-jwt`, and
   > refuses to serve at all without the pin rather than skipping the check it configures.
   >
   > Building the wiring found two defects that testing it never would have. The
   > out-of-order guard compared against a **column that did not exist**, so it was
   > written, tested, and unable to fire. And `record` was specified as one transaction
   > and implemented as two `supabase-js` calls — the failure between them returns 200,
   > after which the unique index makes every redelivery a no-op and a paying customer
   > stays free, silently. One `record_subscription_event` RPC now, event inserted first.
   >
   > A whole directory was also never typechecked: `supabase/` had no tsconfig, and
   > Vitest's esbuild transform strips types without checking them. `pnpm typecheck:edge`
   > found four real errors on its first run, in the files that verify signatures and
   > decide who has paid.
   >
   > **Google is still 401, and that is now a decision with a second reason.** Asking
   > whether the Play branch was buildable without a credential surfaced a live defect on
   > the *Apple* side: `entitlementOf` guarded `expiresAt <= now` behind
   > `expiresAt !== null`, so a subscription with no paid-through date skipped the expiry
   > check instead of failing it and granted Premium for ever. Unreachable through Apple,
   > which always sends `expiresDate`; **guaranteed** through Google, whose notifications
   > carry a purchase token rather than a date and require the Play Developer API — the
   > very credential that is missing — to turn one into the other. So the missing
   > credential is not only the proof Google sent it; it is the only way to know when the
   > period ends. Fixed, fails closed, tested in both directions.

8. **Content depth, and why this one really is blocked.** The roadmap's v1.0 bar is all
   195 UN member states; the packs hold **65 countries and 259 facts**. Every previous
   entry on this list earned a second look and three turned out to be filing errors, so
   this one got the same treatment and came back the other way — with evidence.

   `docs/systems/content-pipeline.md` names the shortcut explicitly: `countries-list` is
   already a dependency and holds a capital and a currency for every country on earth, so
   a script could emit 400 facts in a minute. Checking what it would actually emit is
   what settles it. It answers **Pretoria** for South Africa, which has three capitals;
   **Sucre** for Bolivia with no mention of La Paz; and **Bern** for Switzerland — flatly,
   as a quiz answer. This repo already hand-authored that last one as
   `quizzable: false, sensitivity: review-required`, citing swissinfo, because the Swiss
   constitution names no capital. Bulk generation would have overwritten a carefully
   sourced fact with a cruder one, and shipped the cruder version for 130 countries
   nobody had looked at.

   Doing it properly means one named, linkable source per fact — which is what every
   fact in the packs already carries, mostly a specific Wikipedia article. **That is what
   is blocked here:** the environment's network policy denies the sources. Wikidata over
   `curl` and over `WebFetch` both return 403 at the proxy, confirmed by
   `recentRelayFailures`. So the values cannot be read, and writing them from memory
   while citing a page nobody fetched is the false citation the pipeline doc forbids by
   name.

   Not blocked, and worth doing on a machine with network: `pnpm build:flags` and
   `pnpm build:maps` already cover all 195 from `flag-icons` (MIT) and Natural Earth
   (public domain), so artwork is not on the critical path. Only capitals and currencies
   need an author.

9. **Sign-out, and why `hasUnsyncedProgress` stays a tracked gap.** It is the last name
   on the reachability list (down from three this wave) and it is *correctly* there.
   Settings already records why: export and delete "arrive with accounts", every user
   today is anonymous, and there is no sign-in route. A sign-out you cannot reverse is
   not a session control, it is an unlabelled "erase my progress" button in an app for
   ten-year-olds. The warning is built and waiting for the thing it warns about.

---

## The accessibility tree: what that audit found

Two defects, both of which every existing test passed.

**Settings toggles were announced and unusable.** `SwitchRow` put `role="switch"`,
the label and the state on a wrapper `View` — and a `View` is not pressable. The
element a reader focuses and activates did nothing; the element that worked was the
inner `<Switch>`, which had no name. So the tree carried *two* switches per row, one
named and inert, one working and anonymous.

It was meant to be hidden. The code already carried `accessibilityElementsHidden` and
`importantForAccessibility="no-hide-descendants"` — but the first is iOS-only, the
second Android-only, and **react-native-web honours neither**. Same family as the
`accessibilityState` bug this repo hit before: RN's platform a11y props silently no-op
on web, and only the ARIA ones cross over.

On native it was worse than on web. There `accessible` genuinely does collapse
children, so the working control was hidden outright — every settings toggle would
have been announced correctly and been impossible to operate with VoiceOver.

Eleven tests touched those switches. Every one read `aria-checked`; not one ever
activated a toggle, which is exactly the gap that let "announced but inert" pass.

**Four full-screen routes had no way back.** The root `Stack` sets
`headerShown: false` so the app owns its chrome, and nothing replaced the back button.
`/achievements` reported **zero interactive nodes** — a screen a keyboard or screen
reader user can enter and not leave. `/streak`, `/country/[code]` and
`/collection/[kind]` were the same: their only controls were content.

Android's hardware key and iOS's edge-swipe hid this from anyone testing by hand. On
web it is a dead end with no escape. The mockup had it right the whole time — screens
7, 10, 11 and 14 all open with a back arrow — and `common:back` ("Back", with a
translator note saying *describe the action, not the icon*) had existed unused since
week one. `ScreenHeader` is that row; the audit now fails any of those routes that
loses it.

---

## Dead strings, and why the first sweep found none

A sweep for i18n keys nothing references returned **zero** — and it was wrong. It was
counting `packages/i18n/src/keys.ts` as a reference, and that file is **generated from
the locale JSON**. Every key referenced itself, so a dead one could not be seen. The
repo already knows this failure shape — *"a committed projection is a copy that can
disagree with its source"* — and this is the same thing one step further on: a
projection used as evidence about its own source.

Excluding the generated catalogue, 55 keys have no reference. Most are not dead:

- **Achievement `name`/`desc` (23)** are built by convention —
  `achievements:${id.slice(4)}.name` — so they are never literal in source. A sweep
  that cannot see a template will always flag them.
- **`notifications:*` (4)** are written and waiting for push, which is not wired.
  Deleting copy staged for a blocked feature is not cleanup.
- The remainder — `common:close`, `settings:on`/`off`, `streak:title`, the eight
  `nav:*.soon.*` — are genuinely unused and predate this wave.

**Three were orphaned by this wave and are removed:** `home:challenge.title` and
`home:challenge.next` went with the Daily Challenge card, and `lesson:answer.label`
was the `"{answer}"` passthrough replaced by two state-bearing keys.

The rest are recorded rather than deleted. A translated string removed on a hunch is
two locales of work thrown away, and the sweep cannot yet tell "unused" from "used
through a template". Making it able to — teaching it the two conventions this repo
uses — is what would turn this paragraph into a check.

---

## Five states: what the audit found

The rule has been in `PROJECT.md` since week one and this box sat at 🟡 "not audited"
for just as long. `pnpm five-states` is that audit, in `pnpm verify` so it stays true.

It found a real, systematic gap on its first run. **`useContent()` can return
`status === 'error'` and every browse screen ignored it.** Explore, Collection, Country
and Region all destructured `status` and read only `status === 'loading'`, so a content
load that failed rendered an empty grid — indistinguishable from an empty collection,
with no explanation and no retry.

Nobody had noticed because content ships in the binary and therefore essentially never
fails. It starts failing the day packs are downloaded (architecture.md §3, week 9), on
exactly the users with the worst connections.

Fixed with `ContentGate`, a wrapper the thin routes use, rather than two more props
threaded through nine presentational screens — the tenth would have forgotten. Routes
are the layer that fetches, so error and offline belong to them; screens keep `loading`
and `empty`, which are about the shape of the data.

Two things about the script itself, because both were the check being wrong:

- **It audits the route and its screen together.** Auditing screens alone reported
  twelve of fourteen as broken when the states were simply in the other half of a
  deliberate split.
- **A stale waiver fails the build.** A waiver that the code has outgrown is a lie
  sitting in a script, and it found one immediately — the achievements screen had
  grown an empty state while its waiver still claimed it could not have one.

15 states are waived across 14 screens, each with a reason that says why the state
*cannot occur* rather than that it is unimportant. "A paused lesson always has a
question behind it" is a decision; "it does not need it" would not be.

---

## 200 % text: what is now checked, and what still is not

The Definition of Done has asked for this since the first week and nothing had ever
looked. `pnpm e2e` now doubles every rendered font size on six screens — Home, the
lesson, Explore, a collection grid, a country page and Profile — and asserts that
nothing clips and the page does not scroll sideways.

**Why doubling the CSS is the honest simulation, not a shortcut.** React Native
multiplies every `fontSize` by the OS accessibility scale before it reaches the view.
react-native-web does not — it writes the number straight into an inline style — so
there is no browser setting to turn on. Doubling every inline `font-size` and
`line-height` reproduces exactly what the native runtime does, on the real bundle, with
the real layout engine. `maxFontScale` is 2.0 in the tokens, so this tests the ceiling.

It checks three things — the three failures the a11y spec names: nothing clipped,
nothing overlapping, no sideways scroll. Getting the first two to mean what they say
took four passes, and each pass was the check being wrong rather than the app:

1. **Clipping only looked at each element's own scroll box.** Text is never cropped by
   itself — the card around it does the cropping — so the check could not see the case
   it was written for. Now it compares the layout box against the box its nearest
   `overflow: hidden` ancestor allows.
2. **That then walked the whole ancestor chain**, reached the scroll viewport, and
   reported Home, Explore and the country page as broken because each has more in it
   than one screenful. Below the fold is not clipped; it is content you scroll to.
3. **Decorative glyphs were counted as text.** The "⚑" standing in for a flag is
   deliberately cropped by its art slot. Only strings containing a letter or digit
   count as copy.
4. **The overlap check excluded the tab bar entirely** — to stop it comparing tab
   labels against whatever had scrolled behind them — which made it blind to the tab
   labels overlapping *each other*, the exact bug that motivated adding it. It now
   compares within a layer, not across.

Each of those was verified by putting the bug back and watching the check fail.

It found three bugs, all the same defect the a11y spec names — a box sized to an
English string at 100 %:

- **Every button clipped its own label.** `Button` set a fixed `height` and capped the
  label at one line. At 200 % an uppercase label is twice as wide as the box drawn for
  it, so "Practise this country" became "Practise this cou". Now `minHeight` and two
  lines.
- **Collection tiles cut country names.** Two lines held every name in English at
  100 %; "Papua New Guinea" wants three at 200 % and was rendering as "Papua New". The
  name is the tile's identity — a country you cannot read is a tile that does nothing —
  so it now has no line cap at all. That was not enough on its own: a country name is
  one unbreakable word, and a three-column grid on a 390 pt screen gives it about
  105 pt, which holds "Chile" and not "Argentina". The grid is now two columns, which
  needs no platform branch and is simply wide enough at every text size.
- **The five tab labels overlapped into a smear.** A tab is one fifth of the screen and
  its label cannot hyphenate. Fixed with `maxFontSizeMultiplier={1.2}` — **not**
  `allowFontScaling={false}`, which is the lazy version and the thing the spec forbids:
  the label still scales, it just stops. It is the only capped string in the app, and
  the cap is mirrored into the DOM as `data-max-scale` so the harness honours the same
  ceiling the native runtime does rather than testing a state that cannot occur.

**What this cannot say.** It measures layout, not experience: whether the reading order
still makes sense at that size, how it feels to use, and anything about a platform's own
scaling curve past 2.0. Those need a device. It also covers six screens, not fifteen —
the six were picked as the ones with the densest text and the tightest boxes, and the
other nine are unchecked.

---

## Analytics: what fires, and what each missing event waits on

**Firing (18):** `app_opened`, `screen_viewed`, `lesson_started`, `question_answered`,
`lesson_completed`, `lesson_abandoned`, `hearts_depleted`, `achievement_unlocked`,
`quest_completed`, `country_viewed`, `search_performed`, `offline_mode_entered`,
`setting_changed`, `error_occurred`, `onboarding_slide_viewed`,
`onboarding_goal_selected`, `onboarding_abandoned`, `taster_lesson_completed`.

The onboarding six were the last unblocked row. Two decisions worth recording:
`search_performed` sends `query_length`, never the query — a free-text field on a
child's device is the easiest place in this app to collect something personal by
accident, and the length answers every question the spec asks of it. And
`taster_lesson_completed` is driven by a `?taster=1` flag from the onboarding hand-off
rather than inferred from "the first `lesson_completed` we ever saw", which would count
every reinstall as an activation.

**Not firing, and why** — none of these is "forgotten":

| Event | Blocked on |
|---|---|
| `fact_mastered`, `fact_lapsed` | Real memory state, which is server-side. The local map is empty. |
| `streak_extended`, `streak_broken`, `level_up` | Server-owned progression (ADR 0006). |
| `signup_completed` | There are no accounts. |
| `coins_spent` | The purchase path is server-side; the client never spends. |
| `sync_conflict_resolved`, `xp_reconciliation_failed` | Need a server to disagree with. |
| `notification_opened` | Push is not wired. |
| `a11y_feature_detected` | Reads OS accessibility settings; the spec marks it aggregate-only, so it is worth doing deliberately rather than in a batch. |

One property is deliberately omitted rather than invented: `achievement_unlocked`
declares `days_to_unlock`, and nothing records when a user started. A number derived
from the earliest locally-logged lesson would read as install-to-unlock and be wrong
for every reinstall. Absent beats confidently wrong.

---

## The one that was not a gap but a defect

`track()` no-ops for child accounts — the rule its own comment calls "the rule a
developer must not be able to bypass by forgetting a UI condition". It was bypassed by
nobody wiring it at all: `setChildAccount` was exported and **never called from
anywhere**, so the flag could only ever hold its default of `false`.

Two things kept it hidden, and either alone would have been survivable:

1. The setter had no caller, so the no-op could not fire.
2. `packages/analytics/package.json` declared `"main": "./src/index.ts"` and that file
   did not exist. Metro resolved the package anyway — the events are in the shipped
   bundle — but **vitest could not**, so `lib/analytics.ts` was not importable by any
   test in the mobile package.

Nothing has leaked: `track` only console-logs until PostHog lands. The severity is
entirely in the timing — the day the transport arrived, every child account would have
emitted third-party analytics from the first frame, and it would have shipped looking
correct.

The default is now `null`, meaning *we have not asked yet*, and unknown is treated as a
child. `useOnboarding` already states the principle for that window: the safe thing to
do when we do not know who is holding the phone is nothing at all. Every claim in this repo should be read
   against it — including the haptics above, which is the one feature whose entire
   output is invisible to every test and screenshot we have.

---

## What the lesson was actually asking

Three defects, found while checking a review comment about flag rendering. They
compound, and only the first was reported.

**1. A question nobody could answer.** `tpl.flag-to-country.mc4` is modality `image`:
"Which country's flag is this?", above four country names. There is not one flag file
in this repo, and no component ever tried to draw one. `pickItemForFact` chose
uniformly among a fact's templates, so one flag question in three was a prompt about a
picture that did not exist — and a wrong answer costs a heart.

The engine now carries `promptAsset` on the *question*, and a host declares what it can
present (`modalities`). `apps/mobile` declared text only, with the reason in the
constant. Nothing was lost: `tpl.flag-describe.mc4` asks the same fact in words, which
is the sibling `accessibility.md` §8 already relies on.

> **Resolved.** That constant said to add `'image'` in the same change that landed the
> flag assets and the renderer, never before. That change has landed —
> `scripts/build-flags.cjs` rasterises all 65 flags from `flag-icons` (MIT),
> `src/components/Flag.tsx` draws them, and `PRESENTABLE` is now `['text', 'image']`.
> The picture question is back in the rotation and is asserted end to end: `pnpm e2e`
> walks a lesson until it finds one and checks the artwork actually **decoded**
> (`naturalWidth > 0`), because a broken asset reference renders a correctly-sized,
> correctly-labelled blank rectangle that every structural assertion in this repo
> passes over.
>
> The guard that had to ship with it: **nothing ever set `screenReaderOnly`**. It cost
> nothing while no image question could reach anybody, and would have become a real
> defect the moment one could — a VoiceOver user asked about a picture, losing a heart
> on a guess. `src/lib/screenReader.ts` subscribes to `AccessibilityInfo` and the
> composer swaps in the described sibling. Enabling the capability without the guard
> would have moved this defect rather than fixed it.

The asset was previously attached to every *option*, including distractors. Nothing
rendered it, so it was wrong quietly — but the template is answered by country name,
so drawing it would have printed the answer beside each one.

**2. Two thirds of the content was unreachable.** `selectItems` documents its input as
"ordered easiest-first" and takes the head of the list. `composeLesson` handed it index
insertion order — which is the order the pack files happen to be listed in the host's
import statement. Capitals were listed first, so a user with an empty memory got
capitals and only capitals; no flag or currency question could appear until all
sixty-five capitals had been seen. Every user's memory is empty on day one.

Flags and currencies were authored, sourced, translated, validated and tested. One
import statement decided the curriculum.

**3. The suite was asserting the bug.** Four E2E steps detected "are we in a lesson?"
with `/capital of|flag|money do people/i` over the English prompt copy. That regex
cannot match `lesson:prompt.currency_reverse` at all — and it never had to, because
defect 2 meant every lesson was capitals. Fixing the selection turned four green steps
red with nothing wrong in the app. They now detect a lesson structurally, by prompt
heading and answer options, which is true of any template in any pack.

The shape worth remembering: a component test renders whatever question it is handed,
and an E2E written against one subject's copy passes for as long as only that subject
appears. Neither could see that the other two thirds never arrived. `reachability.ts`
exists for exported functions nothing calls; this was the same failure one level up, in
data — **content that no code path can reach**.

**Also fixed here:** `composeLesson` was called with a hardcoded `locale: 'en'`, so a
Swedish user got Swedish chrome around English answer options, with the correct answer
sitting there as a foreign word. And the root layout applied `deviceLocale()` on every
mount, so an explicit language choice in Settings survived until the app closed and
never once survived a cold start.
