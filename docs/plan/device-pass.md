# The device pass

Everything in this repo that can be verified without a phone has been. This is what is
left, written so it can be done in one sitting by someone who has one.

Four Definition of Done boxes close here and nowhere else. Nothing in this document is
optional — each item exists because something in the automated suite genuinely cannot
see it.

---

## Before you start

```bash
npx eas login
npx eas build --profile preview --platform android   # .apk, sideload it
npx eas build --profile preview --platform ios       # internal distribution
```

`eas.json` is written from the documented schema and **has never been run** — this
environment has no authenticated Expo account. Treat the first build as part of the
task, not as setup that will obviously work.

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
- [ ] Confetti and decorative glyphs are silent.
- [ ] The tab bar is reachable and operable.

> Keyboard operability is already asserted in `pnpm e2e`: an answer can be reached with
> Tab and scored with Enter. That rules out the mechanical failure — the one that once
> shipped the tab bar inert on web and unreachable by reader on every platform. It says
> nothing about whether any of it is comprehensible when heard.

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

- [ ] Cold start under 3 s.
- [ ] Scroll the 65-tile collection. No visible jank.
- [ ] Answer ten questions quickly. No lag between tap and feedback.
- [ ] Watch memory across a full lesson. It should not climb monotonically.
- [ ] The lesson works in aeroplane mode — content ships in the binary — and the queue
      drains when you turn it back on.

## 7 · Sentry

The only remaining box that is not about the device.

- [ ] Put a real DSN in the environment and add the transport.
- [ ] Force a render crash and confirm it arrives.
- [ ] Confirm the payload carries **no message text** — `ErrorBoundary` deliberately
      reports `domain` and `error.name` only, because a React error string can carry a
      prop value and a prop value can carry a name a child typed. That property already
      holds; do not let the Sentry integration undo it.

---

## Reporting

Update [`definition-of-done-status.md`](definition-of-done-status.md) with what you
found — including what still is not right. That file's whole purpose is that it has
never once claimed something was done when it was not, and the value of that is entirely
in it staying true.
