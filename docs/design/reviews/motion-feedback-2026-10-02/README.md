# Motion feedback review — 2026-10-02

The user asked for more playful motion after approving the explorer chest. The audit covered lessons, navigation/course, Explore, quests, rewards and shops. This pass serves Emma's need for clear tap feedback and Priya's need for calm, immediate navigation. It changes existing interactions and introduces no route, content, reward or purchase behavior.

## Implemented

| Surface | Previous behavior | New motion |
|---|---|---|
| Multiple-choice and matching answers (`AnswerOption`) | Press opacity only | Face compresses 2% on press, then releases. Outer target and surrounding layout stay fixed. Graded/disabled answers do not start press motion. |
| Five-tab navigation (`TabBar`) | Selected chip changed instantly | Newly selected icon briefly pops and settles; labels and chip geometry stay fixed. Navigation dispatches immediately. |
| Shared progress bars (`ProgressBar`) | Fill width jumped to the next value | Native scale eases from logical start; numbers and accessible values update immediately. Initial/restored progress stays at its real value rather than filling from zero. |
| Daily quest treasure checkpoints | Number switched directly to check | Only a newly completed checkpoint stamps into place. Out-of-order completion, restored progress and resets remain truthful. |

All use existing assets, tokens and native transforms. No new runtime package, idle loop, sound or haptic was added. Reduced motion keeps static feedback. Shared target/celebration hooks now cancel stale work, avoid rerender/preference-change replays and settle on backgrounding. The existing celebration spring was replaced by a bounded pair of quick timings, so its finish does not depend on a long underdamped tail. Answer presses also clear on blur, backgrounding and when becoming inert.

The progress tests exposed that React Native Web ignored the old `accessibilityValue` object. Explicit ARIA min/max/current now report real progress on both platforms, alongside the existing localized value text.

## Other opportunities found

The next useful candidates are a small reveal for a selected country’s fact card, an arrival for course inspection cards, and a positive checkmark for typed answers. They are not part of this pass. Question handoffs could also benefit from a brief settle, but should preserve the persistent globe and keep answers available immediately.

Existing Atlas reactions, chest reveals, answer feedback sheets, summary count-up, reward chips, grid entrances, course scenery and globe/pin motion already cover their jobs. The audit did not add another effect to those moments.

## Verification

Focused interaction tests cover immediate actions during unfinished animations, fixed press targets, disabled answers, retargeting, background cleanup, initial/restored state, out-of-order quest completion and reduced motion.

- [Motion preview](fixtures/motion-feedback.webm): 7.64 seconds showing the real components with explicitly labeled local test values, not a seeded user account.
- [Fixture report](fixtures/report.json) and [method](fixtures/README.md): six normal/reduced layouts at 320/390/768 plus four picture/matching cases at 320. Recorded transforms confirm all four motions play and settle; reduced-motion cases stay static; targets remain fixed and ARIA updates immediately. No horizontal overflow or runtime errors.
- A 320px/200% Swedish matching case exposed an existing long-word clipping problem in both the before and after implementations. `minWidth: 0` on the label allows its text to wrap. The final matching screenshots and 16 focused answer/matching tests pass after that correction.
- [Real route measurements](routes/report.json): Lesson introduction, Quests, Explore and Profile at 320/390/430/768. Sixteen screenshots passed target, label and overflow measurements; representative pixels were inspected. The browser journey also captured actual lesson questions and answer feedback.
- `pnpm verify` passed, including 1,152 mobile tests in 129 files under coverage, all package/edge tests and repository gates. The subsequent one-line label wrapping fix was verified with the 16 focused tests and final browser fixtures.
- Full browser E2E: 107/107 reported steps, including one explicitly skipped image-question branch (106 executed checks). No uncaught errors. Immutable export `wq-motion-feedback-web-v1` was used for that run; final export `wq-motion-feedback-web-v2` also succeeds and includes the label wrapping fix.
- Final native builds pass the unchanged 5.2 MiB gate: iOS 5,451,500 bytes (5.198956 MiB), Android 5,449,950 bytes (5.197477 MiB). The iOS increase over the chest integration is 2,517 bytes, with no added runtime assets. Remaining bytecode headroom is small: 1,095 bytes on iOS and 2,645 on Android.

Verdict: browser interaction and visual checks pass. No remaining visual blocker was found in the reviewed cases. Device validation remains outside this evidence.

No part of this was seen on a phone. Browser playback and Hermes compilation do not establish native haptic feel, VoiceOver/TalkBack behavior or frame timing on a mid-tier Android device.
