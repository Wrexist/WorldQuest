# Atlas breathes, blinks and has new faces — evidence, 2026-10-09

- `all-faces.png` — every face the app can show, left to right: welcome, celebrate,
  thinking, resting (the four generated poses), then laughing, proud and wink, derived
  from them by `scripts/build-clay-mascot.cjs` with resting's own closed eyes and smile.
- `open-and-blink.png` — the three open-eyed poses beside their blink frames.
- `in-app-side-by-side.png` — the exported web app's first-launch Atlas at 390 × 844,
  open and caught on a shut frame.
- `in-app-report.json` — the blink frame's opacity and the breath transform, sampled
  every animation frame for 36 s (two idle cycles) in the same page:
  - **blink:** 11 blinks at the token's rhythm (each rest plus the 120 ms blink, the
    double blink 0.28 s apart), 73 shut frames (about 7 per blink) and 1 frame between
    open and shut in 36 s;
  - **breath:** 11 breaths, 3.35 s apart, up to 1.6 % taller (1.64 px on a 205 px
    Atlas), and no frame moves more than 0.03 % of his height, the loop seam included.

Two things these captures caught and fixed before shipping:

1. The first blink faded over 45 ms, and a shot caught open eyes showing through closed
   ones. The blink now snaps.
2. On the web, react-native-web's `Animated.loop` takes `useNativeDriver: true` at its
   word and the fallback plays the loop once: he breathed for 16.8 s and then stopped.
   The idle now uses the JS driver on the web only; phones keep the native loop.

Limits: Chromium and react-native-web. On a phone the loop runs on the native driver.
**Physical iPhone check outstanding**: this is the first idle on Atlas since #31 removed
one for a reported stutter.
