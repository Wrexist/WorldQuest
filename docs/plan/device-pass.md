# The device pass

Everything in this repo that can be verified without a phone has been. This is what is
left, written so it can be done in one sitting by someone who has one.

Four Definition of Done boxes close here and nowhere else. Nothing in this document is
optional — each item exists because something in the automated suite genuinely cannot
see it.

---

## Before you start

**There are two ways to get this app onto a phone, and they are not the same route.**
Worth being explicit, because the checklist below does not care which one you take and
the prerequisites differ sharply.

**`preview` — internal distribution.** The commands below. An `.apk` you sideload and
an `.ipa` installed from a link. No store, no review, no App Store distribution
certificate; iOS internal distribution signs ad hoc, which means every test device's
UDID has to be registered with Apple first. This is the shortest path to walking this
checklist and it is what the four Definition of Done boxes need.

**`production` — TestFlight.** A store build, and a different set of prerequisites:
distribution certificate, App Store provisioning profile, build numbering that survives
CI. Those are in [`testflight-readiness.md`](testflight-readiness.md), ordered so the
cheap checks come before the expensive runner. TestFlight is a perfectly good way to run
this checklist on an iPhone — but it is the longer road, and none of it is required for
`preview`.

Either way, this document starts once the app is on the device.

```bash
npx eas login
npx eas build --profile preview --platform android   # .apk, sideload it
npx eas build --profile preview --platform ios       # internal distribution
```

`eas.json` is written from the documented schema and **has never been run to
completion** — this environment has no authenticated Expo account. Treat the first
build as part of the task, not as setup that will obviously work. The first real
attempt (2026-08-09, the TestFlight workflow) died on the config before compiling
anything; what the profiles are for, and why the file carries no comments, is in
[`docs/engineering/eas-build-profiles.md`](../engineering/eas-build-profiles.md).

If you only have one device, do Android. It is the platform with the wider hardware
spread, the worse average performance, and the accessibility service that behaves least
like the web.

---

## 1 · It runs at all

- [ ] Cold start from the icon. Something is on screen inside two seconds.
- [ ] The splash is the app's own, not a white or black rectangle, and it goes away.
- [ ] Onboarding → age gate → goal → taster lesson, without a crash.
- [ ] Answer a question. The option sinks under your thumb.
- [ ] Force-quit mid-lesson, reopen. Nothing is lost and nothing is duplicated.

> Web-only bundling hid the fact that this app had never been built for native at all
> until `pnpm bundle:native` was added. Both platforms compile now. Compiling is not
> running.

## 2 · Type and layout, which is where Chromium lied

Every layout claim in this repo is a claim about Chromium at 320/390/768. Real devices
differ in font rasterisation, safe areas, and how the keyboard resizes the view.

- [ ] Nunito is actually rendering — headings are round and heavy, not the system font.
      If the system font appears, `useAppFonts` failed silently.
- [ ] The notch and the home indicator do not cover anything.
- [ ] Open the keyboard on the collection search. The grid is still usable.
- [ ] Rotate to landscape. Nothing overlaps.
- [ ] **On a tablet.** `supportsTablet` was `false` in `app.json` until this pass was
      written, while the design system defines an `lg ≥ 600` breakpoint and a two-column
      Explore. It is `true` now and **has never been seen** — expect this one to have
      problems.

## 3 · Text at 200 %

`pnpm e2e` measures this on six screens by doubling the CSS, which reproduces what the
native runtime does. It does not reproduce how it feels.

- [ ] OS text size to maximum. Walk Home, a lesson, Explore, a collection, a country.
- [ ] Nothing clipped, nothing overlapping, no sideways scroll.
- [ ] The tab labels stop growing at ~1.2× — that cap is deliberate
      (`TAB_LABEL_MAX_SCALE`), and it is the only capped string in the app.
- [ ] It is still *pleasant*, not merely legible. This is the part no script can score.

## 4 · Screen reader — the box the automation cannot touch

Turn on VoiceOver (iOS) or TalkBack (Android), then **turn the screen brightness to
zero**. The a11y skill is explicit that this is the part that matters.

- [ ] Complete a lesson end to end. If you cannot, it is a bug at the same priority as
      a crash.
- [ ] Every control announces its *purpose*, not its icon. "Back", not "chevron".
- [ ] Focus order matches reading order.
- [ ] The answer feedback is announced — a correct/wrong state a blind user has to go
      hunting for is not feedback.
- [ ] Confetti and decorative glyphs are silent — including the flags on the
      collection grid and the country page, which are illustration and should say
      nothing (the tile's own label already reads the country and its description).
- [ ] **Turn the reader on, then start a lesson.** No question should show a flag and
      ask which country it is; every flag question should describe the flag in words
      instead. That swap is `useScreenReader` → `screenReaderOnly`, and it is the guard
      that made it safe to enable picture questions at all. If a picture question
      appears, it is a heart lost on a question that cannot be answered by ear.
- [ ] The tab bar is reachable and operable.

> Keyboard operability is already asserted in `pnpm e2e`: an answer can be reached with
> Tab and scored with Enter. That rules out the mechanical failure — the one that once
> shipped the tab bar inert on web and unreachable by reader on every platform. It says
> nothing about whether any of it is comprehensible when heard.
>
> `pnpm a11y:tree` now goes further and reads Chromium's computed accessibility tree —
> every control's real accessible name and role, across ten routes. It found two things
> this checklist would otherwise have found the hard way: **settings toggles that
> announced correctly and could not be operated at all**, and four full-screen routes
> with no back control. Both are fixed and both are now guarded.
>
> Chromium is not VoiceOver and is not TalkBack — they differ in flattening, grouping
> and what they announce on focus — so every box above still needs ticking. It does
> mean this section should now be about whether the app makes *sense* when heard,
> rather than about finding unlabelled buttons.

## 5 · Feel — invisible to every screenshot

- [ ] Haptics fire on correct and wrong. **Wrong must be one soft bump**, never two
      sharp knocks. If it feels like a failed payment, `haptics.ts` has regressed.
- [ ] Turn haptics off in Settings. They stop.
- [ ] Turn sound on in Settings — it is **off by default**, deliberately — and answer a
      question. Wrong is a gentle falling note, not a buzzer.
- [ ] Flick the hardware silent switch. Sound stops. (`playsInSilentModeIOS: false`.)
- [ ] Start a podcast, then a lesson. The podcast ducks; it does not stop.
- [ ] Turn on Reduce Motion. Buttons still respond — the face still moves, instantly.
      *Less movement, not less feedback.* If a press stops giving anything back,
      `useTiming` has been bypassed.

## 6 · Performance, on the worst phone you can find

Not a flagship. The budget is about a mid-tier Android — a device three or four years
old, which is what a ten-year-old is most likely to be handed.

One input to this is already measured. `pnpm bundle:native` fails if the Hermes bundle
passes **4.3 MB** per platform; the measurement on 2026-08-11 was **4.26 MB** for both
iOS and Android, plus **9.70 MB across 345 assets** (5.34 MB webp, 2.33 MB png, 2.09 MB
fonts, 0.17 MB sounds) shipped beside the bundle. Hermes reads every byte of the
*bundle* before the first frame; the assets load on demand and are download weight
rather than startup work. If cold start comes in over 3 s below, bundle size is the one
cause you can rule out on the way in.

Two notes on those numbers, both of which cost something to rediscover. **0.04 MB of
headroom is not headroom** — the next dependency is the one that fails the gate.
And this paragraph read "6.0 MB budget, 5.75 MB today" until 2026-08-11, which was the
pre-Sentry-removal measurement against the pre-Sentry-removal gate: two figures, both
stale, sitting in a checklist that reads as current. Re-measure rather than copy, here
and in [`testflight-readiness.md`](testflight-readiness.md), which now carries the same
dated figure.

- [ ] Cold start under 3 s.
- [ ] Scroll the 65-tile collection. No visible jank. **This is a real test now** —
      it was 65 placeholder glyphs until the flags landed, and it is 65 decoded
      600×450 PNGs today. If anything in this section janks, start here.
- [ ] Answer ten questions quickly. No lag between tap and feedback.
- [ ] Watch memory across a full lesson. It should not climb monotonically.
- [ ] The lesson works in aeroplane mode — content ships in the binary — and the queue
      drains when you turn it back on.

## 7 · Sentry — **removed 2026-08-09, this section is paused**

`@sentry/react-native` was removed to hold the 4 MiB bundle budget rather than raise it
(see `apps/mobile/src/lib/reporting.ts` and `docs/plan/cowork-handoff.md` §6). There is
no transport to round-trip today — skip this section until a transport is re-added,
which needs both a real Sentry account and a fresh look at the budget with real
numbers. The rest of this document is unaffected.

The only remaining box that is not about the device.

**The transport is built.** `@sentry/react-native` is installed, `src/lib/reporting.ts`
wires it, `ErrorBoundary` reports through it, and it initialises at module scope in the
root layout so a crash in the first render is caught. It is a no-op until
`EXPO_PUBLIC_SENTRY_DSN` is set — there is no half-configured state. Both native
platforms bundle with it.

What is left is the round trip, which needs an account:

- [ ] Put a real DSN in `EXPO_PUBLIC_SENTRY_DSN` and rebuild.
- [ ] Force a render crash and confirm it arrives.
- [ ] Confirm the payload carries **no message text**. This is now enforced by the
      *type*: `CrashReport` has no field that can hold free text, so a call site cannot
      leak a message even by accident, and `beforeSend` strips `message`, breadcrumbs,
      `user`, `request`, `contexts` and `extra` from anything the SDK captures on its
      own. Verify it on the wire anyway — the whole point is that this is the one place
      where being wrong is a child's typed text leaving the device.
- [ ] Check what it cost. The SDK added **1.92 MB** to the bundle (3.80 → 5.72). If
      cold start misses 3 s above, this is the first thing to weigh — it is by far the
      largest single contributor, and unlike the fonts and flags it is parsed before
      the first frame.

---

## Reporting

Update [`definition-of-done-status.md`](definition-of-done-status.md) with what you
found — including what still is not right. That file's whole purpose is that it has
never once claimed something was done when it was not, and the value of that is entirely
in it staying true.
