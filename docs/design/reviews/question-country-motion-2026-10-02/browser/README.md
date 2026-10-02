# Browser motion evidence

The [final MP4 preview](refined/question-country-motion.mp4) is the real exported app at 390×844, 25 fps, 9.48 seconds. It shows a lesson answer and question handoff, then a selected country card changing from Sweden to Spain. The country card is brought into view before the switch. Normal 320/390/768 screenshots, the final enlarged Swedish card, the fixture screenshots and sampled video frames were inspected manually.

The original WebM was converted to H.264 baseline/yuv420p MP4 with fast-start metadata after the chat preview reported it unavailable. The MP4 decodes without errors and was verified playing in Chrome (9.48 seconds, readyState 4, no media error). The [local player](refined/preview.html) supplies playback controls and an MP4 download link.

## Method and results

The harness drives onboarding through the real controls. It uses the shipped content packs and router; it never inserts account, lesson or reward state. The video context copies browser storage only after that actual onboarding journey. Hardware input, screen readers and GPU timing are outside this evidence.

- [Initial report](report.json): 15 interaction cases on immutable `wq-question-country-web-v1`. Question prompts/options move during a handoff at 320/390/768 and settle; selection does not replay the arrival. Reduced-motion cases stay still. The existing lesson scroller remains mounted.
- [Final report](refined/report.json): 10 interaction cases, eight country layout measurements on immutable `wq-question-country-web-v2`, including the responsive card correction. Selected country changes retain the card, Open control, keyboard focus and Explore canvas. The Open label follows the new country and Enter opens its correct route. There are no uncaught page errors.
- The real lesson canvas remains mounted through selection and grading in the video journey. `globeRetained: null` for its subsequent handoff means the next question legitimately has no map. It is **not** evidence of a canvas surviving two map-eligible questions. That invariant is covered by the component tests; this browser run makes no native GL claim.
- Country cards have no measured text or page-width overflow. The report separately retains raw text rectangles beyond the viewport: these include the intentionally horizontal region chips and a long country-list label in the enlarged Swedish case. They are not reported as zero whole-page text overflow.
- [Before correction](baseline-country-large-text-reduced-320.png) showed enlarged Swedish metadata squeezed into a narrow column. The [corrected card](refined/country-large-text-reduced-320.png) gives that metadata the full width. Its long country name wraps and the card remains scrollable. The original baseline also enlarged tab labels beyond their native cap; the final harness respects every `data-max-scale` cap.

Browser glyph enlargement cannot change React Native Web's fixed `fontScale=1`. The separate [layout fixture report](native-layout-fixture/report.json) therefore checks the native `fontScale=2` branch at 320/390/768 with doubled glyphs and reduced motion. It renders the actual `ExploreAtlas`, uses real pack names, and explicitly replaces the globe with a labeled placeholder. This fixture stores no account data and does not prove GL behavior. All three cases fit horizontally and Open responds. At 320 the standard two-line button limit truncates the long visible country suffix; the full country remains in the heading and accessibility label.

## Reproduce

From the repository root, use an immutable Expo web export made with `EXPO_PUBLIC_ATLAS_GLOBE=1`. The reviewed exports use that feature flag; this does not change native rollout defaults.

```powershell
node scripts/review-question-country-motion.cjs node_modules/.cache/wq-question-country-web-v1
node scripts/review-question-country-motion.cjs node_modules/.cache/wq-question-country-web-v2 --country-only --refresh-video
node scripts/review-country-card-layout.cjs
```

The browser script's `--country-only --refresh-video` option rechecks the card correction, one additional lesson journey and the final video without repeating all six existing lesson cases. `--finish-only` resumes the supplementary cases while retaining the completed report. The fixture script builds a temporary esbuild bundle beneath `node_modules/.cache`; both scripts preserve their proof under this folder.

No part of this was seen on a phone. Chromium playback and mocked native font scale do not establish native frame timing, keyboard behavior, haptics, VoiceOver or TalkBack behavior.
