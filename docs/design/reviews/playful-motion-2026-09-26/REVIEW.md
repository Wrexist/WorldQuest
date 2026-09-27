# Artwork and motion review — 26 September 2026

[Open the visual review](index.html) · [All assets](../../assets/playful/index.html)

## What changed

All 75 typed illustrations now resolve to one original vector family, including
the previously unchanged avatars, medals, rank insignia and streak rewards.
Seven registered body layers make Atlas articulate his arms, head and eyes.
Welcome, thinking, resting, encouragement and celebration use distinct timelines.
The five navigation icons use matching illustrated props. Rewards reveal once;
motion never blocks progression or loops indefinitely.

The app's persisted Reduce Motion switch now reaches the shared design-system
hook. It combines with the OS setting, restores before the first screen mounts,
and can stop an animation already running. On web, live OS preference changes are
observed through the media query because React Native Web does not emit the
native accessibility event.

## Evidence

- Final `pnpm verify`: passed, including TypeScript, all test suites, content,
  translations, contrast, accessibility lint, reachability and economy checks.
- All 108 end-to-end steps passed, including lessons, progression and 200% text.
- The mobile suite passed 900 tests, including eight new checks for the complete
  character layers and the preference wiring. Package/edge/harness total: 1,911.
- Six routes were measured at 320, 390 and 768 pixels: no horizontal overflow,
  undersized measured targets or unlabelled controls. Screens were also opened
  and reviewed, as were the full asset family and video frame sequence.
- `motion-report.json` records actual DOM transforms from the Expo web bundle:
  movement across multiple wave angles, a stable resting pose, persisted in-app
  reduction, OS reduction from first appearance, live enable and live stop.
- `atlas-in-app.webm` is a recording of the real app, not a rendered mockup.
- All 92 WebP derivatives have size and SHA-256 records. Combined size: 1,126,452
  bytes. Every derivative is below 120 KB. SVG sources remain editable.
- `git diff --check` and the corrected accessibility lint passed.

## Native release boundary

iOS and Android both compile. Their Hermes bundles are each 4.83 MiB, still above
the repository's 4.6 MiB budget by 0.23 MiB. This gate remains failed; it was not
weakened. Bundled assets dropped from the previous pass's 10.06 MiB to 5.70 MiB
on iOS and 5.69 MiB on Android. Assets and executable code are separate budgets.

No native device performance, VoiceOver or TalkBack result is claimed. The code
uses React Native's native animation driver, but browser motion and compilation
cannot establish a phone's rendering or frame rate. The previous 3D sources are
preserved; this revision uses the lightweight vector-derived artwork in the app.

Work remains local on `feat/playful-world-redesign`; nothing has been pushed or
deployed.
