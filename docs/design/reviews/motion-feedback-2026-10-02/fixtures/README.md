# Motion feedback fixtures

[Watch the 7.64-second preview](motion-feedback.webm). The video renders the real components with labeled local presentation values. It does not seed an account, write progress or award rewards.

`report.json` records six combinations of 320, 390 and 768 px: English/light/full motion and Swedish/dark/reduced motion with 200% text. Accessible fixtures supply native `fontScale = 2` and double measured glyph sizes, respecting the production tab label cap. The tab bar spans the viewport, as it does in the app.

Verified in Chromium through React Native Web:

- A newly selected tab icon scales briefly and settles; selection is immediate.
- A held answer compresses to 0.98 and releases to 1. The touch target bounds stay fixed. Reduced motion keeps scale 1 and retains opacity feedback.
- Progress visibly fills from 2/10 to 7/10. Its accessible value updates immediately; reduced motion jumps to the final fill.
- A newly completed quest checkpoint pops and settles. Its checkmark and accessible progress appear immediately. Reduced motion remains still.
- No horizontal text or page overflow in the six combinations, or in narrow picture-answer and matching-board checks at default and 200% text.
- No browser page errors.

The additional matching-board check exposed an existing long-word overflow at 320 px and 200% text, reproduced using the pre-motion AnswerOption source. Adding `minWidth: 0` to its flex text allowed complete names to wrap and cards to grow. `../baseline/` preserves the comparison; final screenshots here include the fix.

Inspected normal 390 px, Swedish/dark/200% 320 px, picture-answer and matching-board screenshots, plus video frames. Native frame pacing and physical-device text rendering are not established by these browser checks.

Capture harness: `node_modules/.cache/capture-motion-feedback.cjs`; fixture source: `node_modules/.cache/motion-feedback-fixture.tsx`.
