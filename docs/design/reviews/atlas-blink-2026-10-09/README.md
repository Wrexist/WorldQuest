# Atlas blinks — evidence, 2026-10-09

- `open-and-blink.png` — the three open-eyed clay poses beside their generated blink
  frames (`scripts/build-clay-mascot.cjs`), on the dark canvas.
- `in-app-side-by-side.png` — the exported web app's first-launch Atlas at 390 × 844,
  open and caught on a shut frame.
- `in-app-report.json` — the blink frame's opacity sampled every animation frame for
  20 s in the same page: 1,201 frames, 5 blinks at the token's rhythm (gaps of
  4.9, 2.7, 0.27 and 5.3 s: each rest plus the 120 ms blink), 33 shut frames (about 7
  per blink) and **0 frames between open and shut**.

That last number is why the blink snaps. The first build faded over 45 ms, and the first
capture caught open eyes showing through closed ones; with the snap no frame shows both.

Limits: Chromium and react-native-web, where `Animated` runs on the JS driver. On a phone
the same loop runs on the native driver. **Physical iPhone check outstanding**: this is the
first idle loop on Atlas since #31 removed one for a reported stutter.
