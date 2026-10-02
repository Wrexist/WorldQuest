# Premium motion review — October 1, 2026

The owner requested the structure and motion of [Breeje Anadkat’s reference](https://x.com/BreejeAnadkat/status/2105606842076508463/video/1), adapted to WorldQuest. The served component is `PaywallScreen`; the local sample-product preview is `node scripts/paywall-preview/serve.cjs` at http://localhost:4196.

## Reference observations

Inspected the 10.62-second source clip, including 32 frames sampled at 3 fps. Its first ~1.3 seconds reveal the mascot, headline, trial explanation, paired plans and CTA in sequence. The mascot gestures and blinks; timeline emphasis advances through three steps; plan selection moves the radio/border and updates the billing copy. The split phones and camera zooms are edits in the demonstration, not in-app transitions.

## Adaptation

- Single page, with Atlas in a sky scene, two-line headline and no-charge badge, trial timeline, benefit grid, monthly/yearly cards, savings badge and bottom CTA.
- Uses the current ice-blue/navy/lime theme, matching dark palette and Nunito. The former blanket mascot exclusion has an owner-requested exception in the voice guide.
- Native-driver spring reveals staggered by the 180 ms quick token; shared 180 stiffness / 0.7 damping-ratio spring for selection. The final CTA appears after 720 ms and settles after the other content.
- Timeline emphasis advances over two 2.1-second segments after a 900 ms hold. All text is readable throughout. Billing text re-enters when the plan changes.
- Atlas uses the existing rendered welcome performance, with its existing reduced-motion and background behavior. No new mascot assets were generated or modified.
- Motion timing is reconstructed from video, not extracted source easing. The source’s soft-focus reveal is represented by opacity/scale/translation; there is no native blur effect. Phone-camera edits are not part of the app.
- Reduced motion renders all content at its final position with a static Atlas. Small screens stack plans; an oversized footer joins the scroll content. The exit is available immediately.

## Product integrity

Serves Marcus (the parent/payer) and Alex (the engaged explorer). Route remains `/paywall`, dismissed back to its caller. Onboarding can show its practice recap on the same page. Children see only the parental gate.

Sample prices are review fixtures, not a live offering. Runtime billing remains unavailable and production entry points remain hidden. Trial days and prices come from the selected product; a one-product store works. No reminder-delivery promise was copied, because that integration is not established. Legal links render only when configured. Purchase/restore failures remain recoverable; repeat submission and plan changes are blocked during checkout.

## Evidence

- [Motion recording](paywall-motion.mp4): real React Native Web component, entrance, timeline and monthly/yearly transitions; sampled browser recording, not a frame-rate benchmark.
- [Light, 390](paywall-light-390.jpg), [dark, 390](paywall-dark-390.jpg), [tablet, 768](paywall-tablet-768.jpg).
- [Swedish, 320](paywall-sv-320-reduced.jpg), [stacked plans](paywall-sv-320-plans.jpg).
- [Swedish at 200% text](paywall-sv-320-text2x.jpg), [reachable enlarged checkout](paywall-sv-320-text2x-footer.jpg).
- Loading, unavailable, store error, offline, child and no-trial screenshots are saved alongside these files.
- Browser inspection found no horizontal overflow at 320/390/768. Inspected buttons are at least 48 pt high; plan cards expose radio selection. Reduced-motion reveals had opacity 1 and identity transforms; Atlas used its static image.
- Mobile typecheck and all 33 paywall tests pass, including variable trial duration, one-product stores, checkout locking, adapter exceptions and zero-day trial rejection.
- Full verification passed the test suites (including 1,114 mobile tests), localization and contrast, then caught a centered child ScrollView. That issue was fixed with Spacer; the scroll check and all remaining verification commands subsequently passed.

Native iOS/Android rendering, device frame rate, haptics, VoiceOver/TalkBack and real store purchase acceptance are not verified. No part of this was seen on a phone.

Exported app route screenshots also pass the design harness at 320, 390, 430 and 768 points (no measurable overflow, target or label findings). Runtime unavailable-state screenshots at 320, 390 and 768 were visually inspected.

Final browser flow: 107/107 steps passed, with one unrelated image-question check skipped because that generated lesson had no image question. Paywall checks passed for rendering, free-learning copy, immediate dismissal, store-unavailable behavior and 200% text (0 px overflow). No uncaught errors were reported. The first concurrent run was discarded after a shared export-folder race; this successful run used the completed export.
