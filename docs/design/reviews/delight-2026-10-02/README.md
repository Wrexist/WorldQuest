# Atlas companion and interaction polish — October 2, 2026

The discovery and progress screens now feel like an adventure with Atlas. This pass serves Emma's need for a playful companion and immediate feedback, and Leo's need to pick a country and get into practice quickly. Existing Home and lesson celebrations already provide strong character moments; their gameplay and reward rules remain unchanged.

| Screen | Change |
| --- | --- |
| Explore | Tappable Atlas guidance, tactile continent tiles, helpful search recovery |
| Region | Atlas invitation, entrance motion, raised country cards, wrapping progress metadata |
| Collections | Atlas explains collecting; clearer unearned flags; recover from empty searches; one scrollable page |
| Achievements | Atlas responds to earned progress; a first-lesson action on the normal unearned catalogue |
| Quests | Atlas responds to ready, in-progress and complete states; bounded card entrances |
| Profile | Interactive Atlas in the island scene, entrance motion, companion invitation to continue |
| Shop | Wallet entrance, tappable title mascot, confirmation only after the equipped title actually changes |
| Streak | Short flame gesture and reassuring companion dialogue |

`AtlasCompanion` pairs a localized sentence with the existing 3D mascot. Tapping Atlas produces a giggle and selection haptic, respecting the haptics setting. `SceneEntrance` uses native-driver translation and scale for one short arrival; it cancels on navigation blur, backgrounding, unmount and reduced-motion changes. Content remains visible and interactive throughout. Large native text stacks the bubble beneath Atlas on phones. Reduced motion shows a static reaction rather than removing feedback.

The scenery background remains decorative; an explicit `interactiveChildren` option keeps foreground mascot controls accessible. New English and Swedish copy uses the existing translation catalogue. No dependencies, artwork, progression rules or economy values were added.

## Evidence

- [Default screenshots and measurements](default/report.json): eight routes at 320×568, 390×844, 430×932 and 768×1024.
- [Accessibility screenshots and measurements](accessible/report.json): the same routes in Swedish, dark mode, reduced motion, and browser text enlarged to 200%.
- [Collection example](default/collection-flags@390.png), [Explore example](default/explore@390.png), [Achievements example](default/achievements@320.png).
- [Interactive browser checks](interaction-report.json): mascot reactions, search recovery, action reachability, sprite playback and live reduced-motion switching at 375×667 and 844×390.
- Before captures remain in `node_modules/.cache/wq-delight-before` for local comparison.

## Validation

- `pnpm verify` passed, including all 1,128 mobile tests in 126 files, workspace typechecks, content/localization validation, contrast and accessibility checks.
- The real-bundle E2E run passed: 107 reported steps, with one image-question check skipped because the lesson did not select that question type.
- All 34 additional browser interaction checks passed, with no browser exceptions.
- The 64 final screenshot configurations have no measured horizontal overflow, targets below 44 pt or unlabelled controls. A visual review caught a clipped Swedish Achievements title at 320 px/200% text; `ScreenHeader` now allows its title to shrink and wrap. Eight [header rechecks](header-check/report.json) passed and the corrected captures are included in `accessible/`.
- [Machine-readable validation summary](verification-summary.json).

This is the real Expo web bundle in Chromium. Browser text enlargement is not native Dynamic Type. Native frame timing, haptics, VoiceOver/TalkBack and iOS/Android rendering still require device verification. No part of this was seen on a phone.
