# Vivid phone polish

This pass responds to physical iPhone screenshots showing a pale interface, a white
mascot, a fourth answer below the fold, and a full-screen lesson behind the Dynamic Island.

- Shared sky canvas, saturated blue navigation, green raised actions, and colorful
  journey panels across tabs and detail screens. Nunito restores rounded typography.
- The original globe-and-pin launcher icon stays independent of the in-app theme.
- Lessons use an opaque native modal surface and their own safe-area container.
- Phone question layouts reserve more room for the four answers by reducing artwork
  and spacing before reducing any touch targets. Large text remains scrollable.
- Country maps use blue water and distinct land/highlight colors, with unchanged
  geographic masks from the content pack.
- Mascot animation layers are bundled as lossless PNGs for predictable native decoding.
- Onboarding uses a blue welcome panel, colorful continent tiles, and blue speech bubbles.

Validation evidence is recorded after the rendered review. Browser screenshots cannot
prove the native modal inset behavior or the original iPhone image-decoding issue;
both require rechecking the installed development/TestFlight build.

## Rendered review and checks

[Open the screenshot gallery](assets/vivid-phone-polish/index.html).

- Reviewed 20 routes at 320, 390, and 768 points, plus 111 flow screenshots.
- Added `scripts/review-phone-layout.cjs`: all nine map/capital/flag layouts pass
  at 390x759 (safe-area allowance), 375x667, and 320x568. Answer targets remain 58pt.
- The Shop review found 42pt buttons; the shared button now guarantees a 44pt
  socket. A fresh Shop review passes at all three widths.
- 976 mobile tests (112 files, coverage gates passed), 43 design tests, 114 contrast pairs, mobile TypeScript, source accessibility,
  scrollability, screen-state checks, and project inventory pass.
- All 109 end-to-end steps pass, including progression, rewards, offline recovery,
  keyboard operation, and 200% text. No uncaught browser errors.
- Chromium accessibility names and focus order pass.
- iOS and Android Hermes bundles both compile at 4.49 MiB, below the 4.6 MiB limit.

These changes are source changes, not a new TestFlight installation. Recheck the
welcome mascot and lesson safe areas on the iPhone after installing a build from
this branch. Large accessibility text deliberately retains scrolling.
