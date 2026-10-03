# Final exported-app review

`scripts/review-compact-app.cjs` ran against the immutable `node_modules/.cache/wq-compact-app-web-v2` export. The [report](report.json) records 22 passing cases, no uncaught browser errors, no measured sideways page overflow, and no measured controls below 44 px.

The walkthrough covers Quests, fresh Profile, and Shop at 320 × 568, 390 × 844, and 768 × 1024, followed by the same routes in Swedish, dark mode, reduced motion, and doubled glyph sizes. This glyph stress pass does not activate native `fontScale` branches; the [separate fixture](../native-layout-final/README.md) checks those explicitly.

## Outcomes

- Quests' Continue action is fully visible above navigation before and after scrolling at all three widths and both text configurations. At 320 default text its button spans y415–471. The scroller contains the longer content; the chest can be partly below the footer on the shortest viewport.
- The chest is 230 px tall at default text, down from the baseline's approximately 290 px at 390. Nudging it changes neither task text nor aggregate progress. Achievements navigation works.
- Fresh Profile's Start a lesson action is visible at 320. Starting it and completing the lesson through actual visible UI controls produces a real summary. The post-lesson chain is followed, including its chest, and Profile then shows the populated passport at all three widths. No account state is seeded.
- Shop's wallet and next unlock occupy one 212 px panel at default text. The freeze row opens Streak. Returning leaves the unlock unchanged, the free level title is worn, and unaffordable purchase controls remain disabled. No purchase is made.

## Screenshots

| Screen | 320 | 390 | 768 |
| --- | --- | --- | --- |
| Quests | [Image](quests-320.png) | [Image](quests-390.png) | [Image](quests-768.png) |
| Profile, first visit | [Image](profile-320.png) | [Image](profile-390.png) | [Image](profile-768.png) |
| Profile, after actual lesson | [Image](profile-after-lesson-populated-320.png) | [Image](profile-after-lesson-populated-390.png) | [Image](profile-after-lesson-populated-768.png) |
| Shop | [Image](shop-320.png) | [Image](shop-390.png) | [Image](shop-768.png) |

The final 320/390 populated Profile and 320 Swedish enlarged-text screenshots were opened for visual inspection, in addition to the first implementation's complete default matrix. The separate native-font-scale review includes full component captures to expose overlaps outside the initial viewport. No remaining blocker was found within this scope.

This is the real Expo export in Chromium. Native font rasterization, gestures, haptics, VoiceOver/TalkBack behavior, and frame rate still need device validation. No part of this was seen on a phone.
