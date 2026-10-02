# Question transitions and country-card reveals — 2026-10-02

The user approved these two additions after the interaction-motion audit. They serve Emma and Leo during lessons and Alex while discovering countries in Explore. Check and Open country remain the primary actions; no route, fact, reward, sound or dependency was added.

## Motion

- A new lesson question brings its prompt, flag art and answer block into place together over `motion.quick` (180 ms). Matching boards use the same arrival. The content moves up `space[2]` and settles from 98% scale.
- A newly selected Explore country reveals its fact card with the same motion. Selecting the same country or refreshing its data does not replay it.
- The shared `SceneEntrance.replayKey` follows content identity without React keys or remounting. Answer selection, grading, focus return and motion-preference changes do not replay an old event. Navigation blur, backgrounding, unmount and reduced motion settle immediately.
- Controls are available from the first frame. The lesson scroller and globe stay outside the moving blocks, preserving scroll measurements and the renderer's lifetime. Country card controls and their keyboard focus survive country changes.

The large-text review also found an existing problem in the country card: long Swedish names were squeezed between the flag and Close. The responsive layout gives the metadata its own full-width row on narrow screens and at larger font scales.

## Evidence

The [browser evidence](browser/README.md) records the actual exported app after normal onboarding, including an [MP4 motion preview](browser/refined/question-country-motion.mp4). Component tests hold arrivals unfinished to exercise immediate interaction, stable identities, cancellation and reduced motion.

- `pnpm verify` passed: 1,158 mobile tests in 130 files, package/edge tests and all repository gates. This run preceded the small responsive-card correction; that correction passed the 14 focused Explore tests and final mobile typecheck.
- Final native builds pass the unchanged 5.2 MiB limit: iOS 5,452,331 bytes (5.199748 MiB), Android 5,450,726 bytes (5.198217 MiB). No runtime assets were added. Remaining headroom is only 264 bytes on iOS and 1,869 on Android.
- The initial browser journey exposed a pre-existing chest-test synchronization race. It waited 2,000 ms for a 1,950 ms film that starts after image decode. The test now waits for the visible gem receipt, with a bounded timeout; product timing and rewards are unchanged.
- The final browser journey against immutable export `wq-question-country-web-v2` passed: 107/107 reported steps (106 executed checks and one explicitly skipped image-question branch), including the chest receipt, lessons, pause/resume and 200% text. No uncaught errors.

Verdict: the reviewed motion and corrected card layouts pass browser interaction and visual checks. Representative 320/390/768 screenshots, large-text layouts and preview frames were inspected. The deliberate horizontal region scroller is not page overflow; the browser evidence separately records an existing long region-list label that overflows when glyphs alone are doubled.

Native builds prove compilation and bundle size only. No part of this was seen on a phone; native frame timing, haptics, VoiceOver and TalkBack still need device validation.
